import { z, type ZodType, type ZodTypeAny } from "zod";

/**
 * Convertisseur JSON-Schema → Zod (runtime), volontairement limité aux cas
 * courants d'OpenAPI en lecture (PRD §6.2 : « Gère les cas courants »).
 * Le schéma reçu est supposé DÉRÉFÉRENCÉ (aucun $ref restant).
 */

export interface JsonSchema {
  type?: string | string[];
  format?: string;
  enum?: unknown[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  nullable?: boolean;
  description?: string;
  oneOf?: JsonSchema[];
  anyOf?: JsonSchema[];
  allOf?: JsonSchema[];
}

function primitiveToZod(schema: JsonSchema): ZodTypeAny {
  // enum : on accepte la liste telle quelle.
  if (schema.enum && schema.enum.length > 0) {
    const literals = schema.enum.map((v) => z.literal(v as string | number | boolean));
    if (literals.length === 1) return literals[0];
    return z.union(literals as unknown as [ZodTypeAny, ZodTypeAny, ...ZodTypeAny[]]);
  }

  const type = Array.isArray(schema.type) ? schema.type.find((t) => t !== "null") : schema.type;

  switch (type) {
    case "string":
      return z.string();
    case "integer":
      return z.number().int();
    case "number":
      return z.number();
    case "boolean":
      return z.boolean();
    case "array":
      return z.array(schema.items ? jsonSchemaToZod(schema.items) : z.unknown());
    case "object":
      return objectToZod(schema);
    default:
      // Type inconnu/absent → on n'impose rien (passthrough).
      return z.unknown();
  }
}

function objectToZod(schema: JsonSchema): ZodTypeAny {
  if (!schema.properties) return z.record(z.unknown());
  const required = new Set(schema.required ?? []);
  const shape: Record<string, ZodTypeAny> = {};
  for (const [key, propSchema] of Object.entries(schema.properties)) {
    let field = jsonSchemaToZod(propSchema);
    if (!required.has(key)) field = field.optional();
    shape[key] = field;
  }
  return z.object(shape);
}

export function jsonSchemaToZod(schema: JsonSchema): ZodType {
  // Combinateurs : on simplifie en union (oneOf/anyOf) ou merge naïf (allOf).
  if (schema.oneOf || schema.anyOf) {
    const variants = (schema.oneOf ?? schema.anyOf ?? []).map(jsonSchemaToZod);
    if (variants.length === 1) return variants[0];
    if (variants.length >= 2) {
      return z.union(variants as [ZodTypeAny, ZodTypeAny, ...ZodTypeAny[]]);
    }
    return z.unknown();
  }
  if (schema.allOf && schema.allOf.length > 0) {
    // Merge des propriétés des sous-objets (cas courant).
    const merged: JsonSchema = { type: "object", properties: {}, required: [] };
    for (const sub of schema.allOf) {
      Object.assign(merged.properties!, sub.properties ?? {});
      merged.required!.push(...(sub.required ?? []));
    }
    return objectToZod(merged);
  }

  let zod = primitiveToZod(schema);
  const isNullable =
    schema.nullable === true || (Array.isArray(schema.type) && schema.type.includes("null"));
  if (isNullable) zod = zod.nullable();
  return zod;
}
