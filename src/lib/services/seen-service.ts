import { z } from "zod";
import { getRepositories } from "@/lib/data";
import { SEEN_ENTITY_TYPES, type DocumentSeen } from "@/lib/domain";
import { now } from "@/lib/clock";
import { parseInput } from "./guards";
import type { ActingUser } from "./types";

export const markSeenInput = z.object({
  entity_type: z.enum(SEEN_ENTITY_TYPES),
  entity_id: z.string().min(1),
});
export type MarkSeenInput = z.input<typeof markSeenInput>;

/**
 * Records that this user has opened this document.
 *
 * Idempotent and unconditional: anyone may open anything they can navigate to,
 * so there is no grant to check, and opening it twice is not an error. The row
 * belongs to the user, never the role — the second Purchase Officer's inbox is
 * their own.
 */
export async function markSeen(input: MarkSeenInput, actor: ActingUser): Promise<DocumentSeen> {
  const data = parseInput(markSeenInput, input);
  const repos = getRepositories();
  const mine = await repos.documentSeen.listByUser(actor.user_id);
  const existing = mine.find(
    (r) => r.entity_type === data.entity_type && r.entity_id === data.entity_id,
  );
  if (existing) return existing;
  return repos.documentSeen.create({
    user_id: actor.user_id,
    entity_type: data.entity_type,
    entity_id: data.entity_id,
    seen_at: now(),
  });
}
