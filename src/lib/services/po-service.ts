import { z } from "zod";
import { getRepositories } from "@/lib/data";
import {
  PO_TRANSITIONS,
  nowIso,
  type Approval,
  type PurchaseOrder,
} from "@/lib/domain";
import { APPROVAL_CHAINS } from "@/config/permissions";
import { assertCan, assertTransition, parseInput, required } from "./guards";
import { PermissionError, WorkflowError, type ActingUser } from "./types";

/**
 * The purchase order's own workflow: the two-level sign-off between B3 and B4,
 * and the issue that opens the order to the GRN flow.
 *
 * Creation, the delivery schedule, the charges and the amendment live beside
 * this in the same file as they are built; the comparative-driven B3 generator
 * stays in `purchase-service.ts`, which is where the comparative is.
 */

/* ------------------------------------------------------------------ */
/* The chain                                                           */
/* ------------------------------------------------------------------ */

/** The chain row this order waits on, or null when it is not in the chain. */
export async function pendingPoStep(purchase_order_id: string): Promise<Approval | null> {
  const rows = await getRepositories().approvals.listForEntity(
    "purchase_order",
    purchase_order_id,
  );
  const pending = rows
    .filter((r) => r.status === "pending")
    .sort((a, b) => a.sequence - b.sequence);
  return pending[0] ?? null;
}

/**
 * B3 — the officer sends a draft for sign-off.
 *
 * Both chain rows are opened at once and both start `pending`, exactly as the
 * RA bill chain does: only the lowest pending sequence is actionable, and only
 * by the role that holds it. Resubmitting an order that was sent back reopens
 * the rows that were closed rather than adding a second set, so the Approval
 * table stays readable as the audit trail it is.
 */
export async function submitPurchaseOrder(
  purchase_order_id: string,
  actor: ActingUser,
): Promise<{ purchase_order: PurchaseOrder; approvals: Approval[] }> {
  assertCan(actor, "edit", "purchase_orders");
  const repos = getRepositories();

  const po = required(await repos.purchaseOrders.getById(purchase_order_id), "Purchase order");
  assertTransition("Purchase order", PO_TRANSITIONS, po.status, "pending_approval");

  const lines = await repos.purchaseOrders.listLinesByPo(po.id);
  if (lines.length === 0) {
    throw new WorkflowError("This purchase order has no lines to approve.");
  }

  const at = nowIso();
  const existing = await repos.approvals.listForEntity("purchase_order", po.id);
  const approvals: Approval[] = [];

  for (const step of APPROVAL_CHAINS.purchase_order) {
    const prior = existing.find((a) => a.sequence === step.sequence);
    approvals.push(
      prior
        ? await repos.approvals.update(prior.id, {
            status: "pending",
            actor_user_id: null,
            comment: "",
            acted_at: null,
          })
        : await repos.approvals.create({
            project_id: po.project_id,
            entity_type: "purchase_order",
            entity_id: po.id,
            step_code: step.step_code,
            sequence: step.sequence,
            required_role: step.required_role,
            status: "pending",
            actor_user_id: null,
            comment: "",
            acted_at: null,
          }),
    );
  }

  const first = APPROVAL_CHAINS.purchase_order[0];
  const purchase_order = await repos.purchaseOrders.update(po.id, {
    status: "pending_approval",
    submitted_at: at,
    current_step_code: first.step_code,
    current_sequence: first.sequence,
    decision_comment: "",
  });

  return { purchase_order, approvals };
}

export const actOnPurchaseOrderInput = z
  .object({
    purchase_order_id: z.string().min(1),
    action: z.enum(["approve", "send_back", "reject"]),
    comment: z.string().default(""),
  })
  .refine((d) => d.action === "approve" || d.comment.trim().length > 0, {
    message: "sending back or rejecting needs a comment",
    path: ["comment"],
  });

export type ActOnPurchaseOrderInput = z.input<typeof actOnPurchaseOrderInput>;

/**
 * One chain step acts. Recommending moves the order on to the authorised
 * signatory; authorising makes it `approved`, which is what `issuePurchaseOrder`
 * needs. Sending back returns it to the officer as a draft; rejecting stops it.
 */
export async function actOnPurchaseOrder(
  input: ActOnPurchaseOrderInput,
  actor: ActingUser,
): Promise<{ purchase_order: PurchaseOrder; approval: Approval }> {
  assertCan(actor, "approve", "purchase_orders");
  const data = parseInput(actOnPurchaseOrderInput, input);
  const repos = getRepositories();

  const po = required(await repos.purchaseOrders.getById(data.purchase_order_id), "Purchase order");
  if (po.status !== "pending_approval") {
    throw new WorkflowError(`This purchase order is "${po.status}", not awaiting approval.`);
  }

  const step = await pendingPoStep(po.id);
  if (!step) throw new WorkflowError("This purchase order has no open approval step.");
  if (step.required_role !== actor.role) {
    throw new PermissionError(
      `This order is waiting on ${step.required_role.replace(/_/g, " ")}, not ${actor.role.replace(/_/g, " ")}.`,
    );
  }

  const at = nowIso();

  if (data.action !== "approve") {
    const approval = await repos.approvals.update(step.id, {
      status: data.action === "send_back" ? "sent_back" : "rejected",
      actor_user_id: actor.user_id,
      comment: data.comment,
      acted_at: at,
    });
    const next = data.action === "send_back" ? "sent_back" : "rejected";
    assertTransition("Purchase order", PO_TRANSITIONS, po.status, next);
    const purchase_order = await repos.purchaseOrders.update(po.id, {
      status: next,
      current_step_code: null,
      current_sequence: null,
      decision_comment: data.comment,
    });
    return { purchase_order, approval };
  }

  const approval = await repos.approvals.update(step.id, {
    status: "approved",
    actor_user_id: actor.user_id,
    comment: data.comment,
    acted_at: at,
  });

  const nextStep = APPROVAL_CHAINS.purchase_order.find((s) => s.sequence === step.sequence + 1);
  if (nextStep) {
    const purchase_order = await repos.purchaseOrders.update(po.id, {
      current_step_code: nextStep.step_code,
      current_sequence: nextStep.sequence,
    });
    return { purchase_order, approval };
  }

  assertTransition("Purchase order", PO_TRANSITIONS, po.status, "approved");
  const purchase_order = await repos.purchaseOrders.update(po.id, {
    status: "approved",
    current_step_code: null,
    current_sequence: null,
  });
  return { purchase_order, approval };
}

/**
 * A sent-back order returns to the officer's hands. Separate from editing so
 * the reopening is one deliberate act and the chain rows are only reset once.
 */
export async function reopenPurchaseOrder(
  purchase_order_id: string,
  actor: ActingUser,
): Promise<PurchaseOrder> {
  assertCan(actor, "edit", "purchase_orders");
  const repos = getRepositories();
  const po = required(await repos.purchaseOrders.getById(purchase_order_id), "Purchase order");
  assertTransition("Purchase order", PO_TRANSITIONS, po.status, "draft");
  return repos.purchaseOrders.update(po.id, {
    status: "draft",
    current_step_code: null,
    current_sequence: null,
  });
}

/* ------------------------------------------------------------------ */
/* B4 — issue                                                          */
/* ------------------------------------------------------------------ */

/**
 * B4. Issues the authorised order to the supplier, which locks it and makes it
 * visible to the GRN flow. Nothing can be received before this.
 */
export async function issuePurchaseOrder(
  purchase_order_id: string,
  actor: ActingUser,
): Promise<PurchaseOrder> {
  assertCan(actor, "edit", "purchase_orders");
  const repos = getRepositories();
  const po = required(await repos.purchaseOrders.getById(purchase_order_id), "Purchase order");
  assertTransition("Purchase order", PO_TRANSITIONS, po.status, "sent");
  return repos.purchaseOrders.update(po.id, {
    status: "sent",
    sent_at: nowIso(),
    current_step_code: null,
    current_sequence: null,
  });
}
