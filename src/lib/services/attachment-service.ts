import { z } from "zod";
import { getRepositories } from "@/lib/data";
import {
  ATTACHMENT_ENTITY_TYPES,
  ATTACHMENT_KINDS,
  attachmentKindOf,
  type Attachment,
  type AttachmentEntityType,
} from "@/lib/domain";
import type { Resource } from "@/config/permissions";
import { now } from "@/lib/clock";
import { assertCan, required } from "./guards";
import { parseInput } from "./guards";
import { ValidationError, type ActingUser } from "./types";

/**
 * Files hung off a record.
 *
 * Which team may attach to what follows the record itself: the site records a
 * GRN, so the site attaches its challan; purchase enters the vendor bill, so
 * purchase attaches the invoice. Nobody gets a general "upload" grant.
 */
const RESOURCE_OF: Record<AttachmentEntityType, Resource> = {
  grn: "grn",
  dpr: "dpr",
  vendor_bill: "vendor_bills",
  joint_measurement: "measurements",
  comparative: "comparatives",
  gate_pass: "gate_pass",
  material_issue: "site_stock",
  drawing: "drawings",
};

/** What each record expects to have attached, shown as the control's hint. */
export const ATTACHMENT_PROMPT: Record<AttachmentEntityType, string> = {
  grn: "Delivery challan, photographed at the gate",
  dpr: "Site photographs for the day",
  vendor_bill: "The supplier's own invoice",
  joint_measurement: "The signed measurement sheet",
  comparative: "The vendor quotes this was built from",
  gate_pass: "A photograph of the load, or the vehicle at the gate",
  material_issue: "The signed issue slip, or a photograph of the material issued",
  drawing: "The drawing sheet as issued",
};

/**
 * What the demo will hold: images and PDFs only.
 *
 * Phones also hand over HEIC and the odd spreadsheet; neither belongs on a site
 * record and neither can be previewed, so they are refused up front rather
 * than stored as a chip nobody can open.
 */
export function isAcceptedContentType(contentType: string): boolean {
  return contentType.startsWith("image/") || contentType === "application/pdf";
}

/**
 * The most the demo keeps, in characters of data URL across every attachment.
 * The whole database is one localStorage key with a ~5 MB ceiling and the seed
 * already uses about 2 MB of it, so this is what is left to spend. It is a
 * property of the demo's storage, not of the product.
 */
export const DEMO_ATTACHMENT_BUDGET = 2_000_000;

/** 10 MB — a phone photo of a challan, not a drawing set. */
const MAX_BYTES = 10 * 1024 * 1024;

export const attachmentInput = z.object({
  project_id: z.string().min(1),
  entity_type: z.enum(ATTACHMENT_ENTITY_TYPES),
  entity_id: z.string().min(1),
  file_name: z.string().min(1, "a file name is required"),
  content_type: z.string().default("application/octet-stream"),
  size: z.number().nonnegative().max(MAX_BYTES, "that file is larger than 10 MB"),
  data_url: z.string().default(""),
  kind: z.enum(ATTACHMENT_KINDS).optional(),
  caption: z.string().default(""),
});

export type AttachmentInput = z.input<typeof attachmentInput>;

export async function addAttachment(
  input: AttachmentInput,
  actor: ActingUser,
): Promise<Attachment> {
  const data = parseInput(attachmentInput, input);
  // Attaching to a record is editing it, so it takes the same grant.
  assertCan(actor, "edit", RESOURCE_OF[data.entity_type]);

  if (!isAcceptedContentType(data.content_type)) {
    throw new ValidationError("content_type: attach a photograph or a PDF");
  }
  if (data.data_url && !data.data_url.startsWith("data:")) {
    throw new ValidationError("data_url: the file could not be read");
  }

  const repos = getRepositories();
  const existing = await repos.attachments.listByEntity(data.entity_type, data.entity_id);
  if (existing.some((a) => a.file_name === data.file_name)) {
    throw new ValidationError(`file_name: ${data.file_name} is already attached`);
  }
  const used = (await repos.attachments.list()).reduce((n, a) => n + (a.data_url?.length ?? 0), 0);
  if (used + data.data_url.length > DEMO_ATTACHMENT_BUDGET) {
    throw new ValidationError(
      "size: the demo has run out of room for files — remove one from another record first",
    );
  }

  const at = now();
  return repos.attachments.create({
    project_id: data.project_id,
    entity_type: data.entity_type,
    entity_id: data.entity_id,
    file_name: data.file_name,
    kind: data.kind ?? attachmentKindOf(data.file_name),
    content_type: data.content_type,
    size: data.size,
    // No blob store in the demo. This is the path the object will take.
    storage_path: `${data.project_id}/${data.entity_type}/${data.entity_id}/${data.file_name}`,
    data_url: data.data_url,
    uploaded_by_user_id: actor.user_id,
    uploaded_at: at,
    caption: data.caption,
  });
}

export async function removeAttachment(id: string, actor: ActingUser): Promise<void> {
  const repos = getRepositories();
  const attachment = required(await repos.attachments.getById(id), "Attachment");
  assertCan(actor, "edit", RESOURCE_OF[attachment.entity_type]);
  await repos.attachments.remove(id);
}

export async function listAttachments(
  entity_type: AttachmentEntityType,
  entity_id: string,
): Promise<Attachment[]> {
  return getRepositories().attachments.listByEntity(entity_type, entity_id);
}
