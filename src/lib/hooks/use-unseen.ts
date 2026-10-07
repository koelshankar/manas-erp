"use client";

import { useCallback, useEffect, useMemo } from "react";
import { getUnseenItems, scopeFor, seenKey } from "@/lib/services/queries";
import type { ActionItem } from "@/lib/services/queries";
import { markSeen } from "@/lib/services/seen-service";
import { useSession } from "@/lib/session";
import { useActor } from "./use-service-action";
import { useRepositoryQuery } from "./use-repository";

const NONE: ActionItem[] = [];

/**
 * What is waiting on the current user and not yet opened.
 *
 * `has(type, id)` is what a list row asks; `count` and `countByType` are what
 * the nav badges read. Everything comes from one query, so a badge and the bold
 * row it counts cannot disagree.
 */
export function useUnseen() {
  const { user, role } = useSession();
  const { data } = useRepositoryQuery<ActionItem[]>(
    async () => (user ? getUnseenItems(scopeFor(user)) : []),
    [user?.id, role],
  );
  const items = data ?? NONE;

  const keys = useMemo(() => new Set(items.map((i) => seenKey(i.entity_type, i.entity_id))), [items]);
  const has = useCallback(
    (entity_type: string, entity_id: string) => keys.has(seenKey(entity_type, entity_id)),
    [keys],
  );
  const countFor = useCallback(
    (entityTypes: readonly string[]) => items.filter((i) => entityTypes.includes(i.entity_type)).length,
    [items],
  );
  // The Approvals entry counts what is waiting for a decision, not everything
  // that is bold (an unacknowledged drawing transmittal is not an approval).
  const approvalCount = useMemo(
    () => items.filter((i) => i.action?.kind === "review_approve").length,
    [items],
  );
  return { items, count: items.length, approvalCount, has, countFor };
}

/**
 * Marks a document seen by the current user once its detail view is open.
 * Pass null while nothing is open.
 */
export function useMarkSeen(entity_type: string | null, entity_id: string | null | undefined) {
  const actor = useActor();
  useEffect(() => {
    if (!entity_type || !entity_id || !actor.user_id) return;
    // A document type that carries no unseen mark is simply not tracked.
    void markSeen(
      { entity_type: entity_type as Parameters<typeof markSeen>[0]["entity_type"], entity_id },
      actor,
    ).catch(() => {});
  }, [entity_type, entity_id, actor.user_id, actor.role]); // eslint-disable-line react-hooks/exhaustive-deps
}
