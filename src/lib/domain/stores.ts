import { z } from "zod";
import { project_scoped_shape } from "./primitives";
import {
  gatePassStatusSchema,
  gatePassTypeSchema,
  transferStatusSchema,
  unitSchema,
} from "./enums";

/* ------------------------------------------------------------------ */
/* Store                                                              */
/* ------------------------------------------------------------------ */
/**
 * A store: somewhere stock is held, belonging to a project.
 *
 * Manas have not told us yet whether they run one store per site or a shared
 * store across sites, so the model answers both and waits: a store belongs to
 * a project, a project may have more than one, and a transfer may cross
 * projects. Nothing in the app assumes a project has exactly one store — the
 * documents all name theirs — which is why finding out later costs nothing.
 *
 * `is_primary` is only a default for the picker and for a GRN, which is
 * received into a store without anyone being asked. It carries no authority.
 */
export const storeSchema = z.object({
  ...project_scoped_shape,
  code: z.string(),
  name: z.string(),
  location: z.string(),
  /** Who holds the keys, as a plain name. Not a user id: it is often a watchman. */
  keeper_name: z.string(),
  is_primary: z.boolean(),
  is_active: z.boolean(),
});
export type Store = z.infer<typeof storeSchema>;

/* ------------------------------------------------------------------ */
/* Gate pass                                                          */
/* ------------------------------------------------------------------ */
/**
 * Material leaving the gate, on the form Manas sent us.
 *
 * Three types, and the type changes the form: `expected_return_date` is
 * required for a returnable pass and must be absent on the other two, which
 * the service refuses rather than the screen.
 *
 * The three signatures on their template — stores, project manager, receiver —
 * are three different things and are kept apart. Raising it is the store
 * keeper; the project manager's step is a real approval and runs through the
 * generic `Approval` row; the receiver's is an acknowledgement taken at the
 * gate from somebody with no login, so it is a name and a timestamp.
 */
export const gatePassSchema = z.object({
  ...project_scoped_shape,
  gate_pass_number: z.string(),
  gate_pass_date: z.string(),
  pass_type: gatePassTypeSchema,
  /** The store the material leaves from. */
  store_id: z.string(),
  issued_to_name: z.string(),
  issued_to_company: z.string(),
  vehicle_number: z.string(),
  driver_name: z.string(),
  /** Why it is going out, in the storeman's words. Required. */
  purpose: z.string(),
  /** Returnable passes only; null on the other two types. */
  expected_return_date: z.string().nullable(),
  status: gatePassStatusSchema,
  raised_by_user_id: z.string(),
  /** The project manager's decision, mirrored off the Approval row. */
  approved_by_user_id: z.string().nullable(),
  approved_at: z.string().nullable(),
  decision_comment: z.string(),
  /** Taken at the gate: the receiver has no login, so this is a name. */
  acknowledged_by_name: z.string(),
  acknowledged_at: z.string().nullable(),
  /** Set when a returnable pass comes back, or when a pass is closed off. */
  closed_at: z.string().nullable(),
  /** The transfer order this pass accompanies, for a `transfer` pass. */
  material_transfer_id: z.string().nullable(),
  remarks: z.string(),
});
export type GatePass = z.infer<typeof gatePassSchema>;

/**
 * One line of a gate pass.
 *
 * `material_id` is nullable, and it is the only document in the app where that
 * is true. A gate pass is also how a non-stock item leaves — a contractor's
 * own mixer, a ladder, scaffolding that was never received on a GRN — and
 * forcing those through the material master would mean inventing leaves
 * nobody will ever indent. A line with no material carries `description`
 * instead, and such a line moves no stock.
 *
 * `returned_qty` is kept per line because material comes back in part: a
 * returnable pass is outstanding until every line is square.
 */
export const gatePassLineSchema = z.object({
  ...project_scoped_shape,
  gate_pass_id: z.string(),
  /** Null for a non-stock item; see the note above. */
  material_id: z.string().nullable(),
  /** What is going out, when there is no material to name it. */
  description: z.string(),
  unit: unitSchema,
  quantity: z.number(),
  /** Returnable passes only. Rolled up by `recordGatePassReturn`. */
  returned_qty: z.number(),
  remarks: z.string(),
});
export type GatePassLine = z.infer<typeof gatePassLineSchema>;

/* ------------------------------------------------------------------ */
/* Material transfer order                                            */
/* ------------------------------------------------------------------ */
/**
 * Stock moving between stores, which may be between projects.
 *
 * The document is only complete when the receiving store acknowledges it.
 * Until then the quantity has left the issuing store and arrived nowhere, and
 * both stock positions say so.
 *
 * No value travels with it. Manas asked for no valuation anywhere in Stores,
 * and a transfer that re-priced stock at the receiving end would be the first
 * place that decision had to be made.
 */
export const materialTransferSchema = z.object({
  ...project_scoped_shape,
  transfer_number: z.string(),
  transfer_date: z.string(),
  /** `project_id` above is the issuing project, and the document is filed there. */
  from_store_id: z.string(),
  to_project_id: z.string(),
  to_store_id: z.string(),
  reason: z.string(),
  vehicle_number: z.string(),
  status: transferStatusSchema,
  raised_by_user_id: z.string(),
  dispatched_at: z.string().nullable(),
  /** The receiving store's sign-off, which is what completes the transfer. */
  acknowledged_by_user_id: z.string().nullable(),
  acknowledged_at: z.string().nullable(),
  remarks: z.string(),
});
export type MaterialTransfer = z.infer<typeof materialTransferSchema>;

/** One material on a transfer order. Material is inherited from stock, never picked blind. */
export const materialTransferLineSchema = z.object({
  ...project_scoped_shape,
  material_transfer_id: z.string(),
  material_id: z.string(),
  unit: unitSchema,
  quantity: z.number(),
  /** Short received at the other end is recorded here, not by editing quantity. */
  received_qty: z.number(),
  remarks: z.string(),
});
export type MaterialTransferLine = z.infer<typeof materialTransferLineSchema>;
