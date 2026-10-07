"use client";

import { useMemo, useState } from "react";
import { PackageMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, NativeSelect, Qty, Warning } from "@/components/common";
import { MaterialPicker } from "@/components/material/material-picker";
import { LineEditor, LineRow } from "./line-editor";
import { StorePicker, usePrimaryStoreId } from "./store-picker";
import {
  useActor,
  useAllRows,
  useLookups,
  useMaterialPositions,
  useNewParam,
  useProjectRows,
  useServiceAction,
} from "@/lib/hooks";
import { issueMaterial } from "@/lib/services/stores-service";
import { formatNumber } from "@/lib/format";
import type {
  BoqLine,
  Material,
  MaterialIssue,
  MaterialIssueLine,
  StockLedgerEntry,
  WorkOrder,
} from "@/lib/domain";
import { FormDialog } from "@/components/ui-app";

type DraftLine = { material_id: string; quantity: string; boq_line_id: string; remarks: string };

const BLANK: DraftLine = { material_id: "", quantity: "", boq_line_id: "", remarks: "" };

/**
 * A5 — the material issue note, on the form Manas sent us.
 *
 * One note, one contractor, one work order, as many materials as the storeman
 * handed over. Three things the screen is careful about:
 *
 * - the materials offered are the ones **that store** actually holds, not what
 *   the project holds somewhere, so the note cannot be written against stock
 *   that is in the other yard
 * - the cumulative column is computed by the service, not entered here; the
 *   dialog shows what the running total will become so the storeman can see it
 *   before he signs
 * - no rupee figure appears, for any role. The issue is valued at the weighted
 *   average of receipts and that value reaches Budget vs Actual, but Stores is
 *   a quantities screen and Manas were explicit about it.
 */
export function IssueMaterialDialog({
  projectId,
  today,
}: {
  projectId: string;
  today: string;
}) {
  // Opened by the top bar's "+ New" menu via ?new=1, or by the button below.
  const [open, setOpen] = useNewParam();
  const primaryStore = usePrimaryStoreId(projectId);
  const [storeId, setStoreId] = useState("");
  const [workOrderId, setWorkOrderId] = useState("");
  const [issueDate, setIssueDate] = useState(today);
  const [remarks, setRemarks] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([{ ...BLANK }]);

  const ledger = useProjectRows("stock_ledger_entries", projectId) as StockLedgerEntry[];
  const workOrders = useProjectRows("work_orders", projectId) as WorkOrder[];
  const boqLines = useProjectRows("boq_lines", projectId) as BoqLine[];
  const materials = useAllRows("materials") as Material[];
  const issues = useProjectRows("material_issues", projectId) as MaterialIssue[];
  const issueLines = useProjectRows("material_issue_lines", projectId) as MaterialIssueLine[];
  const positions = useMaterialPositions(projectId);
  const lookup = useLookups();
  const actor = useActor();
  const { run, pending } = useServiceAction();

  const store = storeId || primaryStore;
  const workOrder = workOrders.find((w) => w.id === workOrderId);
  const contractorId = workOrder?.contractor_id ?? null;

  /** What this store holds, which is what may be issued from it. */
  const onHand = useMemo(() => {
    const balances = new Map<string, number>();
    ledger
      .filter((e) => e.store_id === store)
      .forEach((e) => {
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
      .filter((r): r is { material: Material; balance: number } => Boolean(r.material));
  }, [ledger, materials, store]);

  const balanceOf = (materialId: string) =>
    onHand.find((r) => r.material.id === materialId)?.balance ?? 0;

  /**
   * Everything already issued to this contractor for a material. The service
   * computes the stored figure; this is the same sum, so the storeman sees
   * what the note is about to print.
   */
  const issuedSoFar = (materialId: string) => {
    const theirs = new Set(
      issues.filter((i) => i.issued_to_contractor_id === contractorId).map((i) => i.id),
    );
    return issueLines
      .filter((l) => theirs.has(l.material_issue_id) && l.material_id === materialId)
      .reduce((sum, l) => sum + l.quantity, 0);
  };

  /** BOQ lines that budget for the chosen material, then everything else. */
  const boqOptionsFor = (materialId: string) => {
    if (!materialId) return boqLines;
    const budgeted = new Set(
      positions.rows.filter((p) => p.material_id === materialId).map((p) => p.boq_line_id),
    );
    return [...boqLines].sort((a, b) => Number(budgeted.has(b.id)) - Number(budgeted.has(a.id)));
  };

  function setLine(index: number, patch: Partial<DraftLine>) {
    setLines((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function reset() {
    setStoreId("");
    setWorkOrderId("");
    setIssueDate(today);
    setRemarks("");
    setLines([{ ...BLANK }]);
  }

  const filled = lines.filter((l) => l.material_id && Number(l.quantity) > 0);
  const overStock = lines.some(
    (l) => l.material_id && Number(l.quantity) > balanceOf(l.material_id),
  );
  const duplicated =
    new Set(filled.map((l) => l.material_id)).size !== filled.length;
  const overBudget = filled.filter((l) => {
    if (!l.boq_line_id) return false;
    const position = positions.get(l.boq_line_id, l.material_id);
    return position ? position.issued_qty + Number(l.quantity) > position.budget_qty : false;
  });

  const invalidReason = !store
    ? "This project has no open store. Add one in Masters first."
    : !workOrderId
      ? "Pick the work order it is issued against"
      : filled.length === 0
        ? "Add at least one material and a quantity"
        : duplicated
          ? "The same material appears on two lines"
          : overStock
            ? "A line asks for more than the store holds"
            : undefined;

  async function submit() {
    await run(
      () =>
        issueMaterial(
          {
            project_id: projectId,
            store_id: store,
            work_order_id: workOrderId,
            issue_date: issueDate,
            remarks,
            lines: filled.map((l) => ({
              material_id: l.material_id,
              quantity: Number(l.quantity),
              boq_line_id: l.boq_line_id || null,
              remarks: l.remarks,
            })),
          },
          actor,
        ),
      {
        success: (result) => `${result.issue.issue_number} issued`,
        view: `/projects/${projectId}/stores/stock`,
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

      <FormDialog
        open={open}
        onOpenChange={setOpen}
        size="lg"
        title="Issue material to a contractor"
        context="One note, one contractor, one work order. The cumulative column is computed."
        dirty={filled.length > 0}
        invalidReason={invalidReason}
        submitLabel="Issue material"
        submitting={pending}
        onSubmit={submit}
        footerInfo={
          filled.length > 0 ? (
            <span className="num">
              {filled.length} {filled.length === 1 ? "material" : "materials"}
            </span>
          ) : null
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <StorePicker
            value={store}
            onChange={(id) => {
              setStoreId(id);
              // The new store holds different stock, so the lines start again.
              setLines([{ ...BLANK }]);
            }}
            projectId={projectId}
            label="From store"
          />

          <Field label="Issue date" required>
            <Input
              type="date"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
            />
          </Field>

          <Field
            label="Work order"
            required
            hint="The contractor and the cumulative total both follow from this."
          >
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

          <Field label="Issued to" hint="Taken from the work order.">
            <Input value={lookup.contractor(contractorId)} readOnly disabled />
          </Field>

          <Field label="Remarks" className="sm:col-span-2">
            <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </Field>
        </div>

        <LineEditor
          label="Materials"
          hint="Only what this store actually holds can be issued."
          count={lines.length}
          onAdd={() => setLines((rows) => [...rows, { ...BLANK }])}
          addLabel="Add a material"
        >
          {lines.map((line, index) => {
            const balance = balanceOf(line.material_id);
            const unit =
              materials.find((m) => m.id === line.material_id)?.unit ?? "";
            const already = line.material_id ? issuedSoFar(line.material_id) : 0;
            const entered = Number(line.quantity) || 0;
            const over = Boolean(line.material_id) && entered > balance;

            return (
              <LineRow
                key={index}
                index={index}
                removable={lines.length > 1}
                onRemove={() => setLines((rows) => rows.filter((_, i) => i !== index))}
              >
                <div className="sm:col-span-2">
                  <MaterialPicker
                    value={line.material_id || null}
                    onChange={(id) => setLine(index, { material_id: id, quantity: "" })}
                    only={onHand.map((r) => r.material.id)}
                    required
                    hint={
                      line.material_id
                        ? `${formatNumber(balance, 2)} ${unit} in this store`
                        : "Only materials in this store can be issued."
                    }
                  />
                </div>

                <Field
                  label={`Quantity now${unit ? ` (${unit})` : ""}`}
                  required
                  error={over ? `Only ${formatNumber(balance, 2)} in this store` : undefined}
                >
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    value={line.quantity}
                    onChange={(e) => setLine(index, { quantity: e.target.value })}
                    disabled={!line.material_id}
                    aria-invalid={over || undefined}
                  />
                </Field>

                <Field
                  label="Cumulative to date"
                  hint="Total issued to this contractor, including this line."
                >
                  <div className="flex h-9 items-center rounded-lg bg-muted/50 px-3">
                    {line.material_id && contractorId ? (
                      <Qty value={already + entered} unit={unit} />
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Pick a work order and a material
                      </span>
                    )}
                  </div>
                </Field>

                <Field
                  label="BOQ line"
                  hint="Where the consumption lands in Budget vs Actual."
                >
                  <NativeSelect
                    value={line.boq_line_id}
                    onChange={(e) => setLine(index, { boq_line_id: e.target.value })}
                  >
                    <option value="">Not attributed</option>
                    {boqOptionsFor(line.material_id).map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.item_code} — {b.description}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>

                <Field label="Remarks">
                  <Input
                    value={line.remarks}
                    onChange={(e) => setLine(index, { remarks: e.target.value })}
                  />
                </Field>
              </LineRow>
            );
          })}
        </LineEditor>

        {overBudget.length > 0 ? (
          <Warning>
            This takes {overBudget.length === 1 ? "a BOQ line" : `${overBudget.length} BOQ lines`}{" "}
            past the material budget — {overBudget.map((l) => lookup.material(l.material_id)).join(", ")}
            . The issue is still allowed; it will show red on Budget vs Actual.
          </Warning>
        ) : null}
      </FormDialog>
    </>
  );
}
