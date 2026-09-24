import { z } from "zod";
import { project_scoped_shape } from "./primitives";

/**
 * A file hung off a record.
 *
 * Five documents in the workflow only make sense with paper behind them: the
 * challan photographed at the gate, the day's site photographs, the supplier's
 * own invoice, the signed measurement sheet, and the vendor quotes a
 * comparative was built from. Without them the demo asks a client to believe
 * an ERP is a substitute for evidence, which no site office would accept.
 *
 * The demo carries seeded placeholder files — there is no upload endpoint and
 * no blob store. `storage_path` is where the object will live once there is
 * one, and the shape is already what a Supabase Storage row needs.
 */
export const ATTACHMENT_ENTITY_TYPES = [
  "grn",
  "dpr",
  "vendor_bill",
  "joint_measurement",
  "comparative",
] as const;
export const attachmentEntityTypeSchema = z.enum(ATTACHMENT_ENTITY_TYPES);
export type AttachmentEntityType = (typeof ATTACHMENT_ENTITY_TYPES)[number];

/** What the file is, which decides its icon and how it is previewed. */
export const ATTACHMENT_KINDS = ["photo", "pdf", "spreadsheet", "other"] as const;
export const attachmentKindSchema = z.enum(ATTACHMENT_KINDS);
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

export const attachmentSchema = z.object({
  ...project_scoped_shape,
  entity_type: attachmentEntityTypeSchema,
  entity_id: z.string(),
  file_name: z.string(),
  kind: attachmentKindSchema,
  /** MIME type, as the browser reported it. */
  content_type: z.string(),
  /** Bytes. */
  size: z.number().nonnegative(),
  /** Where the object lives. Empty in the demo — nothing is really stored. */
  storage_path: z.string(),
  uploaded_by_user_id: z.string(),
  uploaded_at: z.string(),
  caption: z.string(),
});
export type Attachment = z.infer<typeof attachmentSchema>;

/** Guesses the kind from a file name, so the picker does not have to ask. */
export function attachmentKindOf(fileName: string): AttachmentKind {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (["jpg", "jpeg", "png", "heic", "webp", "gif"].includes(ext)) return "photo";
  if (ext === "pdf") return "pdf";
  if (["xls", "xlsx", "csv"].includes(ext)) return "spreadsheet";
  return "other";
}
