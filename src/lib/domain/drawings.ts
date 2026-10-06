import { z } from "zod";
import { project_scoped_shape } from "./primitives";
import {
  drawingDisciplineSchema,
  drawingRevisionCodeSchema,
  drawingSheetSizeSchema,
  transmittalDocumentTypeSchema,
  transmittalPurposeSchema,
  transmittalStatusSchema,
} from "./enums";

/* ------------------------------------------------------------------ */
/* Drawing register                                                    */
/* ------------------------------------------------------------------ */

/**
 * One row of the controlled drawing register, on the form Manas sent us.
 *
 * `current_revision_code`, `current_revision_date` and `current_status` are
 * rolled up by `addDrawingRevision` — the register's own one writer, the same
 * shape as `WorkOrderLine`'s roll-up columns. A drawing that has just been
 * logged carries its first revision (R0) at create time, so these three are
 * only null for the instant between the two writes inside that one service
 * call; nothing in the UI reads a drawing with no revision at all.
 *
 * `current_status` is the latest revision's own `remarks` — their template
 * has no separate status column, and the remarks column is where a reviewer
 * writes "Approved for construction" or "Under query", which is the status a
 * register reader actually wants.
 */
export const drawingSchema = z.object({
  ...project_scoped_shape,
  drawing_no: z.string(),
  title: z.string(),
  discipline: drawingDisciplineSchema,
  sheet_size: drawingSheetSizeSchema,
  consultant: z.string(),
  current_revision_code: drawingRevisionCodeSchema.nullable(),
  current_revision_date: z.string().nullable(),
  current_status: z.string(),
});
export type Drawing = z.infer<typeof drawingSchema>;

/**
 * One revision row. A drawing may have fewer than five — a leaf stops at
 * whatever revision it is actually at, rather than printing four empty
 * columns.
 */
export const drawingRevisionSchema = z.object({
  ...project_scoped_shape,
  drawing_id: z.string(),
  revision_code: drawingRevisionCodeSchema,
  revision_date: z.string(),
  copies_received: z.number(),
  remarks: z.string(),
});
export type DrawingRevision = z.infer<typeof drawingRevisionSchema>;

/* ------------------------------------------------------------------ */
/* Drawing transmittal                                                 */
/* ------------------------------------------------------------------ */

/**
 * The record of drawings handed to a contractor or consultant.
 *
 * **Issuing and receiving are different signatures**, exactly the separation
 * the gate pass keeps: `issued_by_user_id` is a system user and is set by
 * `issueTransmittal`, which also locks the document; `received_by_name` is
 * taken from whoever signs for it at the other end, who very often has no
 * login, so it is a name and a date rather than a user id.
 */
export const transmittalSchema = z.object({
  ...project_scoped_shape,
  transmittal_number: z.string(),
  transmittal_date: z.string(),
  to_name: z.string(),
  to_company: z.string(),
  to_address: z.string(),
  from_name: z.string(),
  from_designation: z.string(),
  document_type: transmittalDocumentTypeSchema,
  purpose_of_issue: transmittalPurposeSchema,
  mode_of_transmission: z.string(),
  status: transmittalStatusSchema,
  raised_by_user_id: z.string(),
  issued_by_user_id: z.string().nullable(),
  issued_at: z.string().nullable(),
  received_by_name: z.string(),
  received_at: z.string().nullable(),
  remarks: z.string(),
});
export type Transmittal = z.infer<typeof transmittalSchema>;

/**
 * One drawing on a transmittal. `drawing_id` points back at the register, but
 * the printable fields are snapshotted at the moment the line is written —
 * the same reason a GRN line keeps the PO's rate: a transmittal signed last
 * month must still read what it read when it was signed, even if the drawing
 * has since moved to R3.
 */
export const transmittalLineSchema = z.object({
  ...project_scoped_shape,
  transmittal_id: z.string(),
  drawing_id: z.string(),
  drawing_no: z.string(),
  drawing_title: z.string(),
  revision_code: drawingRevisionCodeSchema,
  sheet_size: drawingSheetSizeSchema,
  copies: z.number(),
});
export type TransmittalLine = z.infer<typeof transmittalLineSchema>;
