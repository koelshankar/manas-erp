"use client";

import { Printer, Send, SendHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DetailRow, RecordTrail, StatusPill } from "@/components/common";
import {
  useActor,
  useLookups,
  useProjectRows,
  useServiceAction,
} from "@/lib/hooks";
import { handOverRaBill, submitRaBill } from "@/lib/services/billing-service";
import {
  formatDate,
  formatInr,
  formatNumber,
  formatPercent,
  humanise,
} from "@/lib/format";
import type {
  JointMeasurement,
  JointMeasurementLine,
  RaBill,
  RaBillLine,
  WorkOrder,
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
import { contractorTypeLabel } from "@/config/labels";

/**
 * C2 — the running-account bill as a document: the abstract (previous / this
 * bill / cumulative), the deductions, and the measurement sheet behind it.
 *
 * `print:` rules in globals.css give the abstract and the measurement sheet a
 * page each.
 */
export function RaBillSheet({
  bill,
  open,
  onOpenChange,
  projectId,
  canSubmit,
  canHandOver,
  showValues,
}: {
  bill: RaBill | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  canSubmit: boolean;
  canHandOver: boolean;
  showValues: boolean;
}) {
  const allBills = useProjectRows("ra_bills", projectId) as RaBill[];
  const allLines = useProjectRows("ra_bill_lines", projectId) as RaBillLine[];
  const measurements = useProjectRows(
    "joint_measurements",
    projectId,
  ) as JointMeasurement[];
  const jmLines = useProjectRows(
    "joint_measurement_lines",
    projectId,
  ) as JointMeasurementLine[];
  const workOrders = useProjectRows("work_orders", projectId) as WorkOrder[];
  const lookup = useLookups();
  const actor = useActor();
  const { run, pending } = useServiceAction();

  // The live row, so submitting from inside this sheet moves its own footer.
  const live = bill ? (allBills.find((b) => b.id === bill.id) ?? bill) : null;
  if (!live) return null;

  const lines = allLines.filter((l) => l.ra_bill_id === live.id);
  const workOrder = workOrders.find((w) => w.id === live.work_order_id);
  const sheets = measurements.filter((m) =>
    live.joint_measurement_ids.includes(m.id),
  );

  async function submit() {
    await run(() => submitRaBill(live!.id, actor), {
      success: "Sent into the certification chain — waiting on the Project QS",
    });
  }

  async function handOver() {
    await run(() => handOverRaBill(live!.id, actor), {
      success: "Handed over to Accounts",
    });
  }

  return (
    <AppDialog open={open} onOpenChange={onOpenChange} size="xl">
      <AppDialogHeader className="print:hidden">
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
        <RecordTrail
          entityType="ra_bill"
          entityId={live.id}
          className="print:hidden"
        />

        {live.decision_comment && live.status === "draft" ? (
          <p className="rounded-lg bg-warning-soft px-3 py-2.5 text-sm text-warning ring-1 ring-warning/30 print:hidden">
            Sent back: “{live.decision_comment}”
          </p>
        ) : null}

        <article id="ra-bill-print-area"
          data-print-area className="space-y-6">
          {/* ---- Page 1: the abstract ---- */}
          <section className="print-page rounded-xl bg-card p-6 ring-1 ring-border print:ring-0">
            <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
              <div>
                <p className="text-lg font-semibold tracking-tight">
                  Manas Developers LLP
                </p>
                <p className="text-xs text-muted-foreground">
                  Running account bill — {lookup.contractor(live.contractor_id)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs tracking-wide text-muted-foreground uppercase">
                  RA Bill {String(live.bill_sequence).padStart(2, "0")}
                </p>
                <p className="font-mono text-sm font-semibold">
                  {live.bill_number}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(live.bill_date)}
                </p>
              </div>
            </header>

            <dl className="mt-4 grid gap-x-8 gap-y-2 sm:grid-cols-2">
              <DetailRow label="Work order">
                {lookup.workOrder(live.work_order_id)}
              </DetailRow>
              <DetailRow label="Period">
                {formatDate(live.period_from)} – {formatDate(live.period_to)}
              </DetailRow>
              <DetailRow label="Prepared by">
                {lookup.user(live.prepared_by_user_id)}
              </DetailRow>
              <DetailRow label="Measurements">
                {sheets.map((m) => m.measurement_number).join(", ") || "—"}
              </DetailRow>
            </dl>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y border-border text-xs text-muted-foreground">
                    <th className="py-2 pr-3 text-left font-medium">BOQ</th>
                    <th className="py-2 pr-3 text-left font-medium">
                      Description
                    </th>
                    <th className="py-2 pr-3 text-right font-medium">Rate</th>
                    <th className="py-2 pr-3 text-right font-medium">
                      Previous
                    </th>
                    <th className="py-2 pr-3 text-right font-medium">
                      Claimed
                    </th>
                    <th className="py-2 pr-3 text-right font-medium">
                      Certified
                    </th>
                    <th className="py-2 pr-3 text-right font-medium">
                      Cumulative
                    </th>
                    <th className="py-2 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.id} className="border-b border-border/50">
                      <td className="py-2 pr-3 font-mono text-xs">
                        {lookup.boqItem(l.boq_line_id)}
                      </td>
                      <td className="py-2 pr-3">{l.description}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {formatInr(l.rate)}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                        {formatNumber(l.previous_cumulative_qty, 2)}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {formatNumber(l.claimed_qty, 2)}
                      </td>
                      <td
                        className={cn(
                          "py-2 pr-3 text-right font-medium tabular-nums",
                          l.certified_qty < l.claimed_qty && "text-warning",
                        )}
                      >
                        {formatNumber(l.certified_qty, 2)} {l.unit}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {formatNumber(l.cumulative_qty, 2)}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {formatInr(l.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {showValues ? (
              <div className="mt-5 ml-auto w-full max-w-sm space-y-1.5 text-sm">
                <Row
                  label="Gross value of this bill"
                  value={live.gross_amount}
                  strong
                />
                <Row
                  label="Certified in earlier bills"
                  value={live.previous_gross_amount}
                  muted
                />
                <Row
                  label="Cumulative to date"
                  value={live.cumulative_gross_amount}
                  muted
                />
                <div className="pt-2" />
                <Row
                  label={`Retention @ ${formatPercent(live.retention_percent)}`}
                  value={-live.retention_amount}
                />
                <Row
                  label={`TDS @ ${formatPercent(live.tds_percent)} (${contractorTypeLabel(lookup.contractorType(live.contractor_id))})`}
                  value={-live.tds_amount}
                />
                {live.advance_recovery_amount > 0 ? (
                  <Row
                    label="Advance recovery"
                    value={-live.advance_recovery_amount}
                  />
                ) : null}
                {live.other_deductions_amount > 0 ? (
                  <Row
                    label={live.other_deductions_reason || "Other deductions"}
                    value={-live.other_deductions_amount}
                  />
                ) : null}
                <Row
                  label="Total deductions"
                  value={-live.total_deductions}
                  muted
                />
                <div className="flex items-center justify-between border-t border-border pt-1.5 text-base font-semibold">
                  <span>Net payable</span>
                  <span className="tabular-nums">
                    {formatInr(live.net_payable_amount)}
                  </span>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-xs text-muted-foreground">
                Amounts are not shown on this document for your role.
              </p>
            )}

            {workOrder ? (
              <p className="mt-6 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
                Retention is held at{" "}
                {formatPercent(workOrder.retention_percent)} of the gross value
                per the work order. TDS is deducted under section 194C at{" "}
                {formatPercent(live.tds_percent)} for a{" "}
                {humanise(
                  lookup.contractorType(live.contractor_id),
                ).toLowerCase()}{" "}
                contractor.
              </p>
            ) : null}
          </section>

          {/* ---- Page 2: the measurement sheet ---- */}
          <section className="print-page rounded-xl bg-card p-6 ring-1 ring-border print:ring-0">
            <h3 className="mb-3 text-sm font-semibold">Measurement sheet</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y border-border text-xs text-muted-foreground">
                    <th className="py-2 pr-3 text-left font-medium">Sheet</th>
                    <th className="py-2 pr-3 text-left font-medium">
                      Description
                    </th>
                    <th className="py-2 pr-3 text-right font-medium">Nos</th>
                    <th className="py-2 pr-3 text-right font-medium">L</th>
                    <th className="py-2 pr-3 text-right font-medium">B</th>
                    <th className="py-2 pr-3 text-right font-medium">D</th>
                    <th className="py-2 text-right font-medium">Measured</th>
                  </tr>
                </thead>
                <tbody>
                  {sheets.flatMap((m) =>
                    jmLines
                      .filter((l) => l.joint_measurement_id === m.id)
                      .map((l) => (
                        <tr key={l.id} className="border-b border-border/50">
                          <td className="py-2 pr-3 font-mono text-xs">
                            {m.measurement_number}
                          </td>
                          <td className="py-2 pr-3">{l.description}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">
                            {l.nos ?? "—"}
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums">
                            {l.length ?? "—"}
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums">
                            {l.breadth ?? "—"}
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums">
                            {l.depth ?? "—"}
                          </td>
                          <td className="py-2 text-right tabular-nums">
                            {formatNumber(l.measured_qty, 3)} {l.unit}
                          </td>
                        </tr>
                      )),
                  )}
                </tbody>
              </table>
            </div>
            <p className="mt-4 grid grid-cols-2 gap-8 border-t border-border pt-6 text-xs text-muted-foreground">
              <span className="block">
                Contractor
                <span className="mt-6 block border-t border-border pt-1">
                  {sheets[0]?.signed_by_contractor_name || "—"}
                </span>
              </span>
              <span className="block">
                Project QS
                <span className="mt-6 block border-t border-border pt-1">
                  {lookup.user(sheets[0]?.signed_by_qs_user_id ?? null)}
                </span>
              </span>
            </p>
          </section>
        </article>
      </AppDialogBody>

      <AppDialogFooter className="print:hidden">
        <Button variant="outline" onClick={() => window.print()}>
          <Printer className="size-3.5" /> Print
        </Button>
        {canSubmit && live.status === "draft" ? (
          <Button onClick={submit} disabled={pending}>
            <SendHorizontal className="size-3.5" />{" "}
            {pending ? "Submitting…" : "Submit for certification"}
          </Button>
        ) : null}
        {canHandOver && live.status === "certified" ? (
          <Button onClick={handOver} disabled={pending}>
            <Send className="size-3.5" />{" "}
            {pending ? "Sending…" : "Hand over to Accounts"}
          </Button>
        ) : null}
      </AppDialogFooter>
    </AppDialog>
  );
}

function Row({
  label,
  value,
  strong,
  muted,
}: {
  label: string;
  value: number;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between",
        strong && "font-semibold",
        muted && "text-muted-foreground",
      )}
    >
      <span>{label}</span>
      <span className="tabular-nums">{formatInr(value)}</span>
    </div>
  );
}
