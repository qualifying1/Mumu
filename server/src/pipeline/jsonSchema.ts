import { z } from "zod";

/**
 * zod schema -> the JSON Schema we send as `responseJsonSchema`.
 * Gemini documents `enum` but not `const`, and zod emits a union of literals as
 * `anyOf: [{const: 1}, {const: 2}]`, so those become `{type, enum}`. `$schema` isn't in
 * Gemini's supported list either.
 */
export function geminiJsonSchema(schema: z.ZodType): unknown {
  const json = z.toJSONSchema(schema) as Record<string, unknown>;
  delete json.$schema;
  return rewriteConstUnions(json);
}

function rewriteConstUnions(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(rewriteConstUnions);
  if (node === null || typeof node !== "object") return node;
  const obj = node as Record<string, unknown>;

  const anyOf = obj.anyOf;
  if (Array.isArray(anyOf) && anyOf.length > 0 && anyOf.every((b) => b !== null && typeof b === "object" && "const" in (b as object))) {
    const values = anyOf.map((b) => (b as { const: unknown }).const);
    const types = new Set(values.map((v) => (Number.isInteger(v) ? "integer" : typeof v)));
    if (types.size !== 1) throw new Error(`geminiJsonSchema: mixed-type const union ${JSON.stringify(values)}`);
    const { anyOf: _dropped, ...rest } = obj;
    return { ...(rewriteConstUnions(rest) as object), type: [...types][0], enum: values };
  }

  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, rewriteConstUnions(v)]));
}
