import { getRepositories } from "@/lib/data";
import type { LedgerEntryType } from "@/lib/domain";
import { rupees } from "./guards";

/** One row of a supplier's running account, with the balance carried forward. */
export type SupplierLedgerRow = {
  id: string;
  entry_date: string;
  entry_type: LedgerEntryType;
  reference_number: string;
  reference_type: string;
  reference_id: string;
  narration: string;
  debit: number;
  credit: number;
  balance: number;
};

export type SupplierLedgerSummary = {
  supplier_id: string;
  rows: SupplierLedgerRow[];
  total_credit: number;
  total_debit: number;
  /** Positive means we owe the supplier. */
  balance: number;
};

/**
 * A supplier's running account.
 *
 * Verified vendor bills credit the supplier (we owe them); debit notes raised
 * from returns debit them back. The balance is credits less debits.
 */
export async function supplierLedger(supplier_id: string): Promise<SupplierLedgerSummary> {
  const entries = await getRepositories().supplierLedger.listBySupplier(supplier_id);

  let running = 0;
  const rows = entries.map((e) => {
    running = rupees(running + e.credit - e.debit);
    return {
      id: e.id,
      entry_date: e.entry_date,
      entry_type: e.entry_type,
      reference_number: e.reference_number,
      reference_type: e.reference_type,
      reference_id: e.reference_id,
      narration: e.narration,
      debit: e.debit,
      credit: e.credit,
      balance: running,
    };
  });

  return {
    supplier_id,
    rows,
    total_credit: rupees(entries.reduce((s, e) => s + e.credit, 0)),
    total_debit: rupees(entries.reduce((s, e) => s + e.debit, 0)),
    balance: running,
  };
}

/** Balances for every supplier, for the ledger index screen. */
export async function allSupplierBalances(): Promise<
  Array<{ supplier_id: string; total_credit: number; total_debit: number; balance: number }>
> {
  const repos = getRepositories();
  const suppliers = await repos.suppliers.list();
  const entries = await repos.supplierLedger.list();

  return suppliers.map((s) => {
    const mine = entries.filter((e) => e.supplier_id === s.id);
    const total_credit = rupees(mine.reduce((t, e) => t + e.credit, 0));
    const total_debit = rupees(mine.reduce((t, e) => t + e.debit, 0));
    return { supplier_id: s.id, total_credit, total_debit, balance: rupees(total_credit - total_debit) };
  });
}
