"use client";

import {
  can,
  isReadOnly,
  ownerTeamOf,
  RESOURCE_META,
  teamOf,
  viewingOtherTeamRecord,
  type Resource,
} from "@/config/permissions";
import { useSession } from "@/lib/session";

export type Access = {
  role: import("@/lib/domain").Role;
  /** The team the current role belongs to. */
  team: import("@/lib/domain").Team;
  /** The team that owns this resource on the workflow chart. */
  ownerTeam: import("@/lib/domain").Team;
  /** True when the current role's team owns this resource. */
  owned: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canApprove: boolean;
  /** False hides money columns — e.g. the Site Engineer on PO values. */
  showValues: boolean;
  /** True when the role has no mutating grant at all: page renders read-only. */
  readOnly: boolean;
  /**
   * True when this project page is outside the role's own workspace navigation.
   * The page opens exactly as before — this only drives the note in the header.
   */
  outsideNav: boolean;
  meta: (typeof RESOURCE_META)[Resource];
};

/**
 * The only way a component may ask "what can I do here?".
 * Everything resolves through src/config/permissions.ts.
 */
export function useAccess(resource: Resource): Access {
  const { role } = useSession();
  const ownerTeam = ownerTeamOf(resource);
  return {
    role,
    team: teamOf(role),
    ownerTeam,
    owned: teamOf(role) === ownerTeam,
    canCreate: can(role, "create", resource),
    canEdit: can(role, "edit", resource),
    canDelete: can(role, "delete", resource),
    canApprove: can(role, "approve", resource),
    showValues: can(role, "view_values", resource),
    readOnly: isReadOnly(role, resource),
    outsideNav: viewingOtherTeamRecord(role, resource),
    meta: RESOURCE_META[resource],
  };
}
