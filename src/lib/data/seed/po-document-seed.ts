import type { PoTerm, PurchaseOrder } from "@/lib/domain";
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
