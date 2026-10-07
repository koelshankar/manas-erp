import type { DemoDatabase } from "../database";
import { daysAgoIso, sid } from "./ids";
import type { Counters } from "./project-seed";
import { next } from "./project-seed";

/**
 * Who has already opened what.
 *
 * A document is unseen for a user until they open it, so a seed with no rows
 * would present every document in every queue as bold — which is true and
 * useless, because nothing would be read for contrast. Instead everything that
 * is sitting in somebody's queue has been opened by everybody **except the two
 * newest of each kind on each project**, which is what leaves a handful bold in
 * every role's inbox the moment the demo opens, and the rest plain.
 *
 * Rows are written for users who were not meant to see a document too. Harmless:
 * `getUnseenItems` only ever asks about documents that are in the asker's own
 * queue.
 */
const UNSEEN_PER_KIND = 2;

type Waiting = { id: string; project_id: string; created_at: string };

export function seedDocumentSeen(db: DemoDatabase, counters: Counters): void {
  const queues: Array<[type: DemoDatabase["document_seen"][number]["entity_type"], rows: Waiting[]]> = [
    ["indent", db.indents.filter((i) => i.status === "submitted")],
    ["comparative", db.comparatives.filter((c) => c.status === "pending_approval")],
    ["purchase_order", db.purchase_orders.filter((p) => p.status === "pending_approval")],
    ["gate_pass", db.gate_passes.filter((g) => g.status === "pending_approval" || g.status === "approved")],
    ["ra_bill", db.ra_bills.filter((b) => b.status === "in_certification")],
    ["transmittal", db.transmittals.filter((t) => t.status === "issued")],
    ["material_transfer", db.material_transfers.filter((t) => t.status === "in_transit")],
  ];

  queues.forEach(([entity_type, rows]) => {
    const byProject = new Map<string, Waiting[]>();
    rows.forEach((r) => byProject.set(r.project_id, [...(byProject.get(r.project_id) ?? []), r]));
    byProject.forEach((mine) => {
      const opened = [...mine]
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(UNSEEN_PER_KIND);
      opened.forEach((doc) => {
        db.users.forEach((user) => {
          const at = daysAgoIso(0);
          db.document_seen.push({
            id: sid("document_seen", next(counters, "document_seen")),
            created_at: at,
            updated_at: at,
            user_id: user.id,
            entity_type,
            entity_id: doc.id,
            seen_at: at,
          });
        });
      });
    });
  });
}
