"use client";

import { useEffect, useState } from "react";
import { History } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { DetailRow, Field, RecordTrail, StatusPill } from "@/components/common";
import { ChainTracker } from "./chain-tracker";
import {
  useActor,
  useAllRows,
  useLookups,
  useProjectRows,
  useServiceAction,
} from "@/lib/hooks";
import { actOnRaBill } from "@/lib/services/billing-service";
import { APPROVAL_CHAINS, ROLE_LABEL } from "@/config/permissions";
import { useSession } from "@/lib/session";
import { formatDateTime, formatInr, formatNumber } from "@/lib/format";
import type {
  Approval,
  RaBill,
  RaBillLine,
  RaBillRevision,
} from "@/lib/domain";
import { cn } from "cn";
import {
  AppDialog,
  AppDialogBody,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from "@/components/ui-app";

/**
 * C3–C4 — the certification screen.
 *
 * The action panel only appears for the role whose step is pending, and only
 * for the lowest pending sequence. Adjusting a certified quantity needs a
 * comment and is written to the revision log.
 */
export function CertificationSheet({
  bill,
  open,
  onOpenChange,
  projectId,
  showValues,
}: {
  bill: RaBill | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  showValues: boolean;
}) {
  const allBills = useProjectRows("ra_bills", projectId) as RaBill[];
  const allLines = useProjectRows("ra_bill_lines", projectId) as RaBillLine[];
  const allRevisions = useAllRows("ra_bill_revisions") as RaBillRevision[];
  const approvals = useAllRows("approvals") as Approval[];
  const lookup = useLookups();
  const { role } = useSession();
  const actor = useActor();
  const { run, pending } = useServiceAction();

  const [comment, setComment] = useState("");
  const [draft, setDraft] = useState<Record<string, string>>({});

  const live = bill ? (allBills.find((b) => b.id === bill.id) ?? bill) : null;
  const lines = live ? allLines.filter((l) => l.ra_bill_id === live.id) : [];

  useEffect(() => {
    setComment("");
    setDraft(
      Object.fromEntries(lines.map((l) => [l.id, String(l.certified_qty)])),
    );
    // Reset only when the sheet is pointed at a different bill.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live?.id, lines.length]);

  if (!live) return null;

  const chain = approvals
    .filter((a) => a.entity_type === "ra_bill" && a.entity_id === live.id)
    .sort((a, b) => a.sequence - b.sequence);
  const revisions = allRevisions
    .filter((r) => r.ra_bill_id === live.id)
    .sort((a, b) => a.acted_at.localeCompare(b.acted_at));

  const pendingStep = chain
    .filter((a) => a.status === "pending")
    .sort((a, b) => a.sequence - b.sequence)[0];
  const stepSpec = pendingStep
    ? APPROVAL_CHAINS.ra_bill.find((s) => s.sequence === pendingStep.sequence)
    : null;
  const isMyStep = Boolean(pendingStep && pendingStep.required_role === role);
  const canAct = live.status === "in_certification" && isMyStep;

  const adjustments = lines
    .filter(
      (l) =>
        draft[l.id] !== undefined &&
        Math.abs(Number(draft[l.id]) - l.certified_qty) > 0.0005,
    )
    .map((l) => ({
      ra_bill_line_id: l.id,
      certified_qty: Number(draft[l.id]),
    }));

  const projectedGross = lines.reduce((s, l) => {
    const value =
      draft[l.id] !== undefined ? Number(draft[l.id]) : l.certified_qty;
    return s + value * l.rate;
  }, 0);

  async function act(action: "approve" | "send_back" | "reject") {
    await run(
      () =>
        actOnRaBill(
          {
            ra_bill_id: live!.id,
            action,
            comment,
            adjustments: action === "approve" ? adjustments : [],
          },
          actor,
        ),
      {
        success: (r) =>
          action === "approve"
            ? r.bill.status === "certified"
              ? "Certified — ready to hand over to Accounts"
              : `Approved — now with ${
                  ROLE_LABEL[
                    APPROVAL_CHAINS.ra_bill.find(
                      (s) => s.sequence === r.bill.current_sequence,
                    )?.required_role ?? "project_qs"
                  ]
                }`
            : action === "send_back"
              ? "Sent back to the QS as a draft"
              : "Bill rejected",
        onDone: () => setComment(""),
      },
    );
  }

  return (
    <AppDialog open={open} onOpenChange={onOpenChange} size="xl">
      <AppDialogHeader>
        <AppDialogTitle className="flex flex-wrap items-center gap-3">
          <span className="font-mono">{live.bill_number}</span>
          <StatusPill status={live.status} />
        </AppDialogTitle>
        <AppDialogDescription>
          {lookup.contractor(live.contractor_id)} ·{" "}
          {lookup.workOrder(live.work_order_id)}
        </AppDialogDescription>
      </AppDialogHeader>

      <AppDialogBody className="space-y-6">
        <RecordTrail entityType="ra_bill" entityId={live.id} />

        <ChainTracker approvals={chain} />

        <dl className="divide-y divide-border/60">
          <DetailRow label="Prepared by">
            {lookup.user(live.prepared_by_user_id)}
          </DetailRow>
          {live.submitted_at ? (
            <DetailRow label="Submitted">
              {formatDateTime(live.submitted_at)}
            </DetailRow>
          ) : null}
          <DetailRow label="Waiting on">
            {stepSpec
              ? `${ROLE_LABEL[stepSpec.required_role]} — ${stepSpec.step_code}`
              : "Nobody"}
          </DetailRow>
          {showValues ? (
            <>
              <DetailRow label="Gross this bill">
                {formatInr(live.gross_amount)}
              </DetailRow>
              <DetailRow label="Net payable">
                {formatInr(live.net_payable_amount)}
              </DetailRow>
            </>
          ) : null}
        </dl>

        <section>
          <h3 className="mb-3 text-sm font-semibold">Claimed vs certified</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/70 text-xs text-muted-foreground">
                  <th className="py-2 pr-3 text-left font-medium">BOQ</th>
                  <th className="py-2 pr-3 text-left font-medium">
                    Description
                  </th>
                  <th className="py-2 pr-3 text-right font-medium">Claimed</th>
                  <th className="py-2 pr-3 text-right font-medium">
                    Certified
                  </th>
                  {showValues ? (
                    <>
                      <th className="py-2 pr-3 text-right font-medium">Rate</th>
                      <th className="py-2 text-right font-medium">Amount</th>
                    </>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const value =
                    draft[l.id] !== undefined
                      ? Number(draft[l.id])
                      : l.certified_qty;
                  const cut = value < l.claimed_qty - 0.0005;
                  const over = value > l.claimed_qty + 0.0005;
                  return (
                    <tr
                      key={l.id}
                      className="border-b border-border/40 last:border-0"
                    >
                      <td className="py-2 pr-3 font-mono text-xs">
                        {lookup.boqItem(l.boq_line_id)}
                      </td>
                      <td className="py-2 pr-3">{l.description}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                        {formatNumber(l.claimed_qty, 2)} {l.unit}
                      </td>
                      <td className="py-2 pr-3 text-right">
                        {canAct ? (
                          <Input
                            type="number"
                            step="any"
                            min={0}
                            max={l.claimed_qty}
                            className="ml-auto h-7 w-28 text-right"
                            value={draft[l.id] ?? String(l.certified_qty)}
                            onChange={(e) =>
                              setDraft((d) => ({
                                ...d,
                                [l.id]: e.target.value,
                              }))
                            }
                            aria-invalid={over || undefined}
                          />
                        ) : (
                          <span
                            className={cn(
                              "tabular-nums",
                              l.certified_qty < l.claimed_qty &&
                                "font-medium text-warning",
                            )}
                          >
                            {formatNumber(l.certified_qty, 2)} {l.unit}
                          </span>
                        )}
                        {over ? (
                          <span className="block text-[11px] text-destructive">
                            Cannot exceed the claimed quantity
                          </span>
                        ) : cut && canAct ? (
                          <span className="block text-[11px] text-warning">
                            Reduced by {formatNumber(l.claimed_qty - value, 2)}
                          </span>
                        ) : null}
                      </td>
                      {showValues ? (
                        <>
                          <td className="py-2 pr-3 text-right tabular-nums">
                            {formatInr(l.rate)}
                          </td>
                          <td className="py-2 text-right tabular-nums">
                            {formatInr(value * l.rate)}
                          </td>
                        </>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {canAct && showValues && adjustments.length > 0 ? (
            <p className="mt-2 text-right text-xs text-muted-foreground">
              Gross would become{" "}
              <span className="font-medium text-foreground">
                {formatInr(projectedGross)}
              </span>{" "}
              (was {formatInr(live.gross_amount)})
            </p>
          ) : null}
        </section>

        {revisions.length > 0 ? (
          <section>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <History className="size-4" /> Revision history
            </h3>
            <ul className="space-y-2">
              {revisions.map((r) => {
                const line = lines.find((l) => l.id === r.ra_bill_line_id);
                return (
                  <li
                    key={r.id}
                    className="rounded-lg bg-muted/50 px-3 py-2.5 text-sm"
                  >
                    <p>
                      <span className="font-mono text-xs text-muted-foreground">
                        {r.step_code}
                      </span>{" "}
                      <span className="font-medium">
                        {lookup.user(r.user_id)}
                      </span>{" "}
                      changed {line?.description ?? "a line"} from{" "}
                      <span className="tabular-nums">
                        {formatNumber(r.from_qty, 2)}
                      </span>{" "}
                      to{" "}
                      <span className="font-medium tabular-nums">
                        {formatNumber(r.to_qty, 2)}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(r.acted_at)}
                      {r.comment ? ` · “${r.comment}”` : ""}
                    </p>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {canAct ? (
          <Card className="px-4 py-4">
            <h3 className="mb-1 text-sm font-semibold">
              Your step — {stepSpec?.step_code} {stepSpec?.label}
            </h3>
            <p className="mb-3 text-xs text-muted-foreground">
              Approving passes the bill to the next step. Sending it back
              returns it to the QS as a draft.
            </p>
            <Field
              label="Comment"
              hint="Required to send back, reject, or change a certified quantity."
            >
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={2}
                placeholder="Checked against the measurement sheet."
              />
            </Field>
          </Card>
        ) : live.status === "in_certification" ? (
          <p className="text-sm text-muted-foreground">
            This bill is waiting on{" "}
            {stepSpec ? ROLE_LABEL[stepSpec.required_role] : "the next step"} —
            you cannot act on it from your role.
          </p>
        ) : null}

        {live.decision_comment && live.status !== "in_certification" ? (
          <p className="rounded-lg bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground italic">
            “{live.decision_comment}”
          </p>
        ) : null}
      </AppDialogBody>

      {canAct ? (
        <AppDialogFooter className="flex-wrap">
          <Button
            variant="outline"
            onClick={() => act("send_back")}
            disabled={pending}
          >
            Send back
          </Button>
          <Button
            variant="destructive"
            onClick={() => act("reject")}
            disabled={pending}
          >
            Reject
          </Button>
          <Button onClick={() => act("approve")} disabled={pending}>
            {pending
              ? "Recording…"
              : adjustments.length > 0
                ? `Approve with ${adjustments.length} change${adjustments.length > 1 ? "s" : ""}`
                : "Approve"}
          </Button>
        </AppDialogFooter>
      ) : null}
    </AppDialog>
  );
}
