import type { VendorBill, VendorBillLine, VendorBillStatus } from "@/lib/domain";
import type { ProjectScopedRepository, NewOf, PatchOf } from "./base";

export interface VendorBillRepository extends ProjectScopedRepository<VendorBill> {
  listBySupplier(supplier_id: string): Promise<VendorBill[]>;
  listByStatus(status: VendorBillStatus): Promise<VendorBill[]>;
  listLines(): Promise<VendorBillLine[]>;
  listLinesByProject(project_id: string): Promise<VendorBillLine[]>;
  listLinesByBill(vendor_bill_id: string): Promise<VendorBillLine[]>;
  createLine(input: NewOf<VendorBillLine>): Promise<VendorBillLine>;
  updateLine(id: string, patch: PatchOf<VendorBillLine>): Promise<VendorBillLine>;
  removeLine(id: string): Promise<void>;
}
