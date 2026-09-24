"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, NativeSelect, Qty, Warning } from "@/components/common";
import { SubmitButton } from "@/components/ui-app";
import {
  EditorTotal,
  FullPageEditor,
  cellProps,
  useAutosave,
  useGridKeys,
} from "@/components/editor";
import { IssuedVsMeasuredPanel } from "@/components/billing/issued-vs-measured-panel";
import {
  useAccess,
  useActor,
  useLookups,
  useProjectId,
  useProjectRows,
  useServiceAction,
} from "@/lib/hooks";
import {
  createJointMeasurement,
  measuredQtyFromDimensions,
} from "@/lib/services/measurement-service";
import { today } from "@/lib/clock";
import { countOf, formatInr } from "@/lib/format";
import type { WorkOrder, WorkOrderLine } from "@/lib/domain";
import { cn } from "cn";

type Row = {
  include: boolean;
  nos: string;
  length: string;
  breadth: string;
  depth: string;
  manual_qty: string;
  excess_reason: string;
  remarks: string;
};

function blankRow(ready_qty: number): Row {
  return {
    include: true,
    nos: "",
    length: "",
    breadth: "",
    depth: "",
    // A grid seeded with only a length is invalid for a volume unit, so the
    // site's claim comes in as a typed quantity. Clearing it hands the row
    // back to the dimension grid.
    manual_qty: ready_qty > 0 ? String(ready_qty) : "",
    excess_reason: "",
    remarks: "",
  };
}

/**
 * C1 — the joint measurement sheet, full page.
 *
 * A measurement is nos × L × B × D across a dozen lines with a running value;
 * it was a modal, which put the grid inside a box inside a page (audit C6).
 * The grid now gets the full width, the totals sit in the action bar, and
 * Enter adds a row the way a measurement book does.
 */
export default function NewMeasurementPage() {
  const projectId = useProjectId();
  const access = useAccess("measurements");
  const router = useRouter();
  const lookup = useLookups();
  const actor = useActor();
  const { run, pending } = useServiceAction();

  const [workOrderId, setWorkOrderId] = useState("");
  const [measurementDate, setMeasurementDate] = useState(today());
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState(today());
  const [remarks, setRemarks] = useState("");
  const [rows, setRows] = useState<Record<string, Row>>({});

  const workOrders = useProjectRows("work_orders", projectId) as WorkOrder[];
  const woLines = useProjectRows("work_order_lines", projectId) as WorkOrderLine[];

  const readyWorkOrders = useMemo(
    () => workOrders.filter((w) => woLines.some((l) => l.work_order_id === w.id && l.ready_to_measure)),
    [workOrders, woLines],
  );

  const lines = useMemo(
    () =>
      woLines.filter(
        (l) => l.work_order_id === workOrderId && (l.ready_to_measure || l.done_qty > l.measured_qty),
      ),
    [woLines, workOrderId],
  );

  const workOrder = workOrders.find((w) => w.id === workOrderId);
  const onKeyDown = useGridKeys();

  function pickWorkOrder(id: string) {
    setWorkOrderId(id);
    const next: Record<string, Row> = {};
    woLines
      .filter((l) => l.work_order_id === id && (l.ready_to_measure || l.done_qty > l.measured_qty))
      .forEach((l) => {
        next[l.id] = blankRow(l.ready_to_measure ? l.ready_qty : 0);
        next[l.id].include = l.ready_to_measure;
      });
    setRows(next);
  }

  function patch(id: string, change: Partial<Row>) {
    setRows((r) => ({ ...r, [id]: { ...r[id], ...change } }));
  }

  /** Live quantity, excess check and value for one row. */
  function evaluate(line: WorkOrderLine) {
    const row = rows[line.id];
    if (!row) return null;
    const manual = row.manual_qty !== "" ? Number(row.manual_qty) : null;
    const derived =
      manual !== null
        ? manual
        : measuredQtyFromDimensions(line.unit, {
            nos: row.nos === "" ? null : Number(row.nos),
            length: row.length === "" ? null : Number(row.length),
            breadth: row.breadth === "" ? null : Number(row.breadth),
            depth: row.depth === "" ? null : Number(row.depth),
          });
    const measured = derived ?? 0;
    const cumulative = Math.round((line.measured_qty + measured) * 1000) / 1000;
    return {
      measured,
      cumulative,
      is_excess: cumulative > line.quantity + 0.0005,
      amount: measured * line.agreed_rate,
      valid: derived !== null && measured > 0,
    };
  }

  const included = lines.filter((l) => rows[l.id]?.include);
  const boqLineIds = [...new Set(included.map((l) => l.boq_line_id))];
  const grossValue = included.reduce((sum, l) => sum + (evaluate(l)?.amount ?? 0), 0);
  const excessLines = included.filter((l) => evaluate(l)?.is_excess);
  const unresolvedExcess = excessLines.some(
    (l) => (rows[l.id]?.excess_reason ?? "").trim().length < 5,
  );
  const dirty = Boolean(workOrderId && included.length > 0);

  const invalidReason = useMemo(() => {
    if (!access.canCreate) return "Only the Project QS records a joint measurement.";
    if (!workOrderId) return "Pick the work order being measured.";
    if (included.length === 0) return "Include at least one line.";
    const bad = included.find((l) => !evaluate(l)?.valid);
    if (bad) return `${bad.description} needs a quantity, or the dimensions to derive one.`;
    if (unresolvedExcess) return "An excess line needs a reason before it can be saved.";
    if (periodTo < (periodFrom || measurementDate)) return "The period ends before it starts.";
    return undefined;
    // evaluate reads `rows`, which is in the dependency list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [access.canCreate, workOrderId, included, rows, unresolvedExcess, periodFrom, periodTo, measurementDate]);

  // Drafts live in the browser until the sheet is saved: a JointMeasurement
  // row cannot exist half-built without appearing in the QS's own list.
  const { savedAt, saving } = useAutosave(dirty, () => {
    try {
      window.localStorage.setItem(
        `manas-erp-jm-draft:${projectId}`,
        JSON.stringify({ workOrderId, measurementDate, periodFrom, periodTo, remarks, rows }),
      );
    } catch {
      // Blocked storage only costs the reader the recovery, not the sheet.
    }
  });

  async function submit() {
    await run(
      () =>
        createJointMeasurement(
          {
            project_id: projectId,
            work_order_id: workOrderId,
            measurement_date: measurementDate,
            period_from: periodFrom || measurementDate,
            period_to: periodTo,
            remarks,
            lines: included.map((l) => {
              const row = rows[l.id];
              return {
                work_order_line_id: l.id,
                nos: row.nos === "" ? null : Number(row.nos),
                length: row.length === "" ? null : Number(row.length),
                breadth: row.breadth === "" ? null : Number(row.breadth),
                depth: row.depth === "" ? null : Number(row.depth),
                measured_qty: row.manual_qty === "" ? null : Number(row.manual_qty),
                excess_reason: row.excess_reason,
                remarks: row.remarks,
              };
            }),
          },
          actor,
        ),
      {
        view: `/projects/${projectId}/billing/measurements`,
        success: (r) => `${r.measurement.measurement_number} drafted — sign it to make it count`,
        onDone: () => router.push(`/projects/${projectId}/billing/measurements`),
      },
    );
  }

  const backHref = `/projects/${projectId}/billing/measurements`;

  return (
    <FullPageEditor
      backHref={backHref}
      backLabel="Joint measurements"
      crumbs={[
        { label: "Projects", href: "/projects" },
        { label: "Billing & Certification", href: backHref },
        { label: "New joint measurement" },
      ]}
      documentNumber="New measurement"
      title="Measured jointly with the contractor, against the work order"
      party={workOrder ? lookup.contractor(workOrder.contractor_id) : undefined}
      team="billing_certification"
      stepCodes={["C1"]}
      savedAt={savedAt}
      saving={saving}
      totals={
        <>
          <EditorTotal label="Lines" value={countOf(included.length, "line")} />
          <EditorTotal label="Gross value" value={formatInr(grossValue)} emphasis />
          <EditorTotal
            label="Excess lines"
            value={
              excessLines.length === 0 ? (
                "None"
              ) : (
                <span className={cn(unresolvedExcess ? "text-destructive" : "text-warning")}>
                  {excessLines.length}
                </span>
              )
            }
          />
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
            busyLabel="Saving…"
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
              <NativeSelect value={workOrderId} onChange={(e) => pickWorkOrder(e.target.value)}>
                <option value="">Select a work order</option>
                {readyWorkOrders.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.wo_number} — {lookup.contractor(w.contractor_id)}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Measured on" required>
              <Input
                type="date"
                value={measurementDate}
                onChange={(e) => setMeasurementDate(e.target.value)}
              />
            </Field>
            <Field label="Period from">
              <Input
                type="date"
                value={periodFrom}
                onChange={(e) => setPeriodFrom(e.target.value)}
              />
            </Field>
            <Field label="Period to" required>
              <Input type="date" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} />
            </Field>
          </div>
          <Field label="Remarks" className="mt-4">
            <Input
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Measured with the contractor's supervisor on site."
            />
          </Field>
        </Card>

        {!workOrderId ? (
          <Card className="border-dashed px-5 py-10 text-center text-sm text-muted-foreground">
            Pick a work order to load the lines the site has flagged ready.
          </Card>
        ) : lines.length === 0 ? (
          <Warning>
            Nothing on this work order is ready to measure. The site flags lines from Work Done
            (A4).
          </Warning>
        ) : (
          <Card className="overflow-hidden py-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm" onKeyDown={onKeyDown}>
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                    <th className="w-10 px-3 py-2.5" />
                    <th className="px-3 py-2.5 text-left font-medium">Line</th>
                    <th className="px-3 py-2.5 text-right font-medium">Done</th>
                    <th className="px-3 py-2.5 text-right font-medium">Measured</th>
                    <th className="px-2 py-2.5 text-right font-medium">Nos</th>
                    <th className="px-2 py-2.5 text-right font-medium">L</th>
                    <th className="px-2 py-2.5 text-right font-medium">B</th>
                    <th className="px-2 py-2.5 text-right font-medium">D</th>
                    <th className="px-2 py-2.5 text-right font-medium">Quantity</th>
                    <th className="px-3 py-2.5 text-right font-medium">Cumulative</th>
                    <th className="px-3 py-2.5 text-right font-medium">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, rowIndex) => {
                    const row = rows[line.id];
                    const ev = evaluate(line);
                    if (!row) return null;
                    return (
                      <>
                        <tr
                          key={line.id}
                          className={cn(
                            "border-b border-border/50",
                            !row.include && "opacity-50",
                          )}
                        >
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={row.include}
                              onChange={(e) => patch(line.id, { include: e.target.checked })}
                              aria-label={`Include ${line.description}`}
                              className="size-4 accent-[var(--primary)]"
                            />
                          </td>
                          <td className="min-w-52 px-3 py-2">
                            {line.description}
                            <span className="ml-2 text-xs text-muted-foreground">{line.unit}</span>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Qty value={line.done_qty} unit={line.unit} />
                          </td>
                          <td className="px-3 py-2 text-right text-muted-foreground">
                            <Qty value={line.measured_qty} unit={line.unit} />
                          </td>
                          {(["nos", "length", "breadth", "depth"] as const).map((key, ci) => (
                            <td key={key} className="px-2 py-2">
                              <Input
                                {...cellProps(rowIndex, ci)}
                                type="number"
                                step="any"
                                min={0}
                                disabled={!row.include || row.manual_qty !== ""}
                                value={row[key]}
                                onChange={(e) => patch(line.id, { [key]: e.target.value })}
                                className="w-16 text-right"
                                aria-label={`${key} for ${line.description}`}
                              />
                            </td>
                          ))}
                          <td className="px-2 py-2">
                            <Input
                              {...cellProps(rowIndex, 4)}
                              type="number"
                              step="any"
                              min={0}
                              disabled={!row.include}
                              value={row.manual_qty}
                              onChange={(e) => patch(line.id, { manual_qty: e.target.value })}
                              className="w-24 text-right"
                              placeholder="or type"
                              aria-label={`Quantity for ${line.description}`}
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Qty
                              value={ev?.cumulative}
                              unit={line.unit}
                              className={cn(ev?.is_excess && "font-medium text-warning")}
                            />
                          </td>
                          <td className="num px-3 py-2 text-right">
                            {formatInr(ev?.amount ?? 0)}
                          </td>
                        </tr>
                        {row.include && ev?.is_excess ? (
                          <tr key={`${line.id}-excess`} className="border-b border-border/50">
                            <td />
                            <td colSpan={10} className="px-3 pb-3">
                              <Field
                                label="Reason for measuring past the work-order quantity"
                                required
                                error={
                                  row.excess_reason.trim().length < 5
                                    ? "A reason is required before this sheet can be saved."
                                    : undefined
                                }
                              >
                                <Input
                                  value={row.excess_reason}
                                  onChange={(e) =>
                                    patch(line.id, { excess_reason: e.target.value })
                                  }
                                  placeholder="Extra shear wall added by the structural consultant on 12 Aug."
                                />
                              </Field>
                            </td>
                          </tr>
                        ) : null}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {boqLineIds.length > 0 ? (
          <IssuedVsMeasuredPanel
            projectId={projectId}
            boqLineIds={boqLineIds}
            title="Issued vs measured on these BOQ lines"
          />
        ) : null}
      </div>
    </FullPageEditor>
  );
}
