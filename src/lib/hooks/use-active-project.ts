"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isSingleProjectRole } from "@/config/permissions";
import { useSession } from "@/lib/session";
import { useAllRows } from "./use-repository";
import type { Project } from "@/lib/domain";

const STORAGE_KEY = "manas-erp-active-project";

/**
 * "All my projects" — the default for a role posted to more than one site.
 *
 * The switcher filters rather than restricts (audit QH3): a QS Head covering
 * three projects opened a bill list and silently saw one of them. The route
 * still carries a project id, because the workspace header and tabs need an
 * anchor, but the lists widen to the whole posting.
 */
export const ALL_PROJECTS = "__all__";

function projectIdFromPath(pathname: string): string | null {
  const m = /^\/projects\/([^/]+)/.exec(pathname);
  return m ? m[1] : null;
}

function storedProjectId(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Which project the role-based top bar points at.
 *
 * Site Engineer and Project QS are posted to one site, so there is nothing to
 * choose and no picker is shown. The portfolio roles pick from the switcher in
 * the bar, and the choice is remembered.
 *
 * The URL always wins: standing on a project page means that is the project,
 * whatever was last chosen. Never widens beyond `assigned_project_ids`.
 */
export function useActiveProject(): {
  /** The route's anchor project. Always one id, even in "all" mode. */
  projectId: string;
  project: Project | null;
  /** Projects this user may switch between. One entry means no picker. */
  options: Project[];
  /** What the switcher currently holds: a project id, or ALL_PROJECTS. */
  selection: string;
  setProjectId: (id: string) => void;
  /** True when lists should span the whole posting. */
  isAll: boolean;
  /** Every project a list should cover right now. */
  scopeProjectIds: string[];
  /** True when this role is posted to more than one project. */
  multiProject: boolean;
  /** True while the store is still hydrating and there is no project yet. */
  pending: boolean;
} {
  const pathname = usePathname();
  const router = useRouter();
  const { role, assigned_project_ids } = useSession();
  const allProjects = useAllRows("projects") as Project[];

  const options = useMemo(
    () => allProjects.filter((p) => assigned_project_ids.includes(p.id)),
    [allProjects, assigned_project_ids],
  );

  const projectId = useMemo(() => {
    const fromPath = projectIdFromPath(pathname ?? "");
    if (fromPath && assigned_project_ids.includes(fromPath)) return fromPath;
    if (fromPath) return fromPath; // opened from a link outside the posting
    if (isSingleProjectRole(role)) return assigned_project_ids[0] ?? "";
    const stored = typeof window === "undefined" ? null : storedProjectId();
    if (stored && assigned_project_ids.includes(stored)) return stored;
    return assigned_project_ids[0] ?? "";
  }, [pathname, assigned_project_ids, role]);

  const multiProject = !isSingleProjectRole(role) && assigned_project_ids.length > 1;

  // Read back on every render rather than in state: the switcher writes it and
  // navigation re-runs this hook, so there is nothing to keep in sync.
  const stored = typeof window === "undefined" ? null : storedProjectId();
  const isAll = multiProject && (stored ?? ALL_PROJECTS) === ALL_PROJECTS;

  const setProjectId = useCallback(
    (id: string) => {
      try {
        window.localStorage.setItem(STORAGE_KEY, id);
      } catch {
        // Losing the memory of the choice is not worth failing over.
      }
      const current = projectIdFromPath(pathname ?? "");
      // "All" keeps the page it is on and widens the data under it.
      if (current && id !== ALL_PROJECTS) {
        router.push((pathname ?? "").replace(`/projects/${current}`, `/projects/${id}`));
      } else {
        router.refresh();
      }
    },
    [pathname, router],
  );

  return {
    projectId,
    project: options.find((p) => p.id === projectId) ?? null,
    options,
    selection: isAll ? ALL_PROJECTS : projectId,
    setProjectId,
    isAll,
    scopeProjectIds: isAll ? assigned_project_ids : projectId ? [projectId] : [],
    multiProject,
    pending: projectId === "",
  };
}
