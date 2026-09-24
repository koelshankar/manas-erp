import type { PoLine, PoStatus, PurchaseOrder } from "@/lib/domain";
import type { ProjectScopedRepository, NewOf, PatchOf } from "./base";

export interface PurchaseOrderRepository extends ProjectScopedRepository<PurchaseOrder> {
  listBySupplier(supplier_id: string): Promise<PurchaseOrder[]>;
  listByStatus(status: PoStatus): Promise<PurchaseOrder[]>;
  listByComparative(comparative_id: string): Promise<PurchaseOrder[]>;
  listLines(): Promise<PoLine[]>;
  listLinesByProject(project_id: string): Promise<PoLine[]>;
  listLinesByPo(purchase_order_id: string): Promise<PoLine[]>;
  listLinesByIndentLine(indent_line_id: string): Promise<PoLine[]>;
  createLine(input: NewOf<PoLine>): Promise<PoLine>;
  updateLine(id: string, patch: PatchOf<PoLine>): Promise<PoLine>;
  removeLine(id: string): Promise<void>;
}
