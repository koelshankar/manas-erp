import type { PoLine, PoTerm, PurchaseOrder } from "@/lib/domain";
import { composePoTerms, PO_CLAUSE_CATALOGUE } from "@/lib/services/po-terms";
import type { DemoDatabase } from "../database";
import { sid } from "./ids";
import type { Counters } from "./project-seed";

/**
 * The parts of a purchase order that are the document rather than the order:
 * its printed clause list and its delivery schedules.
 *
 * Terms are snapshotted onto every seeded order the same way a real one gets
 * them — through `composePoTerms`, off the library and the order's own four
 * variable fields — so the demo cannot show a clause list the service would not
 * have produced.
 */

/** The seeded clause library, with the ids `buildPoClauses` gave it. */
const SEEDED_CLAUSES = PO_CLAUSE_CATALOGUE.map((c, i) => ({
  ...c,
  id: sid("po_clause", i + 1),
}));

function next(counters: Counters, key: string): number {
  counters[key] = (counters[key] ?? 0) + 1;
  return counters[key];
}

/** Writes the default clause list onto one order. */
export function seedPoTerms(db: DemoDatabase, po: PurchaseOrder, counters: Counters): void {
  const drafts = composePoTerms(
    SEEDED_CLAUSES.filter((c) => c.is_default && c.is_active),
    {
      payment_terms: po.payment_terms,
      po_validity: po.po_validity,
      warranty: po.warranty,
      brand: po.brand_terms,
    },
  );
  const rows: PoTerm[] = drafts.map((d) => ({
    id: sid("po_term", next(counters, "po_term")),
    project_id: po.project_id,
    created_at: po.created_at,
    updated_at: po.created_at,
    purchase_order_id: po.id,
    ...d,
  }));
  db.po_terms.push(...rows);
}

/**
 * A staggered delivery, on the one order per project that is still awaiting
 * material (IND-6 -> PO sent).
 *
 * Sixty per cent against a date, the balance in a second table with none — which
 * is exactly the shape of the order Manas sent us carrying "Delivery Schedule 1"
 * and a second for the balance. Without one seeded, the feature only exists on a
 * screen nobody opens on the day.
 */
export function seedPoDeliverySchedules(
  db: DemoDatabase,
  po: PurchaseOrder,
  lines: PoLine[],
  counters: Counters,
  firstDeliveryDate: string,
): void {
  if (lines.length === 0) return;

  const dated = {
    id: sid("po_delivery_schedule", next(counters, "po_delivery_schedule")),
    project_id: po.project_id,
    created_at: po.created_at,
    updated_at: po.created_at,
    purchase_order_id: po.id,
    sequence: 1,
    title: "Delivery Schedule 1",
    is_balance: false,
    note: "",
  };
  const balance = {
    id: sid("po_delivery_schedule", next(counters, "po_delivery_schedule")),
    project_id: po.project_id,
    created_at: po.created_at,
    updated_at: po.created_at,
    purchase_order_id: po.id,
    sequence: 2,
    title: "Delivery Schedule 2 — balance",
    is_balance: true,
    note: "",
  };
  db.po_delivery_schedules.push(dated, balance);

  for (const line of lines) {
    const first = Math.round(line.ordered_qty * 0.6 * 1000) / 1000;
    const rest = Math.round((line.ordered_qty - first) * 1000) / 1000;
    const row = (schedule_id: string, quantity: number, delivery_date: string | null) => ({
      id: sid("po_delivery_schedule_line", next(counters, "po_delivery_schedule_line")),
      project_id: po.project_id,
      created_at: po.created_at,
      updated_at: po.created_at,
      purchase_order_id: po.id,
      po_delivery_schedule_id: schedule_id,
      po_line_id: line.id,
      material_id: line.material_id,
      unit: line.unit,
      quantity,
      delivery_date,
    });
    if (first > 0) db.po_delivery_schedule_lines.push(row(dated.id, first, firstDeliveryDate));
    if (rest > 0) db.po_delivery_schedule_lines.push(row(balance.id, rest, null));
  }
}
