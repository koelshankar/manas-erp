import type { ProgrammeTask } from "@/lib/domain";
import type { ProjectScopedRepository } from "./base";

export interface ProgrammeRepository extends ProjectScopedRepository<ProgrammeTask> {
  listByProject(project_id: string): Promise<ProgrammeTask[]>;
  /**
   * Import replaces the whole programme for a project in one write.
   *
   * The caller assigns `id` itself (and any `parent_id` pointing at a
   * sibling in the same batch) — a hierarchy has to know a parent's id
   * before its children can be written, which this repository cannot
   * generate for it.
   */
  replaceForProject(
    project_id: string,
    tasks: Array<Omit<ProgrammeTask, "created_at" | "updated_at">>,
  ): Promise<ProgrammeTask[]>;
}
