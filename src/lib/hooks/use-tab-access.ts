"use client";

import { useMemo } from "react";
import type { Role } from "@/lib/domain";
import {
  projectNavFor,
  type Resource,
  type RoleTabAccess,
  type WorkspaceTabKey,
} from "@/config/permissions";
import { WORKSPACE_TABS, type WorkspaceTab } from "@/components/shell/nav-config";
import { resolveTabAccess, useTabAccessStore } from "@/lib/access/tab-access-store";

/** The role x tab matrix as it currently stands, seed plus any Masters edits. */
export function useTabAccess(role: Role): RoleTabAccess {
  const overlay = useTabAccessStore((s) => s.overlay);
  return useMemo(() => resolveTabAccess(role, overlay), [role, overlay]);
}

/** The whole matrix, for the Masters screen. */
export function useTabMatrix(): (role: Role) => RoleTabAccess {
  const overlay = useTabAccessStore((s) => s.overlay);
  return useMemo(() => (role: Role) => resolveTabAccess(role, overlay), [overlay]);
}

export function useSetTabAccess() {
  return useTabAccessStore((s) => s.setTab);
}

export function useResetTabMatrix() {
  return useTabAccessStore((s) => s.resetMatrix);
}

/**
 * The workspace tabs a role sees, each cut down to the pages relevant to them.
 *
 * Two filters, in order: the matrix decides whether the tab appears at all,
 * and PROJECT_NAV decides which of its pages are listed. A tab the matrix
 * allows but which holds no page for this role is dropped — an empty tab asks
 * a question it cannot answer. Overview has no pages and is governed by the
 * matrix alone.
 *
 * Hooks must return stable identities (rule 11), hence the memo.
 */
export function useWorkspaceTabs(role: Role): WorkspaceTab[] {
  const access = useTabAccess(role);
  return useMemo(() => {
    const visible: Resource[] = projectNavFor(role);
    return WORKSPACE_TABS.filter((tab) => access[tab.key as WorkspaceTabKey])
      .map((tab) => ({
        ...tab,
        pages: tab.pages.filter((page) => visible.includes(page.resource)),
      }))
      .filter((tab) => tab.key === "overview" || tab.pages.length > 0);
  }, [role, access]);
}
