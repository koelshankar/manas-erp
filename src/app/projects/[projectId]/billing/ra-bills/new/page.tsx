"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, NativeSelect, Qty, Warning } from "@/components/common";
import { SubmitButton } from "@/components/ui-app";
import { EditorTotal, FullPageEditor, cellProps, useAutosave, useGridKeys } from "@/components/editor";
import {
  useAccess,
  useActor,
  useLookups,
  useProjectId,
  useProjectRows,
  useServiceAction,
} from "@/lib/hooks";
import { createRaBill } from "@/lib/services/billing-service";
import { computeRaBillTotals } from "@/lib/services/ra-bill-math";
import { TDS_PERCENT, type Contractor, type JointMeasurement, type JointMeasurementLine, type RaBill, type WorkOrder } from "@/lib/domain";
import { contractorTypeLabel } from "@/config/labels";
import { today } from "@/lib/clock";
import { countOf, formatDate, formatInr, formatPercent } from "@/lib/format";

/**
 * C2 — the running-account bill, full page.
 *
 * A bill is the measurement lines at work-order rates, less retention, TDS,
 * advance recovery and any other deduction — five figures that all move
 * together. In a modal the net payable sat below the fold while the
 * deductions were being typed (audit C6); here it is in the action bar,
 * always in view.
 */
export default function NewRaBillPage() {
  const projectId = useProjectId();
  const access = useAccess("ra_bills");
  const router = useRouter();
  const lookup = useLookups();
  const actor = useActor();
  const { run, pending } = useServiceAction();

  const [workOrderId, setWorkOrderId] = useState("");
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [billDate, setBillDate] = useState(today());
  const [advance, setAdvance] = useState("0");
  const [other, setOther] = useState("0");
  const [otherReason, setOtherReason] = useState("");
  const [remarks, setRemarks] = useState("");

  const workOrders = useProjectRows("work_orders", projectId) as WorkOrder[];
  const measurements = useProjectRows("joint_measurements", projectId) as JointMeasurement[];
  const jmLines = useProjectRows("joint_measurement_lines", projectId) as JointMeasurementLine[];
  const bills = useProjectRows("ra_bills", projectId) as RaBill[];
  const contractors = useProjectRows("contractors", projectId) as Contractor[];

  const available = useMemo(() => measurements.filter((m) => m.status === "signed"), [measurements]);
  const woWithSigned = useMemo(
    () => workOrders.filter((w) => available.some((m) => m.work_order_id === w.id)),
    [workOrders, available],
  );

  const workOrder = workOrders.find((w) => w.id === workOrderId);
  const forWo = available.filter((m) => m.work_order_id === workOrderId);
  const chosen = forWo.filter((m) => picked[m.id]);
  const chosenLines = jmLines.filter((l) => chosen.some((m) => m.id === l.joint_measurement_id));
  const onKeyDown = useGridKeys();

  /* --- the same arithmetic the service will do, live ------------------ */
  const contractor = contractors.find((c) => c.id === workOrder?.contractor_id);
  const tds_percent = contractor ? TDS_PERCENT[contractor.type] : 0;
  const previous_gross_amount = bills
    .filter((b) => b.work_order_id === workOrderId && b.status !== "rejected" && b.status !== "draft")
    .reduce((s, b) => s + b.gross_amount, 0);

  const totals = computeRaBillTotals(
    chosenLines.map((l) => ({ certified_qty: l.measured_qty, rate: l.agreed_rate })),
    {
      retention_percent: workOrder?.retention_percent ?? 0,
      tds_percent,
      advance_recovery_amount: Number(advance) || 0,
      other_deductions_amount: Number(other) || 0,
      previous_gross_amount,
    },
  );

  const dirty = Boolean(workOrderId && chosen.length > 0);

  const invalidReason = useMemo(() => {
    if (!access.canCreate) return "Only the Project QS prepares an RA bill.";
    if (!workOrderId) return "Pick the work order this bill is against.";
    if (chosen.length === 0) return "Pick at least one signed measurement sheet.";
    if (Number(other) > 0 && otherReason.trim().length < 4) {
      return "An other deduction needs a reason.";
    }
    if (totals.net_payable_amount < 0) return "Deductions exceed the gross value of the bill.";
    return undefined;
  }, [access.canCreate, workOrderId, chosen.length, other, otherReason, totals.net_payable_amount]);

  const { savedAt, saving } = useAutosave(dirty, () => {
    try {
      window.localStorage.setItem(
        `manas-erp-rabill-draft:${projectId}`,
        JSON.stringify({ workOrderId, picked, billDate, advance, other, otherReason, remarks }),
      );
    } catch {
      // Blocked storage only costs the reader the recovery.
    }
  });

  async function submit() {
    await run(
      () =>
        createRaBill(
          {
            project_id: projectId,
            work_order_id: workOrderId,
            joint_measurement_ids: chosen.map((m) => m.id),
            bill_date: billDate,
            advance_recovery_amount: Number(advance) || 0,
            other_deductions_amount: Number(other) || 0,
            other_deductions_reason: otherReason,
            remarks,
          },
          actor,
        ),
      {
        success: (r) => `${r.bill.bill_number} drafted`,
        view: `/projects/${projectId}/billing/ra-bills`,
        onDone: () => router.push(`/projects/${projectId}/billing/ra-bills`),
      },
    );
  }

  const backHref = `/projects/${projectId}/billing/ra-bills`;

  return (
    <FullPageEditor
      backHref={backHref}
      backLabel="RA bills"
      crumbs={[
        { label: "Projects", href: "/projects" },
        { label: "Billing & Certification", href: backHref },
        { label: "New RA bill" },
      ]}
      documentNumber="New RA bill"
      title="Signed measurements priced at the work-order rates"
      party={workOrder ? lookup.contractor(workOrder.contractor_id) : undefined}
      team="billing_certification"
      stepCodes={["C2"]}
      savedAt={savedAt}
      saving={saving}
      totals={
        <>
          <EditorTotal label="Lines" value={countOf(chosenLines.length, "line")} />
          <EditorTotal label="Gross" value={formatInr(totals.gross_amount)} />
          <EditorTotal label="Deductions" value={formatInr(totals.total_deductions)} />
          <EditorTotal label="Net payable" value={formatInr(totals.net_payable_amount)} emphasis />
        </>
      }
      actions={
        <>
          <Button variant="ghost" size="sm" onClick={() => router.push(backHref)}>
            Cancel
          </Button>
          <SubmitButton
            type="button"
            onClick={submit}
            submitting={pending}
            busyLabel="Preparing…"
            invalidReason={invalidReason}
            label="Save as draft"
          />
        </>
      }
    >
      <div className="space-y-5">
        <Card className="px-5 py-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Work order" required>
              <NativeSelect
                value={workOrderId}
                onChange={(e) => {
                  setWorkOrderId(e.target.value);
                  setPicked({});
                }}
              >
                <option value="">Select a work order</option>
                {woWithSigned.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.wo_number} — {lookup.contractor(w.contractor_id)}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Bill date" required>
              <Input type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} />
            </Field>
            <Field label="Advance recovery" hint="Against the mobilisation advance.">
              <Input
                type="number"
                step="any"
                min={0}
                value={advance}
                onChange={(e) => setAdvance(e.target.value)}
              />
            </Field>
            <Field
              label="Other deductions"
              hint="Water and power charges, damage recovery."
              error={
                Number(other) > 0 && otherReason.trim().length < 4
                  ? "A reason is required."
                  : undefined
              }
            >
              <Input
                type="number"
                step="any"
                min={0}
                value={other}
                onChange={(e) => setOther(e.target.value)}
              />
            </Field>
          </div>
          {Number(other) > 0 ? (
            <Field label="Reason for the other deduction" required className="mt-4">
              <Input
                value={otherReason}
                onChange={(e) => setOtherReason(e.target.value)}
                placeholder="Water and power charges for August."
              />
            </Field>
          ) : null}
          <Field label="Remarks" className="mt-4">
            <Input
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Covers the August measurement round."
            />
          </Field>
        </Card>

        {!workOrderId ? (
          <Card className="border-dashed px-5 py-10 text-center text-sm text-muted-foreground">
            Pick a work order to see the signed measurement sheets waiting to be billed.
          </Card>
        ) : forWo.length === 0 ? (
          <Warning>
            No signed measurement on this work order is waiting to be billed. Sign a sheet first
            (C1).
          </Warning>
        ) : (
          <>
            <Card className="overflow-hidden py-0">
              <p className="border-b border-border bg-muted/40 px-4 py-2.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Measurement sheets
              </p>
              <table className="w-full text-sm" onKeyDown={onKeyDown}>
                <tbody>
                  {forWo.map((m, i) => {
                    const own = jmLines.filter((l) => l.joint_measurement_id === m.id);
                    const value = own.reduce((s, l) => s + l.measured_qty * l.agreed_rate, 0);
                    return (
                      <tr key={m.id} className="border-b border-border/50 last:border-0">
                        <td className="w-10 px-4 py-2.5">
                          <input
                            {...cellProps(i, 0)}
                            type="checkbox"
                            checked={Boolean(picked[m.id])}
                            onChange={(e) =>
                              setPicked((p) => ({ ...p, [m.id]: e.target.checked }))
                            }
                            aria-label={`Include ${m.measurement_number}`}
                            className="size-4 accent-[var(--primary)]"
                          />
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs whitespace-nowrap">
                          {m.measurement_number}
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">
                          {formatDate(m.period_from)} – {formatDate(m.period_to)}
                        </td>
                        <td className="px-3 py-2.5 text-right">{countOf(own.length, "line")}</td>
                        <td className="num px-4 py-2.5 text-right font-medium">
                          {formatInr(value)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>

            {chosenLines.length > 0 ? (
              <Card className="overflow-hidden py-0">
                <p className="border-b border-border bg-muted/40 px-4 py-2.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Bill lines, at work-order rates
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/70 text-xs text-muted-foreground">
                        <th className="px-4 py-2 text-left font-medium">Description</th>
                        <th className="px-3 py-2 text-right font-medium">Quantity</th>
                        <th className="px-3 py-2 text-right font-medium">Rate</th>
                        <th className="px-4 py-2 text-right font-medium">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {chosenLines.map((l) => (
                        <tr key={l.id} className="border-b border-border/40 last:border-0">
                          <td className="px-4 py-2">{l.description}</td>
                          <td className="px-3 py-2 text-right">
                            <Qty value={l.measured_qty} unit={l.unit} />
                          </td>
                          <td className="num px-3 py-2 text-right">{formatInr(l.agreed_rate)}</td>
                          <td className="num px-4 py-2 text-right">
                            {formatInr(l.measured_qty * l.agreed_rate)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            ) : null}

            <Card className="px-5 py-4">
              <h2 className="mb-3 text-base font-semibold">Deductions</h2>
              <dl className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
                <Row label="Gross value of this bill" value={formatInr(totals.gross_amount)} />
                <Row
                  label={`Retention @ ${formatPercent(workOrder?.retention_percent ?? 0)}`}
                  value={`− ${formatInr(totals.retention_amount)}`}
                />
                <Row
                  label={`TDS @ ${formatPercent(tds_percent)}${contractor ? ` (${contractorTypeLabel(contractor.type)})` : ""}`}
                  value={`− ${formatInr(totals.tds_amount)}`}
                />
                <Row label="Advance recovery" value={`− ${formatInr(Number(advance) || 0)}`} />
                <Row label="Other deductions" value={`− ${formatInr(Number(other) || 0)}`} />
                <Row
                  label="Net payable"
                  value={formatInr(totals.net_payable_amount)}
                  emphasis
                />
              </dl>
            </Card>
          </>
        )}
      </div>
    </FullPageEditor>
  );
}

function Row({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/40 py-1.5 last:border-0">
      <dt className={emphasis ? "text-sm font-semibold" : "text-sm text-muted-foreground"}>
        {label}
      </dt>
      <dd className={emphasis ? "num text-base font-semibold" : "num text-sm"}>{value}</dd>
    </div>
  );
}
