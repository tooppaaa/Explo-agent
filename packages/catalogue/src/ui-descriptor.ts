import { z } from "zod";

/**
 * Descripteurs UI (GenUI option A) — le sandbox les retourne dans `__ui`,
 * l'engine les VALIDE (règle dure §5) puis les passe au widget.
 *
 * Le schéma Zod est la source de vérité ; les types sont inférés.
 * packages/widget/src/ui-descriptor.ts duplique les TYPES (0 runtime, pas de
 * zod dans le bundle IIFE) — garder les deux en phase.
 */

const dataRow = z.record(z.string(), z.unknown());
const scalar = z.union([z.number(), z.string()]);

const cartesianFields = {
  data: z.array(dataRow),
  xKey: z.string(),
  valueKeys: z.array(z.string()).min(1),
  title: z.string().optional(),
};

export const uiDescriptorSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("bar-chart"), ...cartesianFields }),
  z.object({ type: z.literal("line-chart"), ...cartesianFields }),
  z.object({
    type: z.literal("pie-chart"),
    data: z.array(dataRow),
    nameKey: z.string(),
    valueKey: z.string(),
    title: z.string().optional(),
  }),
  z.object({
    type: z.literal("table"),
    data: z.array(dataRow),
    title: z.string().optional(),
  }),
  z.object({
    type: z.literal("metric"),
    label: z.string(),
    value: scalar,
    unit: z.string().optional(),
    trend: z.enum(["up", "down", "neutral"]).optional(),
  }),
  z.object({
    type: z.literal("metric-grid"),
    items: z.array(
      z.object({ label: z.string(), value: scalar, unit: z.string().optional() }),
    ),
    title: z.string().optional(),
  }),
  z.object({
    type: z.literal("button"),
    label: z.string(),
    /** Message envoyé au chat quand le bouton est cliqué. */
    action: z.string(),
  }),
]);

export type UiDescriptor = z.infer<typeof uiDescriptorSchema>;

/** Valide un `__ui` non fiable. Renvoie le descripteur ou `undefined`. */
export function parseUiDescriptor(value: unknown): UiDescriptor | undefined {
  const res = uiDescriptorSchema.safeParse(value);
  return res.success ? res.data : undefined;
}
