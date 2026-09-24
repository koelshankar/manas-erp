"use client";

import { useState } from "react";
import { PenLine, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Attachments,
  DetailRow,
  Field,
  PrintButton,
  RecordTrail,
  StatusPill,
} from "@/components/common";
import { IssuedVsMeasuredPanel } from "./issued-vs-measured-panel";
import { useAccess, useActor, useLookups, useProjectRows, useServiceAction } from "@/lib/hooks";
import { signJointMeasurement } from "@/lib/services/measurement-service";
import {
  formatDate,
  formatDateTime,
  formatInr,
  formatNumber,
} from "@/lib/format";
import type { JointMeasurement, JointMeasurementLine } from "@/lib/domain";
import { cn } from "cn";
import {
  AppDialog,
  AppDialogBody,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from "@/components/ui-app";

/** C1 — the measurement sheet, with the signing action when it is still a draft. */
export function MeasurementSheet({
  measurement,
  open,
  onOpenChange,
  projectId,
  canSign,
  showValues,
  defaultDate,
}: {
  measurement: JointMeasurement | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  canSign: boolean;
  showValues: boolean;
  defaultDate: string;
}) {
  const allMeasurements = useProjectRows(
    "joint_measurements",
    projectId,
  ) as JointMeasurement[];
  const allLines = useProjectRows(
    "joint_measurement_lines",
    projectId,
  ) as JointMeasurementLine[];
  const lookup = useLookups();
  const actor = useActor();
  const { run, pending } = useServiceAction();
  const access = useAccess("measurements");
  const [signatory, setSignatory] = useState("");
  const [signedOn, setSignedOn] = useState(defaultDate);

  // The live row, so signing from inside this sheet updates its own footer.
  const live = measurement
    ? (allMeasurements.find((m) => m.id === measurement.id) ?? measurement)
    : null;
  if (!live) return null;

  const lines = allLines.filter((l) => l.joint_measurement_id === live.id);
  const boqLineIds = [...new Set(lines.map((l) => l.boq_line_id))];

  async function sign() {
    await run(
      () =>
        signJointMeasurement(
          {
            joint_measurement_id: live!.id,
            contractor_signatory_name: signatory,
            signed_on: signedOn,
          },
          actor,
        ),
      {
        success:
          "Signed — the measured quantity now counts towards the work order",
        onDone: () => setSignatory(""),
      },
    );
  }

  return (
    <AppDialog open={open} onOpenChange={onOpenChange} size="xl">
      <AppDialogHeader>
        <AppDialogTitle className="flex flex-wrap items-center gap-3">
          <span className="font-mono">{live.measurement_number}</span>
          <StatusPill status={live.status} />
          {live.has_excess ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-xs font-medium text-warning ring-1 ring-warning/30">
              <TriangleAlert className="size-3" /> Excess
            </span>
          ) : null}
        </AppDialogTitle>
        <AppDialogDescription>
          {lookup.workOrder(live.work_order_id)} ·{" "}
          {lookup.contractor(live.contractor_id)}
        </AppDialogDescription>
      </AppDialogHeader>

      <AppDialogBody className="space-y-6" data-print-area>
        <RecordTrail entityType="joint_measurement" entityId={live.id} />

        <Attachments
          entityType="joint_measurement"
          entityId={live.id}
          projectId={live.project_id}
          canEdit={access.canEdit}
        />

        <dl className="divide-y divide-border/60">
          <DetailRow label="Measured on">
            {formatDate(live.measurement_date)}
          </DetailRow>
          <DetailRow label="Period">
            {formatDate(live.period_from)} – {formatDate(live.period_to)}
          </DetailRow>
          <DetailRow label="Measured by">
            {lookup.user(live.measured_by_user_id)}
          </DetailRow>
          <DetailRow label="Contractor signature">
            {live.signed_by_contractor_at
              ? `${live.signed_by_contractor_name} · ${formatDateTime(live.signed_by_contractor_at)}`
              : "Not signed"}
          </DetailRow>
          <DetailRow label="QS signature">
            {live.signed_by_qs_at
              ? `${lookup.user(live.signed_by_qs_user_id)} · ${formatDateTime(live.signed_by_qs_at)}`
              : "Not signed"}
          </DetailRow>
          {showValues ? (
            <DetailRow label="Sheet value">
              {formatInr(live.total_value)}
            </DetailRow>
          ) : null}
        </dl>

        <section>
          <h3 className="mb-3 text-sm font-semibold">Measurement sheet</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/70 text-xs text-muted-foreground">
                  <th className="py-2 pr-3 text-left font-medium">BOQ</th>
                  <th className="py-2 pr-3 text-left font-medium">
                    Description
                  </th>
                  <th className="py-2 pr-3 text-right font-medium">Nos</th>
                  <th className="py-2 pr-3 text-right font-medium">L</th>
                  <th className="py-2 pr-3 text-right font-medium">B</th>
                  <th className="py-2 pr-3 text-right font-medium">D</th>
                  <th className="py-2 pr-3 text-right font-medium">Measured</th>
                  <th className="py-2 pr-3 text-right font-medium">
                    Cumulative
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
                {lines.map((l) => (
                  <tr
                    key={l.id}
                    className={cn(
                      "border-b border-border/40 last:border-0",
                      l.is_excess && "bg-warning-soft",
                    )}
                  >
                    <td className="py-2 pr-3 font-mono text-xs">
                      {lookup.boqItem(l.boq_line_id)}
                    </td>
                    <td className="py-2 pr-3">
                      {l.description}
                      {l.is_excess ? (
                        <span className="block text-[11px] text-warning">
                          Excess — {l.excess_reason}
                        </span>
                      ) : null}
                    </td>
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
                    <td className="py-2 pr-3 text-right font-medium tabular-nums">
                      {formatNumber(l.measured_qty, 3)} {l.unit}
                    </td>
                    <td
                      className={cn(
                        "py-2 pr-3 text-right tabular-nums",
                        l.is_excess && "font-semibold text-warning",
                      )}
                    >
                      {formatNumber(l.cumulative_measured_qty, 3)}
                    </td>
                    {showValues ? (
                      <>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {formatInr(l.agreed_rate)}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {formatInr(l.amount)}
                        </td>
                      </>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <IssuedVsMeasuredPanel projectId={projectId} boqLineIds={boqLineIds} />

        {canSign && live.status === "draft" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Contractor's representative"
              required
              hint="Who signed the sheet on site."
            >
              <Input
                value={signatory}
                onChange={(e) => setSignatory(e.target.value)}
                placeholder={lookup.contractor(live.contractor_id)}
              />
            </Field>
            <Field label="Signed on" required>
              <Input
                type="date"
                value={signedOn}
                onChange={(e) => setSignedOn(e.target.value)}
              />
            </Field>
          </div>
        ) : null}
      </AppDialogBody>

      {canSign && live.status === "draft" ? (
        <AppDialogFooter>
          <PrintButton />
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            onClick={sign}
            disabled={pending || signatory.trim().length < 3}
          >
            <PenLine className="size-3.5" />{" "}
            {pending ? "Signing…" : "Record signatures"}
          </Button>
        </AppDialogFooter>
      ) : null}
    </AppDialog>
  );
}
