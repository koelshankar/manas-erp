import { getRepositories } from "@/lib/data";
import type { StockLedgerEntry, StockMovementType } from "@/lib/domain";
import { qty } from "./guards";

/**
 * The one writer of a stock movement.
 *
 * Six services move stock now — the GRN, the material issue, both ends of a
 * transfer order, and both directions of a gate pass — and each of them used
 * to work out the running balance for itself. One of them getting the
 * arithmetic wrong is the kind of bug nobody finds until a storeman asks why
 * the ledger does not add up, so the balance is computed here and nowhere
 * else.
 *
 * `balance_quantity` is the running balance **for this store and this
 * material**. It is per store rather than per project because that is the
 * question the Stores tab asks: a project with two stores cannot answer "what
 * is in the yard" from a figure that pooled both. On a single-store project it
 * is the same number it always was.
 */
export type StockMovementInput = {
  project_id: string;
  store_id: string;
  material_id: string;
  movement_type: StockMovementType;
  movement_date: string;
  /** One of these is zero. A movement goes one way. */
  quantity_in: number;
  quantity_out: number;
  /** Receipts carry the PO rate; issues the weighted average. Null where there is none. */
  rate: number | null;
  value: number;
  source_entity_type: string;
  source_entity_id: string;
  remarks: string;
};

export async function postStockMovement(input: StockMovementInput): Promise<StockLedgerEntry> {
  const repos = getRepositories();
  const before = await storeStockOnHand(input.store_id, input.material_id);
  return repos.stock.create({
    ...input,
    quantity_in: qty(input.quantity_in),
    quantity_out: qty(input.quantity_out),
    balance_quantity: qty(before + input.quantity_in - input.quantity_out),
  });
}

/** What one store holds of one material right now. */
export async function storeStockOnHand(store_id: string, material_id: string): Promise<number> {
  const rows = await getRepositories().stock.listByStore(store_id);
  return qty(
    rows
      .filter((e) => e.material_id === material_id)
      .reduce((sum, e) => sum + e.quantity_in - e.quantity_out, 0),
  );
}
