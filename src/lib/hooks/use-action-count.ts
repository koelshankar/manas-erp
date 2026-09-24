"use client";

import { getActionItems, getSentBackCount, scopeFor } from "@/lib/services/queries";
import { inboxFor } from "@/config/permissions";
import { useSession } from "@/lib/session";
import { useRepositoryQuery } from "./use-repository";

/**
 * The number on the inbox item in the top bar.
 *
 * For an approver it is what is actually waiting on them; for a requester it
 * is what has come back needing rework. Both are "things only you can clear",
 * which is the only number worth a badge.
 */
export function useInboxCount(): number {
  const { user, role } = useSession();
  const { data } = useRepositoryQuery<number>(
    async () => {
      if (!user) return 0;
      const scope = scopeFor(user);
      if (inboxFor(role) === "my_requests") return getSentBackCount(scope);
      const items = await getActionItems(scope);
      return items.filter((i) => !i.read_only).length;
    },
    [user?.id, role],
  );
  return data ?? 0;
}
