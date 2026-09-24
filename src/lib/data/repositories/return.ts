import type { Return, ReturnStatus } from "@/lib/domain";
import type { ProjectScopedRepository } from "./base";

export interface ReturnRepository extends ProjectScopedRepository<Return> {
  listBySupplier(supplier_id: string): Promise<Return[]>;
  listByStatus(status: ReturnStatus): Promise<Return[]>;
  listByGrn(grn_id: string): Promise<Return[]>;
}
