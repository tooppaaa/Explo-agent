import OpenAPIParser from "@readme/openapi-parser";
import { z, type ZodTypeAny } from "zod";
import { jsonSchemaToZod, type JsonSchema } from "./json-schema-to-zod.js";
import type { HttpMethod, Operation, ParamLocation } from "./types.js";

/**
 * Catalogue builder (PRD §6.2).
 * Parse + déréférence une spec OpenAPI 3.0/3.1, produit des Operation[].
 *
 * Toutes les méthodes (GET, POST, PUT, PATCH, DELETE) sont indexées.
 * Les opérations mutantes (POST/PUT/PATCH/DELETE) ont `mutating: true` ;
 * elles sont bloquées par le HostBridge jusqu'à confirmation explicite (mode intent).
 */

const MUTATING_METHODS = new Set(["post", "put", "patch", "delete"]);

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
  responses?: Record<string, { content?: Record<string, { schema?: JsonSchema }> }>;
  ["x-mutating"]?: boolean;
}

function slugify(method: string, path: string): string {
  const cleaned = path.replace(/[/{}]/g, " ").trim().split(/\s+/).join("_");
  return `${method}_${cleaned}`;
}

/** Profondeur max de récursion : protège contre les schémas (déréférencés)
 * circulaires/auto-référents et borne la taille du type généré. */
const MAX_TS_DEPTH = 8;

function tsTypeFromSchema(schema: JsonSchema | undefined, depth = 0): string {
  if (!schema) return "unknown";
  if (depth >= MAX_TS_DEPTH) return "unknown";

  if (schema.enum && schema.enum.length > 0) {
    return schema.enum.map((v) => JSON.stringify(v)).join(" | ");
  }

  // Compositions OpenAPI : oneOf/anyOf → union, allOf → intersection.
  if (schema.oneOf?.length) return schema.oneOf.map((s) => tsTypeFromSchema(s, depth + 1)).join(" | ");
  if (schema.anyOf?.length) return schema.anyOf.map((s) => tsTypeFromSchema(s, depth + 1)).join(" | ");
  if (schema.allOf?.length) return schema.allOf.map((s) => tsTypeFromSchema(s, depth + 1)).join(" & ");

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
      return `${tsTypeFromSchema(schema.items, depth + 1)}[]`;
    case "object": {
      if (!schema.properties) return "Record<string, unknown>";
      const fields = Object.entries(schema.properties).map(([k, v]) => {
        const optional = schema.required?.includes(k) ? "" : "?";
        return `${k}${optional}: ${tsTypeFromSchema(v, depth + 1)}`;
      });
      return `{ ${fields.join("; ")} }`;
    }
    default:
      // Objet sans `type` mais avec des propriétés (fréquent en OpenAPI).
      if (schema.properties) {
        const fields = Object.entries(schema.properties).map(([k, v]) => {
          const optional = schema.required?.includes(k) ? "" : "?";
          return `${k}${optional}: ${tsTypeFromSchema(v, depth + 1)}`;
        });
        return `{ ${fields.join("; ")} }`;
      }
      return "unknown";
  }
}

/** Extrait le type TS de la réponse de succès (2xx, sinon `default`). */
function extractResponseType(op: OpenAPIOperationObject): string {
  const responses = op.responses ?? {};
  const key =
    Object.keys(responses).find((k) => /^2\d\d$/.test(k)) ??
    (responses.default ? "default" : undefined);
  if (!key) return "unknown";
  const schema = responses[key]?.content?.["application/json"]?.schema;
  return tsTypeFromSchema(schema);
}

/**
 * Construit la signature TS lisible + le schéma Zod des args + les
 * emplacements de paramètres pour le dispatch HTTP.
 */
function buildArgs(
  op: OpenAPIOperationObject,
): { argsType: string; schema: ZodTypeAny; params: ParamLocation[]; hasBody: boolean } {
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
  // Les args sont un objet ; vide → objet vide accepté.
  const schema = z.object(shape);
  return { argsType, schema, params, hasBody };
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
      if (!["get", "post", "put", "patch", "delete"].includes(method)) continue;

      const op = opObj;
      const mutating = op["x-mutating"] ?? MUTATING_METHODS.has(method);

      const operationId = op.operationId ?? slugify(method, pathTemplate);
      const fullName = `${opts.providerName}.${operationId}`;
      const { argsType, schema, params, hasBody } = buildArgs(op);
      const responseType = extractResponseType(op);
      const signature = `${fullName}(args: ${argsType}): Promise<${responseType}>`;

      operations.push({
        name: fullName,
        description: op.summary ?? op.description ?? "",
        signature,
        responseType,
        schema,
        mutating,
        provider: opts.providerName,
        http: { method, pathTemplate, params, hasBody },
      });
    }
  }

  return operations;
}
