import { getRepositories } from "@/lib/data";
import type { Project, User } from "@/lib/domain";
import type { QueryScope } from "./types";



/** Every project this user is posted to, in catalog order. */
export async function getAssignedProjects(user: User | null): Promise<Project[]> {
  if (!user) return [];
  const projects = await getRepositories().projects.list();
  return projects.filter((p) => user.assigned_project_ids.includes(p.id));
}

/** Builds the scope a query runs under, narrowed by an optional filter. */
export function scopeFor(user: User, project_id?: string | null): QueryScope {
  const assigned = user.assigned_project_ids;
  return {
    role: user.role,
    user_id: user.id,
    project_ids: project_id && assigned.includes(project_id) ? [project_id] : assigned,
  };
}

/** Restricts a list of project-scoped rows to the scope. */
export function inScope<T extends { project_id: string }>(rows: T[], scope: QueryScope): T[] {
  const ids = new Set(scope.project_ids);
  return rows.filter((r) => ids.has(r.project_id));
}
