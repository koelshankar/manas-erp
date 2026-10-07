"use client";

import { useState } from "react";
import { Check, CornerUpLeft, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Field, PositionChip } from "@/components/common";
import { useActor, useServiceAction } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import {
  actOnPurchaseOrder,
  issuePurchaseOrder,
  reopenPurchaseOrder,
  submitPurchaseOrder,
} from "@/lib/services/po-service";
import { APPROVAL_CHAINS } from "@/config/permissions";
import type { PurchaseOrder } from "@/lib/domain";
import {
  AppDialog,
  AppDialogBody,
  AppDialogFooter,
  AppDialogHeader,
  SubmitButton,
} from "@/components/ui-app";

/**
 * The B3 sign-off and the B4 issue, wherever an order is open.
 *
 * Two levels, and only the lowest pending one is actionable — recommended by the
 * Manager Procurement, then authorised. Only the role that holds the step sees
 * its buttons; everyone else sees where the order is sitting and who with.
 */
export function PoApprovalActions({
  po,
  canEdit,
  onDone,
}: {
  po: PurchaseOrder;
  /** The officer's grant — submitting, reworking and issuing are all `edit`. */
  canEdit: boolean;
  onDone?: () => void;
}) {
  const { role } = useSession();
  const actor = useActor();
  const { run, pending } = useServiceAction();
  const [decision, setDecision] = useState<"send_back" | "reject" | null>(null);
  const [comment, setComment] = useState("");

  const step = APPROVAL_CHAINS.purchase_order.find((s) => s.sequence === po.current_sequence);
  const mine = po.status === "pending_approval" && step?.required_role === role;

  async function act(action: "approve" | "send_back" | "reject", withComment = "") {
    await run(
      () => actOnPurchaseOrder({ purchase_order_id: po.id, action, comment: withComment }, actor),
      {
        success: (r) =>
          action === "approve"
            ? r.purchase_order.status === "approved"
              ? `${r.purchase_order.po_number} authorised — ready to issue`
              : `${r.purchase_order.po_number} recommended`
            : action === "send_back"
              ? `${r.purchase_order.po_number} sent back to the Purchase Officer`
              : `${r.purchase_order.po_number} rejected`,
        onDone: () => {
          setDecision(null);
          setComment("");
          onDone?.();
        },
      },
    );
  }

  return (
    <>
      {po.status === "pending_approval" && step ? (
        <PositionChip
          status={po.status}
          waitingOn={step.label}
        />
      ) : null}

      {canEdit && po.status === "draft" ? (
        <Button
          disabled={pending}
          onClick={() =>
            run(() => submitPurchaseOrder(po.id, actor), {
              success: (r) => `${r.purchase_order.po_number} sent for approval`,
              onDone,
            })
          }
        >
          <Send className="size-3.5" /> Submit for approval
        </Button>
      ) : null}

      {canEdit && po.status === "sent_back" ? (
        <Button
          variant="outline"
          disabled={pending}
          onClick={() =>
            run(() => reopenPurchaseOrder(po.id, actor), {
              success: `${po.po_number} reopened as a draft`,
              onDone,
            })
          }
        >
          <CornerUpLeft className="size-3.5" /> Reopen as a draft
        </Button>
      ) : null}

      {mine ? (
        <>
          <Button variant="outline" disabled={pending} onClick={() => setDecision("send_back")}>
            <CornerUpLeft className="size-3.5" /> Send back
          </Button>
          <Button variant="destructive" disabled={pending} onClick={() => setDecision("reject")}>
            <X className="size-3.5" /> Reject
          </Button>
          <Button disabled={pending} onClick={() => void act("approve")}>
            <Check className="size-3.5" />{" "}
            {step?.sequence === 1 ? "Recommend" : "Authorise"}
          </Button>
        </>
      ) : null}

      {canEdit && po.status === "approved" ? (
        <Button
          disabled={pending}
          onClick={() =>
            run(() => issuePurchaseOrder(po.id, actor), {
              success: `${po.po_number} issued to the supplier`,
              onDone,
            })
          }
        >
          <Send className="size-3.5" /> Issue to supplier
        </Button>
      ) : null}

      <AppDialog open={decision !== null} onOpenChange={(v) => !v && setDecision(null)} size="sm">
        <AppDialogHeader
          title={decision === "reject" ? `Reject ${po.po_number}?` : `Send ${po.po_number} back?`}
          context={
            decision === "reject"
              ? "The order stops here. Nothing can be received against it, and it cannot be resubmitted."
              : "The order returns to the Purchase Officer as a draft. Your comment is what they see."
          }
        />
        <AppDialogBody>
          <Field label="Comment" required>
            <Textarea
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={
                decision === "reject"
                  ? "Why this order will not go out."
                  : "What needs changing before it comes back."
              }
            />
          </Field>
        </AppDialogBody>
        <AppDialogFooter>
          <Button variant="outline" onClick={() => setDecision(null)}>
            Cancel
          </Button>
          <SubmitButton
            type="button"
            submitting={pending}
            invalidReason={comment.trim().length === 0 ? "Say why, so the officer knows." : undefined}
            onClick={() => decision && void act(decision, comment)}
          >
            {decision === "reject" ? "Reject" : "Send back"}
          </SubmitButton>
        </AppDialogFooter>
      </AppDialog>
    </>
  );
}
