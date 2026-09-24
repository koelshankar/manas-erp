import type { Project } from "@/lib/domain";
import type { CrudRepository } from "./base";

export interface ProjectRepository extends CrudRepository<Project> {
  getByCode(code: string): Promise<Project | null>;
}
