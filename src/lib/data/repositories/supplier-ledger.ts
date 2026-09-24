import type { SupplierLedgerEntry } from "@/lib/domain";
import type { CrudRepository } from "./base";

export interface SupplierLedgerRepository extends CrudRepository<SupplierLedgerEntry> {
  listBySupplier(supplier_id: string): Promise<SupplierLedgerEntry[]>;
  /** Net amount owed to a supplier: credits less debits. */
  balanceFor(supplier_id: string): Promise<number>;
}
