"use client";

import { useState } from "react";
import { useMarkSeen } from "@/lib/hooks/use-unseen";
import { Download, FileClock, Mail, Pencil } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Field, PrintButton, RecordTrail, StatusPill } from "@/components/common";
import {
  useActor,
  useAllRows,
  useLookups,
  useProjectRows,
  useServiceAction,
} from "@/lib/hooks";
import { amendPurchaseOrder } from "@/lib/services/po-service";
import { PoApprovalActions } from "@/components/purchase/po-approval-actions";
import { PoDocument } from "@/components/purchase/po-document";
import { buildPoPdf, downloadBlob, type PoPdfInput } from "@/lib/files/po-pdf";
import { formatDate, formatDateTime, formatInr } from "@/lib/format";
import { APPROVAL_CHAINS, awaitingStepText } from "@/config/permissions";
import type {
  Approval,
  Indent,
  PoAmendment,
  PoDeliverySchedule,
  PoDeliveryScheduleLine,
  PoLine,
  PoTerm,
  Project,
  PurchaseOrder,
  Supplier,
} from "@/lib/domain";
import {
  AppDialog,
  AppDialogBody,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
  SubmitButton,
} from "@/components/ui-app";

/**
 * B3–B4 — the purchase order as the document the supplier gets, plus everything
 * that is about the order rather than on it: where it sits in the sign-off, its
 * amendment history, and the actions whoever is reading it may take.
 *
 * The paper itself is `<PoDocument>`, which is the only thing marked
 * `data-print-area`; all of this chrome is left off the printout.
 */
export function PoDocumentSheet({
  po,
  open,
  onOpenChange,
  projectId,
  canSend,
  showValues,
}: {
  po: PurchaseOrder | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  canSend: boolean;
  showValues: boolean;
}) {
  useMarkSeen("purchase_order", open ? po?.id : null);
  const allLines = useProjectRows("po_lines", projectId) as PoLine[];
  const allPos = useProjectRows("purchase_orders", projectId) as PurchaseOrder[];
  const allSchedules = useProjectRows("po_delivery_schedules", projectId) as PoDeliverySchedule[];
  const allScheduleLines = useProjectRows(
    "po_delivery_schedule_lines",
    projectId,
  ) as PoDeliveryScheduleLine[];
  const allTerms = useProjectRows("po_terms", projectId) as PoTerm[];
  const allAmendments = useProjectRows("po_amendments", projectId) as PoAmendment[];
  const indentRows = useProjectRows("indents", projectId) as Indent[];
  const approvals = useAllRows("approvals") as Approval[];
  const projects = useAllRows("projects") as Project[];
  const suppliers = useAllRows("suppliers") as Supplier[];
  const lookup = useLookups();

  // The live row, so acting on the order updates this sheet immediately.
  const live = po ? (allPos.find((p) => p.id === po.id) ?? po) : null;
  if (!live) return null;

  const lines = allLines.filter((l) => l.purchase_order_id === live.id);
  const schedules = allSchedules
    .filter((s) => s.purchase_order_id === live.id)
    .sort((a, b) => a.sequence - b.sequence);
  const scheduleLines = allScheduleLines.filter((l) => l.purchase_order_id === live.id);
  const terms = allTerms
    .filter((t) => t.purchase_order_id === live.id)
    .sort((a, b) => a.sequence - b.sequence);
  const amendments = allAmendments
    .filter((a) => a.purchase_order_id === live.id)
    .sort((a, b) => b.amend_no - a.amend_no);
  const project = projects.find((p) => p.id === live.project_id);
  const supplier = suppliers.find((s) => s.id === live.supplier_id);
  const indents = live.indent_ids
    .map((id) => indentRows.find((i) => i.id === id))
    .filter((i): i is Indent => Boolean(i))
    .sort((a, b) => a.indent_number.localeCompare(b.indent_number));

  /** The two signature blocks the chain fills in. */
  const chainRows = approvals.filter(
    (a) => a.entity_type === "purchase_order" && a.entity_id === live.id,
  );
  const signedBy = (sequence: number) => {
    const row = chainRows.find((a) => a.sequence === sequence && a.status === "approved");
    return row?.actor_user_id ? lookup.user(row.actor_user_id) : null;
  };

  const pdf: PoPdfInput = {
    po: live,
    lines,
    schedules,
    scheduleLines,
    terms,
    project,
    supplier,
    indents,
    preparedBy: lookup.user(live.raised_by_user_id),
    recommendedBy: signedBy(1),
    authorisedBy: signedBy(2),
    showValues,
    materialLabel: (id) => lookup.material(id),
    materialSpec: (id) => lookup.materialSpec(id),
  };

  return (
    <AppDialog open={open} onOpenChange={onOpenChange} size="xl">
      <AppDialogHeader className="print:hidden">
        <AppDialogTitle className="flex flex-wrap items-center gap-3 font-mono">
          {live.po_number}
          {live.amend_no > 0 ? (
            <span className="rounded-full bg-info-soft px-1.5 py-0.5 font-sans text-xs font-semibold text-info ring-1 ring-info/30">
              Amendment {live.amend_no}
            </span>
          ) : null}
          <StatusPill status={live.status} awaiting={live.status === "pending_approval" ? awaitingStepText("purchase_order", live.current_sequence) : null} />
        </AppDialogTitle>
        <AppDialogDescription>
          Raised by {lookup.user(live.raised_by_user_id)} on {formatDate(live.po_date)}
          {live.sent_at ? ` · issued ${formatDate(live.sent_at)}` : ""}
        </AppDialogDescription>
      </AppDialogHeader>

      <AppDialogBody>
        <div className="mb-4 space-y-3 print:hidden">
          <RecordTrail entityType="purchase_order" entityId={live.id} />

          {live.status === "sent_back" && live.decision_comment ? (
            <Card className="border-l-2 border-l-destructive px-4 py-3">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Sent back
              </p>
              <p className="mt-1 text-sm leading-relaxed">{live.decision_comment}</p>
            </Card>
          ) : null}

          {live.amend_no > 0 && live.amend_reason ? (
            <Card className="px-4 py-3">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Amendment {live.amend_no}
              </p>
              <p className="mt-1 text-sm leading-relaxed">{live.amend_reason}</p>
            </Card>
          ) : null}

          <ChainProgress rows={chainRows} userName={(id) => lookup.user(id)} />

          {live.send_record ? (
            <SendRecord record={live.send_record} userName={(id) => lookup.user(id)} />
          ) : null}

          {amendments.length > 0 ? (
            <AmendmentHistory
              amendments={amendments}
              userName={(id) => lookup.user(id)}
              showValues={showValues}
            />
          ) : null}
        </div>

        <PoDocument
          po={live}
          lines={lines}
          schedules={schedules}
          scheduleLines={scheduleLines}
          terms={terms}
          project={project}
          supplier={supplier}
          indents={indents}
          preparedBy={lookup.user(live.raised_by_user_id)}
          recommendedBy={signedBy(1)}
          authorisedBy={signedBy(2)}
          showValues={showValues}
          materialLabel={(id) => lookup.material(id)}
          materialSpec={(id) => lookup.materialSpec(id)}
        />
      </AppDialogBody>

      <AppDialogFooter className="print:hidden">
        <PrintButton label="Print" />
        <PdfButton pdf={pdf} />
        {canSend && live.status === "draft" ? (
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={
              <Link
                href={`/projects/${projectId}/procurement/purchase-orders/${live.id}/edit`}
              />
            }
          >
            <Pencil className="size-3.5" /> Edit
          </Button>
        ) : null}
        {canSend && (live.status === "approved" || live.status === "sent") ? (
          <AmendButton po={live} onDone={() => onOpenChange(false)} />
        ) : null}
        <PoApprovalActions po={live} canEdit={canSend} pdf={pdf} onDone={() => onOpenChange(false)} />
      </AppDialogFooter>
    </AppDialog>
  );
}

/** Builds the PDF and downloads it under the PO's own number. */
function PdfButton({ pdf }: { pdf: PoPdfInput }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={busy}
      data-print-hide
      onClick={async () => {
        setBusy(true);
        try {
          const { blob, fileName } = await buildPoPdf(pdf);
          downloadBlob(blob, fileName);
        } catch (error) {
          toast.error("The PDF could not be built", {
            description: error instanceof Error ? error.message : undefined,
          });
        } finally {
          setBusy(false);
        }
      }}
    >
      <Download className="size-3.5" /> {busy ? "Building…" : "Download PDF"}
    </Button>
  );
}

/** The email the order went out in, read back. */
function SendRecord({
  record,
  userName,
}: {
  record: NonNullable<PurchaseOrder["send_record"]>;
  userName: (id: string) => string;
}) {
  return (
    <Card className="px-4 py-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        <Mail className="size-3.5" /> Sent to supplier
      </p>
      <dl className="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[5rem_1fr]">
        <dt className="text-muted-foreground">From</dt>
        <dd className="min-w-0 break-words">{record.from}</dd>
        <dt className="text-muted-foreground">To</dt>
        <dd className="min-w-0 break-words">{record.to}</dd>
        {record.cc ? (
          <>
            <dt className="text-muted-foreground">CC</dt>
            <dd className="min-w-0 break-words">{record.cc}</dd>
          </>
        ) : null}
        {record.bcc ? (
          <>
            <dt className="text-muted-foreground">BCC</dt>
            <dd className="min-w-0 break-words">{record.bcc}</dd>
          </>
        ) : null}
        <dt className="text-muted-foreground">Subject</dt>
        <dd className="min-w-0 break-words font-medium">{record.subject}</dd>
        <dt className="text-muted-foreground">Attachment</dt>
        <dd className="min-w-0 break-words">{record.attachment_name}</dd>
      </dl>
      {record.body ? (
        <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-muted-foreground">
          {record.body}
        </p>
      ) : null}
      <p className="mt-2 text-xs text-muted-foreground">
        {userName(record.sent_by_user_id)} · {formatDateTime(record.sent_at)}
        {record.simulated ? " · Demo: recorded, not transmitted." : ""}
      </p>
    </Card>
  );
}

/** Where the order is in its two-level sign-off, and who has acted. */
function ChainProgress({
  rows,
  userName,
}: {
  rows: Approval[];
  userName: (id: string) => string;
}) {
  if (rows.length === 0) return null;
  return (
    <Card className="px-4 py-3">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Sign-off
      </p>
      <ol className="mt-2 space-y-1.5">
        {APPROVAL_CHAINS.purchase_order.map((step) => {
          const row = rows.find((r) => r.sequence === step.sequence);
          return (
            <li key={step.sequence} className="flex flex-wrap items-baseline gap-x-2 text-sm">
              <span className="font-medium">{step.label}</span>
              <span className="text-muted-foreground">
                {!row || row.status === "pending"
                  ? "— waiting"
                  : `— ${row.status === "approved" ? "done" : row.status.replace(/_/g, " ")} by ${
                      row.actor_user_id ? userName(row.actor_user_id) : "—"
                    }${row.acted_at ? `, ${formatDateTime(row.acted_at)}` : ""}`}
              </span>
              {row?.comment ? (
                <span className="basis-full text-xs leading-relaxed text-muted-foreground">
                  {row.comment}
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

/** Every version this order has been through, newest first. */
function AmendmentHistory({
  amendments,
  userName,
  showValues,
}: {
  amendments: PoAmendment[];
  userName: (id: string) => string;
  showValues: boolean;
}) {
  return (
    <Card className="px-4 py-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        <FileClock className="size-3.5" /> Version history
      </p>
      <ol className="mt-2 space-y-2">
        {amendments.map((a) => (
          <li key={a.id} className="text-sm">
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-medium">
                {a.amend_no === 0 ? "Original issue" : `Amendment ${a.amend_no}`}
              </span>
              <span className="text-xs text-muted-foreground">
                replaced by {userName(a.amended_by_user_id)} on {formatDate(a.created_at)}
                {showValues ? ` · was ${formatInr(a.previous_total_amount)}` : ""}
              </span>
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">{a.reason}</p>
          </li>
        ))}
      </ol>
    </Card>
  );
}

/** Raising an amendment: a reason, then the order reopens as a draft. */
function AmendButton({ po, onDone }: { po: PurchaseOrder; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const actor = useActor();
  const { run, pending } = useServiceAction();

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <FileClock className="size-3.5" /> Amend
      </Button>
      <AppDialog open={open} onOpenChange={setOpen} size="sm">
        <AppDialogHeader
          title={`Amend ${po.po_number}?`}
          context={`The order as it stands is archived as version ${po.amend_no}, "PO Amend No." becomes ${
            po.amend_no + 1
          }, and it reopens as a draft to be changed and signed off again.`}
        />
        <AppDialogBody>
          <Field label="Reason for the amendment" required>
            <Textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Supplier revised the cement rate with effect from 1 Nov."
            />
          </Field>
        </AppDialogBody>
        <AppDialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <SubmitButton
            type="button"
            submitting={pending}
            invalidReason={
              reason.trim().length < 5 ? "Say why the order is being amended." : undefined
            }
            onClick={() =>
              void run(
                () => amendPurchaseOrder({ purchase_order_id: po.id, reason }, actor),
                {
                  success: (r) =>
                    `${r.purchase_order.po_number} reopened as amendment ${r.purchase_order.amend_no}`,
                  onDone: () => {
                    setOpen(false);
                    setReason("");
                    onDone();
                  },
                },
              )
            }
          >
            Amend
          </SubmitButton>
        </AppDialogFooter>
      </AppDialog>
    </>
  );
}
