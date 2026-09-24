"use client";

import { useMemo } from "react";
import type { Project } from "@/lib/domain";
import { scopeFor, type QueryScope } from "@/lib/services/queries";
import { useSession } from "@/lib/session";
import { useActiveProject } from "./use-active-project";
import { useAllRows } from "./use-repository";

/**
 * Who is looking and at what.
 *
 * The scope is the user's posting, narrowed by the project switcher in the top
 * bar — the same choice every project list follows, so the dashboard and the
 * lists can never disagree about which site is in view. Every dashboard query
 * runs through it.
 */
export function useDashboardScope() {
  const { user } = useSession();
  const projects = useAllRows("projects") as Project[];
  const { projectId, isAll, multiProject } = useActiveProject();

  const assigned = useMemo(
    () => projects.filter((p) => user?.assigned_project_ids.includes(p.id) ?? false),
    [projects, user],
  );

  // A single-project role has nothing to narrow; its scope is its posting.
  const selectedProjectId = multiProject && !isAll ? projectId : null;

  const scope: QueryScope | null = useMemo(() => {
    if (!user) return null;
    return scopeFor(user, selectedProjectId);
  }, [user, selectedProjectId]);

  return {
    user,
    scope,
    /** Projects the user is posted to. */
    assignedProjects: assigned,
    /** The one project in view, or null for the whole posting. */
    selectedProjectId,
  };
}
