"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import {
  Attachments,
  DetailRow,
  Field,
  PrintButton,
  RecordTrail,
  StatusPill,
} from "@/components/common";
import { useAccess, useActor, useAllRows, useLookups, useProjectRows, useServiceAction } from "@/lib/hooks";
import { decideComparative } from "@/lib/services/purchase-service";
import {
  formatDate,
  formatDateTime,
  formatInr,
  formatNumber,
} from "@/lib/format";
import type {
  Approval,
  Comparative,
  ComparativeLine,
  Quote,
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
 * The comparative matrix, read-only, plus the B2 decision when the viewer is
 * the Purchase Head and the comparative is waiting on them.
 */
export function ComparativeSheet({
  comparative,
  open,
  onOpenChange,
  projectId,
  canDecide,
  showValues,
}: {
  comparative: Comparative | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  canDecide: boolean;
  showValues: boolean;
}) {
  const allLines = useProjectRows(
    "comparative_lines",
    projectId,
  ) as ComparativeLine[];
  const allComparatives = useProjectRows(
    "comparatives",
    projectId,
  ) as Comparative[];
  const allQuotes = useProjectRows("quotes", projectId) as Quote[];
  const approvals = useAllRows("approvals") as Approval[];
  const lookup = useLookups();
  const actor = useActor();
  const { run, pending } = useServiceAction();
  const access = useAccess("comparatives");
  const [comment, setComment] = useState("");

  const lines = useMemo(
    () =>
      comparative
        ? allLines.filter((l) => l.comparative_id === comparative.id)
        : [],
    [allLines, comparative],
  );

  // The live row, so a decision taken here updates this sheet immediately.
  const live = comparative
    ? (allComparatives.find((c) => c.id === comparative.id) ?? comparative)
    : null;
  if (!live) return null;

  const gate = approvals.find(
    (a) => a.entity_type === "comparative" && a.entity_id === live.id,
  );
  const pendingDecision = live.status === "pending_approval";

  async function decide(decision: "approve" | "send_back" | "reject") {
    await run(
      () =>
        decideComparative(
          { comparative_id: comparative!.id, decision, comment },
          actor,
        ),
      {
        success:
          decision === "approve"
            ? "Approved — rates are now fixed"
            : decision === "send_back"
              ? "Sent back to the Purchase Officer"
              : "Comparative rejected",
        onDone: () => {
          setComment("");
          onOpenChange(false);
        },
      },
    );
  }

  return (
    <AppDialog open={open} onOpenChange={onOpenChange} size="xl">
      <AppDialogHeader>
        <AppDialogTitle className="flex items-center gap-3 font-mono">
          {live.comparative_number}
          <StatusPill status={live.status} />
        </AppDialogTitle>
        <AppDialogDescription>
          Prepared by {lookup.user(live.prepared_by_user_id)} on{" "}
          {formatDate(live.prepared_date)}
        </AppDialogDescription>
      </AppDialogHeader>

      <AppDialogBody className="space-y-6" data-print-area>
        <RecordTrail entityType="comparative" entityId={live.id} />

        <Attachments
          entityType="comparative"
          entityId={live.id}
          projectId={live.project_id}
          canEdit={access.canEdit}
        />

        <dl className="divide-y divide-border/60">
          {showValues ? (
            <DetailRow label="Selected value">
              {formatInr(live.total_selected_value)}
            </DetailRow>
          ) : null}
          <DetailRow label="B2 gate">
            {gate ? <StatusPill status={gate.status} /> : "Not submitted"}
          </DetailRow>
          {live.decided_at ? (
            <DetailRow label="Decided">
              {lookup.user(live.decided_by_user_id)} ·{" "}
              {formatDateTime(live.decided_at)}
            </DetailRow>
          ) : null}
        </dl>

        {live.decision_comment ? (
          <p className="rounded-lg bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground italic">
            “{live.decision_comment}”
          </p>
        ) : null}

        {lines.map((line) => {
          const quotes = allQuotes.filter(
            (q) => q.comparative_line_id === line.id,
          );
          return (
            <Card key={line.id} className="px-4 py-4">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">
                    {lookup.material(line.material_id)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {lookup.indentNumber(line.indent_id)} ·{" "}
                    {lookup.boqItem(line.boq_line_id)}
                  </p>
                </div>
                <p className="text-sm font-medium tabular-nums">
                  {formatNumber(line.quantity, 2)} {line.unit}
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/70 text-xs text-muted-foreground">
                      <th className="py-2 pr-3 text-left font-medium">
                        Supplier
                      </th>
                      <th className="py-2 pr-3 text-left font-medium">State</th>
                      {showValues ? (
                        <>
                          <th className="py-2 pr-3 text-right font-medium">
                            Rate
                          </th>
                          <th className="py-2 pr-3 text-right font-medium">
                            GST
                          </th>
                          <th className="py-2 pr-3 text-right font-medium">
                            Freight
                          </th>
                        </>
                      ) : null}
                      <th className="py-2 pr-3 text-right font-medium">Days</th>
                      <th className="py-2 pr-3 text-left font-medium">Terms</th>
                      {showValues ? (
                        <th className="py-2 text-right font-medium">
                          Landed rate
                        </th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {quotes.map((q) => (
                      <tr
                        key={q.id}
                        className={cn(
                          "border-b border-border/40 last:border-0",
                          q.is_selected && "bg-muted/60",
                        )}
                      >
                        <td className="py-2 pr-3">
                          <span className="flex items-center gap-2 whitespace-nowrap">
                            {q.is_selected ? (
                              <span className="size-1.5 rounded-full bg-team-purchase" />
                            ) : (
                              <span className="size-1.5" />
                            )}
                            {lookup.supplier(q.supplier_id)}
                            {q.is_l1 ? (
                              <span className="rounded-full bg-success-soft px-1.5 py-0.5 text-[10px] font-semibold text-success ring-1 ring-success/30">
                                L1
                              </span>
                            ) : null}
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-xs text-muted-foreground">
                          {lookup.supplierState(q.supplier_id)}
                        </td>
                        {showValues ? (
                          <>
                            <td className="py-2 pr-3 text-right tabular-nums">
                              {formatInr(q.rate)}
                            </td>
                            <td className="py-2 pr-3 text-right tabular-nums">
                              {q.gst_percent}%
                            </td>
                            <td className="py-2 pr-3 text-right tabular-nums">
                              {formatInr(q.freight_amount)}
                            </td>
                          </>
                        ) : null}
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {q.delivery_days}
                        </td>
                        <td className="py-2 pr-3 text-xs whitespace-nowrap">
                          {q.payment_terms}
                        </td>
                        {showValues ? (
                          <td
                            className={cn(
                              "py-2 text-right whitespace-nowrap tabular-nums",
                              q.is_l1 && "font-semibold text-success",
                            )}
                          >
                            {formatInr(q.landed_rate)}
                            <span className="block text-[10px] text-muted-foreground">
                              {formatInr(q.landed_amount)} total
                            </span>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="mt-3 text-sm">
                Selected:{" "}
                <span className="font-medium">
                  {lookup.supplier(line.selected_supplier_id)}
                </span>
                {line.is_l1_selected ? (
                  <span className="ml-2 text-xs text-success">
                    L1 on landed cost
                  </span>
                ) : (
                  <span className="ml-2 text-xs text-warning">Not L1</span>
                )}
              </p>
              {line.justification ? (
                <p className="mt-1 text-xs text-muted-foreground italic">
                  “{line.justification}”
                </p>
              ) : null}
            </Card>
          );
        })}

        {canDecide && pendingDecision ? (
          <Field
            label="Comment"
            hint="Required to send back or reject. Recorded on the approval row."
          >
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              placeholder="Rates approved. Raise the purchase orders."
            />
          </Field>
        ) : null}
      </AppDialogBody>

      {canDecide && pendingDecision ? (
        <AppDialogFooter className="flex-wrap">
          <PrintButton />
          <Button
            variant="outline"
            onClick={() => decide("send_back")}
            disabled={pending}
          >
            Send back
          </Button>
          <Button
            variant="destructive"
            onClick={() => decide("reject")}
            disabled={pending}
          >
            Reject
          </Button>
          <Button onClick={() => decide("approve")} disabled={pending}>
            {pending ? "Recording…" : "Approve"}
          </Button>
        </AppDialogFooter>
      ) : null}
    </AppDialog>
  );
}
