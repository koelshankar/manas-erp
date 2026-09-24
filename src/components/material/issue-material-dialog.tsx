"use client";

import { useMemo, useState } from "react";
import { PackageMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, NativeSelect, Warning } from "@/components/common";
import { useActor, useAllRows, useLookups, useMaterialPositions, useNewParam, useProjectRows, useServiceAction } from "@/lib/hooks";
import { issueMaterial } from "@/lib/services/stores-service";
import { formatNumber } from "@/lib/format";
import type {
  BoqLine,
  Material,
  StockLedgerEntry,
  WorkOrder,
} from "@/lib/domain";
import {
  AppDialog,
  AppDialogBody,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from "@/components/ui-app";

/**
 * A5 — issue material from site stock to a work order and BOQ line.
 *
 * The issue is valued at the weighted average of receipts, which is the number
 * Budget vs Actual consumes. The Site Engineer does not see that value.
 */
export function IssueMaterialDialog({
  projectId,
  showValues,
  today,
}: {
  projectId: string;
  showValues: boolean;
  today: string;
}) {
  // Opened by the top bar's "+ New" menu via ?new=1, or by the button below.
  const [open, setOpen] = useNewParam();
  const [materialId, setMaterialId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [workOrderId, setWorkOrderId] = useState("");
  const [boqLineId, setBoqLineId] = useState("");
  const [issueDate, setIssueDate] = useState(today);
  const [remarks, setRemarks] = useState("");

  const ledger = useProjectRows(
    "stock_ledger_entries",
    projectId,
  ) as StockLedgerEntry[];
  const workOrders = useProjectRows("work_orders", projectId) as WorkOrder[];
  const boqLines = useProjectRows("boq_lines", projectId) as BoqLine[];
  const materials = useAllRows("materials") as Material[];
  const positions = useMaterialPositions(projectId);
  const lookup = useLookups();
  const actor = useActor();
  const { run, pending } = useServiceAction();

  /** Only materials that actually have a balance on site can be issued. */
  const onSite = useMemo(() => {
    const balances = new Map<string, number>();
    ledger.forEach((e) => {
      balances.set(
        e.material_id,
        (balances.get(e.material_id) ?? 0) + e.quantity_in - e.quantity_out,
      );
    });
    return [...balances.entries()]
      .filter(([, q]) => q > 0)
      .map(([material_id, balance]) => ({
        material: materials.find((m) => m.id === material_id),
        balance,
      }))
      .filter((r): r is { material: Material; balance: number } =>
        Boolean(r.material),
      );
  }, [ledger, materials]);

  const selected = onSite.find((r) => r.material.id === materialId);
  const position =
    boqLineId && materialId ? positions.get(boqLineId, materialId) : null;
  const overStock =
    selected && quantity ? Number(quantity) > selected.balance : false;

  /** BOQ lines that budget for the chosen material, then everything else. */
  const boqOptions = useMemo(() => {
    if (!materialId) return boqLines;
    const budgeted = new Set(
      positions.rows
        .filter((p) => p.material_id === materialId)
        .map((p) => p.boq_line_id),
    );
    return [...boqLines].sort(
      (a, b) => Number(budgeted.has(b.id)) - Number(budgeted.has(a.id)),
    );
  }, [boqLines, materialId, positions.rows]);

  function reset() {
    setMaterialId("");
    setQuantity("");
    setWorkOrderId("");
    setBoqLineId("");
    setIssueDate(today);
    setRemarks("");
  }

  async function submit() {
    await run(
      () =>
        issueMaterial(
          {
            project_id: projectId,
            material_id: materialId,
            quantity: Number(quantity),
            work_order_id: workOrderId,
            boq_line_id: boqLineId,
            issue_date: issueDate,
            remarks,
          },
          actor,
        ),
      {
        success: (result) => `${result.issue.issue_number} issued`,
        view: `/projects/${projectId}/site/stock`,
        onDone: () => {
          setOpen(false);
          reset();
        },
      },
    );
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <PackageMinus className="size-3.5" /> Issue material
      </Button>

      <AppDialog open={open} onOpenChange={setOpen} size="lg">
        <AppDialogHeader>
          <AppDialogTitle>Issue material from site stock</AppDialogTitle>
          <AppDialogDescription>
            A5 — the issue is booked against a BOQ line, which is how it reaches
            Budget vs Actual.
          </AppDialogDescription>
        </AppDialogHeader>
        <AppDialogBody>
          <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Material" required>
                <NativeSelect
                  value={materialId}
                  onChange={(e) => {
                    setMaterialId(e.target.value);
                    setQuantity("");
                  }}
                >
                  <option value="">Select a material on site</option>
                  {onSite.map((r) => (
                    <option key={r.material.id} value={r.material.id}>
                      {r.material.name} — {formatNumber(r.balance, 2)}{" "}
                      {r.material.unit} on site
                    </option>
                  ))}
                </NativeSelect>
              </Field>

              <Field
                label={`Quantity${selected ? ` (${selected.material.unit})` : ""}`}
                required
                error={
                  overStock
                    ? `Only ${formatNumber(selected!.balance, 2)} on site`
                    : undefined
                }
              >
                <Input
                  type="number"
                  min={0}
                  step="any"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  disabled={!materialId}
                  aria-invalid={overStock || undefined}
                />
              </Field>

              <Field label="Work order" required>
                <NativeSelect
                  value={workOrderId}
                  onChange={(e) => setWorkOrderId(e.target.value)}
                >
                  <option value="">Select a work order</option>
                  {workOrders.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.wo_number} — {lookup.contractor(w.contractor_id)}
                    </option>
                  ))}
                </NativeSelect>
              </Field>

              <Field
                label="BOQ line"
                required
                hint="Where the cost lands in Budget vs Actual."
              >
                <NativeSelect
                  value={boqLineId}
                  onChange={(e) => setBoqLineId(e.target.value)}
                >
                  <option value="">Select a BOQ line</option>
                  {boqOptions.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.item_code} — {b.description}
                    </option>
                  ))}
                </NativeSelect>
              </Field>

              <Field label="Issue date" required>
                <Input
                  type="date"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                />
              </Field>

              <Field label="Remarks">
                <Input
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                />
              </Field>
            </div>

            {position ? (
              <dl className="grid grid-cols-2 gap-4 rounded-lg bg-muted/50 px-3 py-2.5 sm:grid-cols-4">
                <Stat
                  label="BOQ budget"
                  value={position.budget_qty}
                  unit={selected?.material.unit}
                />
                <Stat
                  label="Issued so far"
                  value={position.issued_qty}
                  unit={selected?.material.unit}
                />
                <Stat
                  label="On site"
                  value={position.stock_qty}
                  unit={selected?.material.unit}
                />
                <Stat
                  label="After this issue"
                  value={position.stock_qty - (Number(quantity) || 0)}
                  unit={selected?.material.unit}
                />
              </dl>
            ) : null}

            {position &&
            quantity &&
            position.issued_qty + Number(quantity) > position.budget_qty ? (
              <Warning>
                This takes the BOQ line past its material budget for{" "}
                {lookup.material(materialId)}. The issue is still allowed — it
                will show red on Budget vs Actual.
              </Warning>
            ) : null}

            {showValues ? null : (
              <p className="text-xs text-muted-foreground">
                The issue is valued at the weighted average of receipts. Values
                are not shown for your role.
              </p>
            )}
          </div>
        </AppDialogBody>

        <AppDialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={
              pending || !materialId || !quantity || !workOrderId || !boqLineId
            }
          >
            {pending ? "Issuing…" : "Issue material"}
          </Button>
        </AppDialogFooter>
      </AppDialog>
    </>
  );
}

function Stat({
  label,
  value,
  unit,
}: {
  label: string;
  value: number;
  unit?: string;
}) {
  return (
    <div>
      <dt className="text-[10px] tracking-wide text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="text-sm font-medium tabular-nums">
        {formatNumber(value, 2)}
        {unit ? (
          <span className="ml-1 text-[10px] text-muted-foreground">{unit}</span>
        ) : null}
      </dd>
    </div>
  );
}
