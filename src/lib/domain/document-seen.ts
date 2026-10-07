import { z } from "zod";
import { base_entity_shape } from "./primitives";

/**
 * Which documents carry an "unseen" mark. A document is unseen for a user while
 * it is waiting on them and they have not yet opened it; there is no such thing
 * as an unseen document that is nobody's business, which is what keeps seventeen
 * months of closed history from showing up bold.
 */
export const SEEN_ENTITY_TYPES = [
  "indent",
  "comparative",
  "purchase_order",
  "gate_pass",
  "ra_bill",
  "transmittal",
  "material_transfer",
] as const;
export const seenEntityTypeSchema = z.enum(SEEN_ENTITY_TYPES);
export type SeenEntityType = (typeof SEEN_ENTITY_TYPES)[number];

export function isSeenEntityType(value: string): value is SeenEntityType {
  return (SEEN_ENTITY_TYPES as readonly string[]).includes(value);
}

/**
 * One row per (user, document): this user has opened this document. Per user,
 * not per role — two people who share a role each have their own inbox.
 */
export const documentSeenSchema = z.object({
  ...base_entity_shape,
  user_id: z.string(),
  entity_type: seenEntityTypeSchema,
  entity_id: z.string(),
  seen_at: z.string(),
});
export type DocumentSeen = z.infer<typeof documentSeenSchema>;
