import type { DemoDatabase } from "../database";

/**
 * Puts one project's stock ledger in date order and recomputes the running
 * balance.
 *
 * The threads write their movements scenario by scenario — the recent
 * showcase first, the history behind it last — so the balance each row was
 * written with follows that order, not the calendar. Read by date, the ledger
 * has to add up by date.
 *
 * The balance is per **store** and material, which is what `balance_quantity`
 * means since the Stores tab arrived: a project with two stores cannot answer
 * "what is in the yard" from a figure that pooled both.
 */
export function orderStockLedger(db: DemoDatabase, project_id: string): void {
  const mine = db.stock_ledger_entries.filter((e) => e.project_id === project_id);
  const others = db.stock_ledger_entries.filter((e) => e.project_id !== project_id);

  mine.sort(
    (a, b) =>
      a.created_at.localeCompare(b.created_at) ||
      // A delivery and an issue on the same morning: the delivery came first.
      b.quantity_in - a.quantity_in ||
      a.id.localeCompare(b.id),
  );
  const balance = new Map<string, number>();
  mine.forEach((e) => {
    const key = `${e.store_id}:${e.material_id}`;
    const next = (balance.get(key) ?? 0) + e.quantity_in - e.quantity_out;
    balance.set(key, next);
    e.balance_quantity = Math.round(next * 1000) / 1000;
  });

  db.stock_ledger_entries.splice(0, db.stock_ledger_entries.length, ...others, ...mine);
}
