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
};

/** What each record expects to have attached, shown as the control's hint. */
export const ATTACHMENT_PROMPT: Record<AttachmentEntityType, string> = {
  grn: "Delivery challan, photographed at the gate",
  dpr: "Site photographs for the day",
  vendor_bill: "The supplier's own invoice",
  joint_measurement: "The signed measurement sheet",
  comparative: "The vendor quotes this was built from",
};

/** 10 MB — a phone photo of a challan, not a drawing set. */
const MAX_BYTES = 10 * 1024 * 1024;

export const attachmentInput = z.object({
  project_id: z.string().min(1),
  entity_type: z.enum(ATTACHMENT_ENTITY_TYPES),
  entity_id: z.string().min(1),
  file_name: z.string().min(1, "a file name is required"),
  content_type: z.string().default("application/octet-stream"),
  size: z.number().nonnegative().max(MAX_BYTES, "that file is larger than 10 MB"),
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

  const repos = getRepositories();
  const existing = await repos.attachments.listByEntity(data.entity_type, data.entity_id);
  if (existing.some((a) => a.file_name === data.file_name)) {
    throw new ValidationError(`file_name: ${data.file_name} is already attached`);
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
