import { getRepositories } from "@/lib/data";
import type { Store, StockMovementType } from "@/lib/domain";
import { qty } from "./guards";

/**
 * The stock position of a store: what came in, what went out, and by which
 * door.
 *
 * **Quantities only, by design.** Manas were explicit that no rupee figure
 * appears anywhere in Stores for any role, so this service does not return
 * one — not zeroed, not hidden on screen, simply not computed. The valuation
 * the business does need lives on the material issue line and reaches Budget
 * vs Actual through `budgetVsActual()`, which is the project manager's screen,
 * not the storeman's.
 *
 * It is **derived, not stored**. There is no stock master and no second
 * ledger: every row here is the sum of the movements the documents already
 * wrote — a GRN receipt, an issue to a contractor, both ends of a transfer
 * order, both directions of a gate pass. Nothing has to be rebuilt when a
 * document is written, and nothing can drift out of step with the documents.
 *
 * Written to become a SQL view: one `group by store_id, material_id` over the
 * movement table with a `filter` per movement type.
 */
export type StockPositionRow = {
  store_id: string;
  store_name: string;
  project_id: string;
  material_id: string;
  unit: string;
  received: number;
  issued: number;
  transferred_in: number;
  transferred_out: number;
  /** Out of the gate and not back yet. */
  on_gate_pass: number;
  returned_from_gate: number;
  balance: number;
  reorder_level: number;
  /** Below the material master's reorder level. The one tone this table carries. */
  low: boolean;
};

/** Which column of the position each movement kind feeds. */
const COLUMN_OF: Record<StockMovementType, keyof StockPositionRow> = {
  receipt: "received",
  issue: "issued",
  transfer_in: "transferred_in",
  transfer_out: "transferred_out",
  gate_pass_out: "on_gate_pass",
  gate_pass_return: "returned_from_gate",
  /* The two supplier-return kinds predate the Stores tab and are rare enough
     that they are folded into the receipt / issue columns rather than given
     two more columns nobody would read. The balance is unaffected either way. */
  return_to_supplier: "issued",
  return_from_site: "received",
};

/**
 * The position for one store, or for every store on a project when no store is
 * named. Materials with no movement at all are left out: a store's position is
 * what it has handled, not the whole master.
 */
export async function stockPositions(
  project_id: string,
  store_id?: string | null,
): Promise<StockPositionRow[]> {
  const repos = getRepositories();
  const [stores, entries, materials] = await Promise.all([
    repos.stores.listByProject(project_id),
    store_id
      ? repos.stock.listByStore(store_id)
      : repos.stock.listByProject(project_id),
    repos.materials.list(),
  ]);

  const storeById = new Map(stores.map((s) => [s.id, s]));
  const materialById = new Map(materials.map((m) => [m.id, m]));
  const rows = new Map<string, StockPositionRow>();

  for (const entry of entries) {
    const material = materialById.get(entry.material_id);
    if (!material) continue;
    const key = `${entry.store_id}:${entry.material_id}`;
    const row =
      rows.get(key) ??
      blankRow(entry.store_id, storeById.get(entry.store_id), project_id, material);
    const column = COLUMN_OF[entry.movement_type];
    const moved = entry.quantity_in + entry.quantity_out;
    (row[column] as number) += moved;
    row.balance += entry.quantity_in - entry.quantity_out;
    rows.set(key, row);
  }

  return [...rows.values()]
    .map((row) => ({
      ...row,
      received: qty(row.received),
      issued: qty(row.issued),
      transferred_in: qty(row.transferred_in),
      transferred_out: qty(row.transferred_out),
      /* What is still out of the gate, not what has ever gone out: a pass that
         came back in full is square and does not belong in this column. */
      on_gate_pass: qty(Math.max(0, row.on_gate_pass - row.returned_from_gate)),
      returned_from_gate: qty(row.returned_from_gate),
      balance: qty(row.balance),
      low: qty(row.balance) < row.reorder_level,
    }))
    .sort(
      (a, b) =>
        Number(b.low) - Number(a.low) ||
        a.store_name.localeCompare(b.store_name) ||
        a.material_id.localeCompare(b.material_id),
    );
}

function blankRow(
  store_id: string,
  store: Store | undefined,
  project_id: string,
  material: { id: string; unit: string; reorder_level: number },
): StockPositionRow {
  return {
    store_id,
    /* A movement written before this store existed would have no name. Saying
       so is better than printing a uuid. */
    store_name: store?.name ?? "Unknown store",
    project_id: store?.project_id ?? project_id,
    material_id: material.id,
    unit: material.unit,
    received: 0,
    issued: 0,
    transferred_in: 0,
    transferred_out: 0,
    on_gate_pass: 0,
    returned_from_gate: 0,
    balance: 0,
    reorder_level: material.reorder_level,
    low: false,
  };
}

/**
 * Cumulative quantity of one material issued to one contractor on a project.
 *
 * This is the column their issue template exists for: the project manager
 * reads total consumption by contractor off it. `upToIssueId` is excluded from
 * the sum, so a new note's cumulative is "everything before me, plus me".
 */
export async function cumulativeIssuedToContractor(
  project_id: string,
  contractor_id: string | null,
  material_id: string,
): Promise<number> {
  const repos = getRepositories();
  const [issues, lines] = await Promise.all([
    repos.stock.listIssuesByProject(project_id),
    repos.stock.listIssueLinesByProject(project_id),
  ]);
  const theirs = new Set(
    issues.filter((i) => i.issued_to_contractor_id === contractor_id).map((i) => i.id),
  );
  return qty(
    lines
      .filter((l) => theirs.has(l.material_issue_id) && l.material_id === material_id)
      .reduce((sum, l) => sum + l.quantity, 0),
  );
}
