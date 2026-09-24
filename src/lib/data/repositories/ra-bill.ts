import type { RaBill, RaBillLine, RaBillRevision, RaBillStatus } from "@/lib/domain";
import type { ProjectScopedRepository, NewOf, PatchOf } from "./base";

export interface RaBillRepository extends ProjectScopedRepository<RaBill> {
  listByStatus(status: RaBillStatus): Promise<RaBill[]>;
  listByWorkOrder(work_order_id: string): Promise<RaBill[]>;
  listByContractor(contractor_id: string): Promise<RaBill[]>;

  listLines(): Promise<RaBillLine[]>;
  listLinesByProject(project_id: string): Promise<RaBillLine[]>;
  listLinesByBill(ra_bill_id: string): Promise<RaBillLine[]>;
  listLinesByWorkOrderLine(work_order_line_id: string): Promise<RaBillLine[]>;
  createLine(input: NewOf<RaBillLine>): Promise<RaBillLine>;
  updateLine(id: string, patch: PatchOf<RaBillLine>): Promise<RaBillLine>;
  removeLine(id: string): Promise<void>;

  /** Append-only audit of certified-quantity changes inside the C3-C4 chain. */
  listRevisions(): Promise<RaBillRevision[]>;
  listRevisionsByBill(ra_bill_id: string): Promise<RaBillRevision[]>;
  createRevision(input: NewOf<RaBillRevision>): Promise<RaBillRevision>;
}
