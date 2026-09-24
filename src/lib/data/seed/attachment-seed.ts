import type { AttachmentEntityType } from "@/lib/domain";
import { attachmentKindOf } from "@/lib/domain";
import type { DemoDatabase } from "../database";
import { userByRole, type Masters } from "./masters";
import { daysAgoIso, sid } from "./ids";
import type { Counters } from "./project-seed";
import { next } from "./project-seed";

/**
 * The paper behind the records.
 *
 * Five documents only make sense with evidence attached, and a demo that shows
 * an empty attachment panel on every one of them is showing a feature rather
 * than a workflow. These are placeholders — the demo stores no bytes — but the
 * rows are exactly the shape a Supabase Storage listing will have.
 *
 * Deliberately not on every record: a GRN with no challan photograph is a real
 * state that a Purchase Officer has to chase, and the demo should show it.
 */
type Spec = {
  entity_type: AttachmentEntityType;
  file_name: string;
  size: number;
  caption: string;
  role: "site_engineer" | "purchase_officer" | "project_qs";
  days_ago: number;
};

const FOR_GRN: Spec[] = [
  {
    entity_type: "grn",
    file_name: "challan-at-gate.jpg",
    size: 1_843_200,
    caption: "Challan photographed at the gate",
    role: "site_engineer",
    days_ago: 1,
  },
];

const FOR_DPR: Spec[] = [
  {
    entity_type: "dpr",
    file_name: "tower-b-slab-morning.jpg",
    size: 2_310_144,
    caption: "Tower B slab, morning pour",
    role: "site_engineer",
    days_ago: 0,
  },
  {
    entity_type: "dpr",
    file_name: "tower-b-slab-evening.jpg",
    size: 1_966_080,
    caption: "Same pour, end of day",
    role: "site_engineer",
    days_ago: 0,
  },
];

const FOR_VENDOR_BILL: Spec[] = [
  {
    entity_type: "vendor_bill",
    file_name: "supplier-invoice.pdf",
    size: 184_320,
    caption: "Supplier's own invoice",
    role: "purchase_officer",
    days_ago: 1,
  },
];

const FOR_MEASUREMENT: Spec[] = [
  {
    entity_type: "joint_measurement",
    file_name: "measurement-sheet-signed.pdf",
    size: 421_888,
    caption: "Signed by both parties on site",
    role: "project_qs",
    days_ago: 1,
  },
];

const FOR_COMPARATIVE: Spec[] = [
  {
    entity_type: "comparative",
    file_name: "vendor-quotes.pdf",
    size: 612_352,
    caption: "All three quotes as received",
    role: "purchase_officer",
    days_ago: 2,
  },
];

export function seedAttachments(
  db: DemoDatabase,
  project_id: string,
  masters: Masters,
  counters: Counters,
): void {
  const add = (specs: Spec[], entity_id: string, baseIso: string) => {
    specs.forEach((spec) => {
      const uploader = userByRole(masters.users, spec.role);
      const at = daysAgoIso(spec.days_ago);
      db.attachments.push({
        id: sid("attachment", next(counters, "attachment")),
        project_id,
        created_at: at,
        updated_at: at,
        entity_type: spec.entity_type,
        entity_id,
        file_name: spec.file_name,
        kind: attachmentKindOf(spec.file_name),
        content_type: spec.file_name.endsWith(".pdf") ? "application/pdf" : "image/jpeg",
        size: spec.size,
        storage_path: `${project_id}/${spec.entity_type}/${entity_id}/${spec.file_name}`,
        uploaded_by_user_id: uploader.id,
        uploaded_at: at,
        caption: spec.caption,
      });
      void baseIso;
    });
  };

  // The most recent of each, so the demo opens on a record that has its paper.
  const latest = <T extends { id: string; created_at: string }>(rows: T[]): T | undefined =>
    [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];

  const grn = latest(db.grns.filter((g) => g.project_id === project_id));
  if (grn) add(FOR_GRN, grn.id, grn.created_at);

  const dpr = latest(db.dprs.filter((d) => d.project_id === project_id));
  if (dpr) add(FOR_DPR, dpr.id, dpr.created_at);

  const bill = latest(db.vendor_bills.filter((b) => b.project_id === project_id));
  if (bill) add(FOR_VENDOR_BILL, bill.id, bill.created_at);

  // A signed sheet is the one that carries a signature to scan.
  const measurement = latest(
    db.joint_measurements.filter((m) => m.project_id === project_id && m.status === "signed"),
  );
  if (measurement) add(FOR_MEASUREMENT, measurement.id, measurement.created_at);

  const comparative = latest(db.comparatives.filter((c) => c.project_id === project_id));
  if (comparative) add(FOR_COMPARATIVE, comparative.id, comparative.created_at);
}
