"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, NativeSelect, Warning } from "@/components/common";
import { useActor, useMaterialPositions, useNewParam, useProjectRows, useServiceAction } from "@/lib/hooks";
import { createIndent } from "@/lib/services/indent-service";
import { formatNumber } from "@/lib/format";
import type { BoqLine, Material, WorkOrder } from "@/lib/domain";
import { cn } from "cn";
import {
  AppDialog,
  AppDialogBody,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from "@/components/ui-app";

type DraftLine = {
  key: number;
  boq_line_id: string;
  material_id: string;
  requested_qty: string;
  required_by: string;
  remarks: string;
};

function emptyLine(key: number): DraftLine {
  return {
    key,
    boq_line_id: "",
    material_id: "",
    requested_qty: "",
    required_by: "",
    remarks: "",
  };
}

/**
 * A2 — raise a material indent.
 *
 * Picking a BOQ line and material shows what the budget allows, what has
 * already been indented and issued, and what is on site. Asking for more than
 * the balance warns but never blocks: the Project Head decides at A2.
 */
export function RaiseIndentDialog({
  projectId,
  materials,
}: {
  projectId: string;
  materials: Material[];
}) {
  // Opened by the top bar's "+ New" menu via ?new=1, or by the button below.
  const [open, setOpen] = useNewParam();
  const [workOrderId, setWorkOrderId] = useState("");
  const [remarks, setRemarks] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([emptyLine(0)]);
  const [nextKey, setNextKey] = useState(1);

  const boqLines = useProjectRows("boq_lines", projectId) as BoqLine[];
  const workOrders = useProjectRows("work_orders", projectId) as WorkOrder[];
  const positions = useMaterialPositions(projectId);
  const { run, pending } = useServiceAction();
  const actor = useActor();

  const materialById = useMemo(
    () => new Map(materials.map((m) => [m.id, m])),
    [materials],
  );

  function reset() {
    setWorkOrderId("");
    setRemarks("");
    setLines([emptyLine(0)]);
    setNextKey(1);
  }

  function patch(key: number, change: Partial<DraftLine>) {
    setLines((rows) =>
      rows.map((r) => (r.key === key ? { ...r, ...change } : r)),
    );
  }

  const overruns = lines.filter((l) => {
    if (!l.boq_line_id || !l.material_id || !l.requested_qty) return false;
    const position = positions.get(l.boq_line_id, l.material_id);
    return position ? Number(l.requested_qty) > position.balance_qty : false;
  });

  async function submit() {
    const result = await run(
      () =>
        createIndent(
          {
            project_id: projectId,
            work_order_id: workOrderId || null,
            remarks,
            lines: lines.map((l) => ({
              boq_line_id: l.boq_line_id,
              material_id: l.material_id,
              requested_qty: Number(l.requested_qty),
              required_by: l.required_by,
              remarks: l.remarks,
            })),
          },
          actor,
        ),
      {
        success: "Indent raised",
        view: `/projects/${projectId}/site/indents`,
        onDone: () => {
          setOpen(false);
          reset();
        },
      },
    );
    return result;
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-3.5" /> Raise indent
      </Button>

      <AppDialog open={open} onOpenChange={setOpen} size="xl">
        <AppDialogHeader>
          <AppDialogTitle>Raise a material indent</AppDialogTitle>
          <AppDialogDescription>
            A2 — the request goes to the Project Head, who checks it against the
            BOQ material budget before Purchase sees it.
          </AppDialogDescription>
        </AppDialogHeader>
        <AppDialogBody>
          <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Against work order"
                hint="Optional, but it helps the approver."
              >
                <NativeSelect
                  value={workOrderId}
                  onChange={(e) => setWorkOrderId(e.target.value)}
                >
                  <option value="">Not linked to a work order</option>
                  {workOrders.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.wo_number} — {w.title}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Remarks">
                <Input
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Why this material is needed"
                />
              </Field>
            </div>

            <div className="space-y-3">
              {lines.map((line, i) => {
                const available = positions.materialsFor(line.boq_line_id);
                const position =
                  line.boq_line_id && line.material_id
                    ? positions.get(line.boq_line_id, line.material_id)
                    : null;
                const material = materialById.get(line.material_id);
                const over =
                  position && line.requested_qty
                    ? Number(line.requested_qty) > position.balance_qty
                    : false;

                return (
                  <div
                    key={line.key}
                    className="rounded-xl bg-muted/40 p-4 ring-1 ring-border/60"
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">
                        Line {i + 1}
                      </span>
                      {lines.length > 1 ? (
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label="Remove line"
                          onClick={() =>
                            setLines((rows) =>
                              rows.filter((r) => r.key !== line.key),
                            )
                          }
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      ) : null}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="BOQ line" required>
                        <NativeSelect
                          value={line.boq_line_id}
                          onChange={(e) =>
                            patch(line.key, {
                              boq_line_id: e.target.value,
                              material_id: "",
                            })
                          }
                        >
                          <option value="">Select a BOQ line</option>
                          {boqLines.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.item_code} — {b.description}
                            </option>
                          ))}
                        </NativeSelect>
                      </Field>

                      <Field label="Material" required>
                        <NativeSelect
                          value={line.material_id}
                          disabled={!line.boq_line_id}
                          onChange={(e) =>
                            patch(line.key, { material_id: e.target.value })
                          }
                        >
                          <option value="">
                            {line.boq_line_id
                              ? "Select a material"
                              : "Pick a BOQ line first"}
                          </option>
                          {available.map((id) => (
                            <option key={id} value={id}>
                              {materialById.get(id)?.name ?? id}
                            </option>
                          ))}
                        </NativeSelect>
                      </Field>

                      <Field
                        label={`Quantity${material ? ` (${material.unit})` : ""}`}
                        required
                      >
                        <Input
                          type="number"
                          min={0}
                          step="any"
                          value={line.requested_qty}
                          onChange={(e) =>
                            patch(line.key, { requested_qty: e.target.value })
                          }
                          aria-invalid={over || undefined}
                        />
                      </Field>

                      <Field label="Required by" required>
                        <Input
                          type="date"
                          value={line.required_by}
                          onChange={(e) =>
                            patch(line.key, { required_by: e.target.value })
                          }
                        />
                      </Field>
                    </div>

                    {position ? (
                      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg bg-background px-3 py-2.5 ring-1 ring-border/60 sm:grid-cols-5">
                        <Figure
                          label="Budget"
                          value={position.budget_qty}
                          unit={material?.unit}
                        />
                        <Figure
                          label="Indented"
                          value={position.indented_qty}
                          unit={material?.unit}
                        />
                        <Figure
                          label="Issued"
                          value={position.issued_qty}
                          unit={material?.unit}
                        />
                        <Figure
                          label="Balance"
                          value={position.balance_qty}
                          unit={material?.unit}
                          tone={over ? "bad" : "good"}
                        />
                        <Figure
                          label="On site"
                          value={position.stock_qty}
                          unit={material?.unit}
                        />
                      </dl>
                    ) : null}

                    {over && position ? (
                      <div className="mt-3">
                        <Warning>
                          This asks for{" "}
                          {formatNumber(Number(line.requested_qty), 2)}{" "}
                          {material?.unit} against a balance of{" "}
                          {formatNumber(position.balance_qty, 2)}{" "}
                          {material?.unit}. You can still raise it — the Project
                          Head will see the same figures and decide.
                        </Warning>
                      </div>
                    ) : null}
                  </div>
                );
              })}

              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setLines((rows) => [...rows, emptyLine(nextKey)]);
                  setNextKey((k) => k + 1);
                }}
              >
                <Plus className="size-3.5" /> Add another material
              </Button>
            </div>
          </div>
        </AppDialogBody>

        <AppDialogFooter>
          {overruns.length > 0 ? (
            <span className="mr-auto text-xs text-warning">
              {overruns.length} line{overruns.length > 1 ? "s" : ""} exceed the
              BOQ balance
            </span>
          ) : null}
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Raising…" : "Raise indent"}
          </Button>
        </AppDialogFooter>
      </AppDialog>
    </>
  );
}

function Figure({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: number;
  unit?: string;
  tone?: "good" | "bad";
}) {
  return (
    <div>
      <dt className="text-[10px] tracking-wide text-muted-foreground uppercase">
        {label}
      </dt>
      <dd
        className={cn(
          "text-sm font-medium tabular-nums",
          tone === "bad" && "text-destructive",
          tone === "good" && "text-success",
        )}
      >
        {formatNumber(value, 2)}
        {unit ? (
          <span className="ml-1 text-[10px] text-muted-foreground">{unit}</span>
        ) : null}
      </dd>
    </div>
  );
}
