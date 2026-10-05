import type {
  PoAmendment,
  PoDeliverySchedule,
  PoDeliveryScheduleLine,
  PoLine,
  PoStatus,
  PoTerm,
  PurchaseOrder,
} from "@/lib/domain";
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

  /* Delivery schedules (B3). A PO may carry several. */
  listSchedulesByPo(purchase_order_id: string): Promise<PoDeliverySchedule[]>;
  createSchedule(input: NewOf<PoDeliverySchedule>): Promise<PoDeliverySchedule>;
  updateSchedule(id: string, patch: PatchOf<PoDeliverySchedule>): Promise<PoDeliverySchedule>;
  removeSchedule(id: string): Promise<void>;
  listScheduleLinesByPo(purchase_order_id: string): Promise<PoDeliveryScheduleLine[]>;
  listScheduleLinesBySchedule(schedule_id: string): Promise<PoDeliveryScheduleLine[]>;
  createScheduleLine(input: NewOf<PoDeliveryScheduleLine>): Promise<PoDeliveryScheduleLine>;
  removeScheduleLine(id: string): Promise<void>;

  /* Terms snapshotted from the clause library. */
  listTermsByPo(purchase_order_id: string): Promise<PoTerm[]>;
  createTerm(input: NewOf<PoTerm>): Promise<PoTerm>;
  removeTerm(id: string): Promise<void>;

  /* Amendment history. Append-only. */
  listAmendmentsByPo(purchase_order_id: string): Promise<PoAmendment[]>;
  createAmendment(input: NewOf<PoAmendment>): Promise<PoAmendment>;
}
