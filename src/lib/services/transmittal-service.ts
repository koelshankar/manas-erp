import { z } from "zod";
import { getRepositories } from "@/lib/data";
import {
  nowIso,
  TRANSMITTAL_TRANSITIONS,
  type Transmittal,
  type TransmittalLine,
} from "@/lib/domain";
import { assertCan, assertTransition, parseInput, qty, required } from "./guards";
import { nextDocumentNumber } from "./numbering";
import { ValidationError, WorkflowError, type ActingUser } from "./types";

/**
 * The drawing transmittal: who was handed which revision, and when.
 *
 * **Lines are picked from the register, never typed.** A line names a
 * drawing and a revision that already exist, and the service refuses
 * anything else — a transmittal is a record of what went out, not a second
 * way to log a drawing. The printable fields on the line are snapshotted at
 * that moment (see `TransmittalLine`), so an issued transmittal reads the
 * same next year even if the drawing has moved on since.
 *
 * **Issuing and receiving are two different signatures.** Issuing is this
 * sender's own act — it locks the document and stamps `issued_by_user_id`,
 * the system user who did it. Receiving is taken from whoever signs for it at
 * the other end, who has no login here, so it is a name and a date, exactly
 * the gate pass's `acknowledged_by_name`.
 */

const transmittalLineInput = z.object({
  drawing_id: z.string().min(1),
  revision_code: z.string().min(1),
  copies: z.number().positive("copies must be greater than zero"),
});

export const createTransmittalInput = z.object({
  project_id: z.string().min(1),
  transmittal_date: z.string().min(1),
  to_name: z.string().min(2, "who is this going to?"),
  to_company: z.string().default(""),
  to_address: z.string().default(""),
  from_name: z.string().min(2, "who is issuing it?"),
  from_designation: z.string().default(""),
  document_type: z.string().min(1),
  purpose_of_issue: z.string().min(1),
  mode_of_transmission: z.string().default(""),
  remarks: z.string().default(""),
  lines: z.array(transmittalLineInput).min(1, "pick at least one drawing"),
});
export type CreateTransmittalInput = z.input<typeof createTransmittalInput>;

export type TransmittalResult = { transmittal: Transmittal; lines: TransmittalLine[] };

export async function createTransmittal(
  input: CreateTransmittalInput,
  actor: ActingUser,
): Promise<TransmittalResult> {
  assertCan(actor, "create", "transmittals");
  const data = parseInput(createTransmittalInput, input);
  const repos = getRepositories();

  const project = required(await repos.projects.getById(data.project_id), "Project");
  const transmittal_number = await nextDocumentNumber("DT", project, nowIso());

  const transmittal = await repos.transmittals.create({
    project_id: project.id,
    transmittal_number,
    transmittal_date: data.transmittal_date,
    to_name: data.to_name,
    to_company: data.to_company,
    to_address: data.to_address,
    from_name: data.from_name,
    from_designation: data.from_designation,
    document_type: data.document_type as Transmittal["document_type"],
    purpose_of_issue: data.purpose_of_issue as Transmittal["purpose_of_issue"],
    mode_of_transmission: data.mode_of_transmission,
    status: "draft",
    raised_by_user_id: actor.user_id,
    issued_by_user_id: null,
    issued_at: null,
    received_by_name: "",
    received_at: null,
    remarks: data.remarks,
  });

  const lines = await writeLines(transmittal, data.lines);
  return { transmittal, lines };
}

export const updateTransmittalInput = createTransmittalInput.safeExtend({
  transmittal_id: z.string().min(1),
});
export type UpdateTransmittalInput = z.input<typeof updateTransmittalInput>;

/** A draft may be rewritten whole. Once issued it is locked. */
export async function updateTransmittal(
  input: UpdateTransmittalInput,
  actor: ActingUser,
): Promise<TransmittalResult> {
  assertCan(actor, "edit", "transmittals");
  const data = parseInput(updateTransmittalInput, input);
  const repos = getRepositories();

  const existing = required(await repos.transmittals.getById(data.transmittal_id), "Transmittal");
  if (existing.status !== "draft") {
    throw new WorkflowError(
      `${existing.transmittal_number} has been issued and can no longer be edited.`,
    );
  }

  const transmittal = await repos.transmittals.update(existing.id, {
    transmittal_date: data.transmittal_date,
    to_name: data.to_name,
    to_company: data.to_company,
    to_address: data.to_address,
    from_name: data.from_name,
    from_designation: data.from_designation,
    document_type: data.document_type as Transmittal["document_type"],
    purpose_of_issue: data.purpose_of_issue as Transmittal["purpose_of_issue"],
    mode_of_transmission: data.mode_of_transmission,
    remarks: data.remarks,
  });

  for (const line of await repos.transmittals.listLinesByTransmittal(transmittal.id)) {
    await repos.transmittals.removeLine(line.id);
  }
  const lines = await writeLines(transmittal, data.lines);
  return { transmittal, lines };
}

type LineInput = z.infer<typeof transmittalLineInput>;

async function writeLines(
  transmittal: Transmittal,
  lines: LineInput[],
): Promise<TransmittalLine[]> {
  const repos = getRepositories();
  const out: TransmittalLine[] = [];
  for (const [i, line] of lines.entries()) {
    const drawing = required(await repos.drawings.getById(line.drawing_id), "Drawing");
    const revisions = await repos.drawings.listRevisionsByDrawing(drawing.id);
    const revision = revisions.find((r) => r.revision_code === line.revision_code);
    if (!revision) {
      throw new ValidationError(
        `lines.${i}.revision_code: ${drawing.drawing_no} has no revision ${line.revision_code} on record`,
      );
    }

    out.push(
      await repos.transmittals.createLine({
        project_id: transmittal.project_id,
        transmittal_id: transmittal.id,
        drawing_id: drawing.id,
        drawing_no: drawing.drawing_no,
        drawing_title: drawing.title,
        revision_code: revision.revision_code,
        sheet_size: drawing.sheet_size,
        copies: qty(line.copies),
      }),
    );
  }
  return out;
}

/** Locks the transmittal and stamps the issued-by signature. */
export async function issueTransmittal(
  transmittal_id: string,
  actor: ActingUser,
): Promise<Transmittal> {
  assertCan(actor, "edit", "transmittals");
  const repos = getRepositories();

  const transmittal = required(await repos.transmittals.getById(transmittal_id), "Transmittal");
  assertTransition("Transmittal", TRANSMITTAL_TRANSITIONS, transmittal.status, "issued");
  const lines = await repos.transmittals.listLinesByTransmittal(transmittal.id);
  if (lines.length === 0) {
    throw new ValidationError("lines: this transmittal has no drawings on it");
  }

  const at = nowIso();
  return repos.transmittals.update(transmittal.id, {
    status: "issued",
    issued_by_user_id: actor.user_id,
    issued_at: at,
  });
}

export const recordTransmittalReceiptInput = z.object({
  transmittal_id: z.string().min(1),
  received_by_name: z.string().min(2, "give the name of whoever signed for it"),
  received_at: z.string().min(1),
});
export type RecordTransmittalReceiptInput = z.input<typeof recordTransmittalReceiptInput>;

/** The receiver signs for it. A name, because they have no login. */
export async function recordTransmittalReceipt(
  input: RecordTransmittalReceiptInput,
  actor: ActingUser,
): Promise<Transmittal> {
  assertCan(actor, "edit", "transmittals");
  const data = parseInput(recordTransmittalReceiptInput, input);
  const repos = getRepositories();

  const transmittal = required(await repos.transmittals.getById(data.transmittal_id), "Transmittal");
  assertTransition("Transmittal", TRANSMITTAL_TRANSITIONS, transmittal.status, "acknowledged");

  return repos.transmittals.update(transmittal.id, {
    status: "acknowledged",
    received_by_name: data.received_by_name.trim(),
    received_at: data.received_at,
  });
}

/** True when an issued transmittal is still waiting on a receipt. */
export function isOutstanding(transmittal: Transmittal): boolean {
  return transmittal.status === "issued";
}
