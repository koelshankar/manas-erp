"use client";

import { useEffect, useMemo, useState } from "react";
import type { Project } from "@/lib/domain";
import { scopeFor, type QueryScope } from "@/lib/services/queries";
import { useSession } from "@/lib/session";
import { useAllRows } from "./use-repository";

const ALL = "__all__";

/**
 * Who is looking and at what.
 *
 * The scope is the user's posting, optionally narrowed by the dashboard's
 * project filter. Every dashboard query runs through it.
 */
export function useDashboardScope() {
  const { user } = useSession();
  const projects = useAllRows("projects") as Project[];
  const [selected, setSelected] = useState<string>(ALL);

  const assigned = useMemo(
    () => projects.filter((p) => user?.assigned_project_ids.includes(p.id) ?? false),
    [projects, user],
  );

  // A filter set on one role's dashboard must not survive a role switch.
  useEffect(() => {
    if (selected !== ALL && !assigned.some((p) => p.id === selected)) setSelected(ALL);
  }, [assigned, selected]);

  const scope: QueryScope | null = useMemo(() => {
    if (!user) return null;
    return scopeFor(user, selected === ALL ? null : selected);
  }, [user, selected]);

  return {
    user,
    scope,
    /** Projects the user is posted to, for the filter. */
    assignedProjects: assigned,
    selectedProjectId: selected === ALL ? null : selected,
    filterValue: selected,
    setFilter: setSelected,
    ALL,
  };
}
