import type { Grn, GrnLine } from "@/lib/domain";
import type { ProjectScopedRepository, NewOf, PatchOf } from "./base";

export interface GrnRepository extends ProjectScopedRepository<Grn> {
  listByPo(purchase_order_id: string): Promise<Grn[]>;
  listLines(): Promise<GrnLine[]>;
  listLinesByProject(project_id: string): Promise<GrnLine[]>;
  listLinesByGrn(grn_id: string): Promise<GrnLine[]>;
  createLine(input: NewOf<GrnLine>): Promise<GrnLine>;
  updateLine(id: string, patch: PatchOf<GrnLine>): Promise<GrnLine>;
  removeLine(id: string): Promise<void>;
}
