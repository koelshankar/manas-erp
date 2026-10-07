import { getRepositories } from "@/lib/data";
import { isSeenEntityType } from "@/lib/domain";
import { getActionItems } from "./action-items";
import type { ActionItem, QueryScope } from "./types";

/** The key a document is remembered by. */
export function seenKey(entity_type: string, entity_id: string): string {
  return `${entity_type}:${entity_id}`;
}

/**
 * Documents waiting on this user that they have not yet opened.
 *
 * Unseen is defined against the action queue, not against every document: a
 * closed purchase order from last year was never anybody's to read, so it is
 * never bold. Per user — the seen rows are the user's own.
 */
export async function getUnseenItems(scope: QueryScope): Promise<ActionItem[]> {
  const repos = getRepositories();
  const [items, seenRows] = await Promise.all([
    getActionItems(scope),
    repos.documentSeen.listByUser(scope.user_id),
  ]);
  const seen = new Set(seenRows.map((r) => seenKey(r.entity_type, r.entity_id)));
  return items.filter(
    (i) =>
      i.track_seen &&
      isSeenEntityType(i.entity_type) &&
      !seen.has(seenKey(i.entity_type, i.entity_id)),
  );
}
