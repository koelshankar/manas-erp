/**
 * The words printed on the three stores documents, in one place.
 *
 * Manas sent us their own blank templates for the material issue note, the
 * gate pass and the material transfer order. Everything here is transcribed
 * from them — in particular the signature blocks, which differ per document
 * and are **print labels, not approval state**. That separation is the same one
 * the purchase order keeps (see `PO_SIGNATURE_LABELS`): the chain decides who
 * may act, the blocks decide what the paper says, and conflating them is how an
 * app ends up inventing a step nobody in the office holds.
 */

/**
 * The material issue note's four blocks.
 *
 * Two fill themselves — the storeman who wrote it, and whoever signed for it at
 * the counter. The two project managers sign on paper: no system step holds
 * them, so those rules print empty.
 */
export const ISSUE_SIGNATURE_LABELS = {
  manas_stores: "Manas Stores",
  manas_project_manager: "Manas Project Manager",
  contractor_project_manager: "Contractor Project Manager",
  contractor_stores: "Contractor Stores",
} as const;

/**
 * The gate pass's three blocks, which are its three real steps: stores raise
 * it, the project manager approves it, the receiver signs at the gate. All
 * three are filled from the system, which is why the gate pass has an approval
 * chain and the issue note does not.
 */
export const GATE_PASS_SIGNATURE_LABELS = {
  stores: "Stores",
  project_manager: "Project Manager",
  receiver: "Received By",
} as const;

/**
 * The transfer order's four blocks: both stores and both projects.
 *
 * The receiving store's is filled by the acknowledgement, which is the step
 * that completes the transfer. The other three are signed on paper.
 */
export const TRANSFER_SIGNATURE_LABELS = {
  issuing_store: "Issuing Store",
  issuing_project: "Issuing Project",
  receiving_store: "Receiving Store",
  receiving_project: "Receiving Project",
} as const;

/** Printed under the line table of a returnable gate pass. */
export const GATE_PASS_RETURNABLE_NOTE =
  "The material listed above is to be returned to the store on or before the expected return date. Any shortfall will be recovered from the party named above.";

/** Printed under the line table of a non-returnable gate pass. */
export const GATE_PASS_NON_RETURNABLE_NOTE =
  "The material listed above is permitted to leave the premises and is not expected back.";

/** Printed under the transfer order's line table. */
export const TRANSFER_NOTE =
  "This transfer is complete only when the receiving store has acknowledged the quantities actually received.";
