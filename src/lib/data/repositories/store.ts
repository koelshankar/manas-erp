import type { Store } from "@/lib/domain";
import type { ProjectScopedRepository } from "./base";

export interface StoreRepository extends ProjectScopedRepository<Store> {
  /** The store a GRN lands in when nobody is asked. */
  primaryForProject(project_id: string): Promise<Store | null>;
  getByCode(code: string): Promise<Store | null>;
}
