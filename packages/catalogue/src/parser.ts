import OpenAPIParser from "@readme/openapi-parser";
import { z, type ZodTypeAny } from "zod";
import { jsonSchemaToZod, type JsonSchema } from "./json-schema-to-zod.js";
import type { HttpMethod, Operation, ParamLocation } from "./types.js";

/**
 * Catalogue builder (PRD §6.2).
 * Parse + déréférence une spec OpenAPI 3.0/3.1, produit des Operation[].
 *
 * M0 (brief) : OPÉRATIONS DE LECTURE UNIQUEMENT. On n'émet que les GET.
 * Le champ `mutating` reste sur le type pour rester compatible avec M4,
 * mais aucune op mutante n'est exposée en M0.
 */

const MUTATING_METHODS = new Set(["post", "put", "patch", "delete"]);
const READ_METHODS = new Set<HttpMethod>(["get"]);

interface OpenAPIParameter {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required?: boolean;
  description?: string;
  schema?: JsonSchema;
}

interface OpenAPIOperationObject {
  operationId?: string;
  summary?: string;
  description?: string;
  parameters?: OpenAPIParameter[];
  requestBody?: {
    required?: boolean;
    content?: Record<string, { schema?: JsonSchema }>;
  };
  ["x-mutating"]?: boolean;
}

function slugify(method: string, path: string): string {
  const cleaned = path.replace(/[/{}]/g, " ").trim().split(/\s+/).join("_");
  return `${method}_${cleaned}`;
}

function tsTypeFromSchema(schema: JsonSchema | undefined): string {
  if (!schema) return "unknown";
  if (schema.enum && schema.enum.length > 0) {
    return schema.enum.map((v) => JSON.stringify(v)).join(" | ");
  }
  const type = Array.isArray(schema.type) ? schema.type.find((t) => t !== "null") : schema.type;
  switch (type) {
    case "string":
      return "string";
    case "integer":
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "array":
      return `${tsTypeFromSchema(schema.items)}[]`;
    case "object": {
      if (!schema.properties) return "Record<string, unknown>";
      const fields = Object.entries(schema.properties).map(([k, v]) => {
        const optional = schema.required?.includes(k) ? "" : "?";
        return `${k}${optional}: ${tsTypeFromSchema(v)}`;
      });
      return `{ ${fields.join("; ")} }`;
    }
    default:
      return "unknown";
  }
}

/**
 * Construit la signature TS lisible + le schéma Zod des args + les
 * emplacements de paramètres pour le dispatch HTTP.
 */
function buildArgs(
  op: OpenAPIOperationObject,
  fullName: string,
): { signature: string; schema: ZodTypeAny; params: ParamLocation[]; hasBody: boolean } {
  const shape: Record<string, ZodTypeAny> = {};
  const sigFields: string[] = [];
  const params: ParamLocation[] = [];

  for (const p of op.parameters ?? []) {
    if (p.in === "cookie") continue; // non supporté en M0
    let field = jsonSchemaToZod(p.schema ?? {}) as ZodTypeAny;
    if (!p.required) field = field.optional();
    shape[p.name] = field;
    params.push({ name: p.name, in: p.in });
    const optional = p.required ? "" : "?";
    sigFields.push(`${p.name}${optional}: ${tsTypeFromSchema(p.schema)}`);
  }

  let hasBody = false;
  const bodySchema = op.requestBody?.content?.["application/json"]?.schema;
  if (bodySchema) {
    hasBody = true;
    let field = jsonSchemaToZod(bodySchema) as ZodTypeAny;
    if (!op.requestBody?.required) field = field.optional();
    shape["body"] = field;
    const optional = op.requestBody?.required ? "" : "?";
    sigFields.push(`body${optional}: ${tsTypeFromSchema(bodySchema)}`);
  }

  const argsType = sigFields.length > 0 ? `{ ${sigFields.join("; ")} }` : "{}";
  const signature = `${fullName}(args: ${argsType}): Promise<unknown>`;
  // Les args sont un objet ; vide → objet vide accepté.
  const schema = z.object(shape);
  return { signature, schema, params, hasBody };
}

export interface ParseOptions {
  /** Préfixe de namespace (= provider.name). */
  providerName: string;
}

export async function buildCatalogue(
  openapiPathOrUrl: string,
  opts: ParseOptions,
): Promise<Operation[]> {
  // Déréférence tous les $ref ; supporte 3.0 et 3.1.
  const api = (await OpenAPIParser.dereference(openapiPathOrUrl)) as {
    paths?: Record<string, Record<string, OpenAPIOperationObject>>;
  };

  const operations: Operation[] = [];
  const paths = api.paths ?? {};

  for (const [pathTemplate, pathItem] of Object.entries(paths)) {
    for (const [methodRaw, opObj] of Object.entries(pathItem)) {
      const method = methodRaw.toLowerCase() as HttpMethod;
      if (!READ_METHODS.has(method)) continue; // M0 : lecture uniquement

      const op = opObj;
      const mutating = op["x-mutating"] ?? MUTATING_METHODS.has(method);
      // En M0 on ne devrait jamais avoir mutating=true ici (filtré au-dessus),
      // mais on respecte un éventuel override x-mutating.
      if (mutating) continue;

      const operationId = op.operationId ?? slugify(method, pathTemplate);
      const fullName = `${opts.providerName}.${operationId}`;
      const { signature, schema, params, hasBody } = buildArgs(op, fullName);

      operations.push({
        name: fullName,
        description: op.summary ?? op.description ?? "",
        signature,
        schema,
        mutating: false,
        provider: opts.providerName,
        http: { method, pathTemplate, params, hasBody },
      });
    }
  }

  return operations;
}
