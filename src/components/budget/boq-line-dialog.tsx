"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { FormDialog } from "@/components/ui-app";
import { Field, NativeSelect, Qty } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TRADES, UNITS, type Material } from "@/lib/domain";
import { tradeLabel } from "@/config/labels";
import { formatInr } from "@/lib/format";
import { createBoqLine } from "@/lib/services";
import { useActor, useAllRows, useNewParam, useServiceAction } from "@/lib/hooks";

type DraftBudget = { key: number; material_id: string; budget_qty: string; budget_rate: string };

/**
 * Add a BOQ line, with the material allowances it carries.
 *
 * The allowances are the point of the form, not an afterthought: they are what
 * every indent is checked against and what Budget vs Actual measures issues
 * with, so a line saved without them can never be indented for. The footer
 * says so while the list is empty.
 */
export function BoqLineDialog({ projectId }: { projectId: string }) {
  const [open, setOpen] = useNewParam();
  const [itemCode, setItemCode] = useState("");
  const [description, setDescription] = useState("");
  const [trade, setTrade] = useState<string>("rcc");
  const [unit, setUnit] = useState<string>("cum");
  const [quantity, setQuantity] = useState("");
  const [rate, setRate] = useState("");
  const [budgets, setBudgets] = useState<DraftBudget[]>([]);
  const [nextKey, setNextKey] = useState(1);

  const materials = useAllRows("materials") as Material[];
  const actor = useActor();
  const { run, pending } = useServiceAction();

  const qty = Number(quantity);
  const rateValue = Number(rate);
  const amount = qty > 0 && rateValue > 0 ? qty * rateValue : 0;
  const dirty = Boolean(itemCode || description || quantity || rate || budgets.length > 0);

  const materialById = useMemo(
    () => new Map(materials.map((m) => [m.id, m])),
    [materials],
  );

  const invalidReason = useMemo(() => {
    if (itemCode.trim().length < 2) return "An item code is required.";
    if (description.trim().length < 4) return "Describe the work in a few words.";
    if (!(qty > 0)) return "Quantity must be more than zero.";
    if (!(rateValue > 0)) return "Rate must be more than zero.";
    for (const b of budgets) {
      if (!b.material_id) return "Every material allowance needs a material.";
      if (!(Number(b.budget_qty) > 0)) return "Every material allowance needs a quantity.";
    }
    return undefined;
  }, [itemCode, description, qty, rateValue, budgets]);

  function reset() {
    setItemCode("");
    setDescription("");
    setQuantity("");
    setRate("");
    setBudgets([]);
  }

  function addBudget() {
    setBudgets((b) => [
      ...b,
      { key: nextKey, material_id: "", budget_qty: "", budget_rate: "" },
    ]);
    setNextKey((k) => k + 1);
  }

  function patch(key: number, change: Partial<DraftBudget>) {
    setBudgets((b) => b.map((x) => (x.key === key ? { ...x, ...change } : x)));
  }

  async function submit() {
    await run(
      () =>
        createBoqLine(
          {
            project_id: projectId,
            item_code: itemCode.trim(),
            description: description.trim(),
            trade: trade as (typeof TRADES)[number],
            unit: unit as (typeof UNITS)[number],
            quantity: qty,
            rate: rateValue,
            material_budgets: budgets.map((b) => ({
              material_id: b.material_id,
              budget_qty: Number(b.budget_qty),
              budget_rate: Number(b.budget_rate) || 0,
            })),
          },
          actor,
        ),
      {
        success: (r) => `${r.line.item_code} added to the BOQ`,
        view: `/projects/${projectId}/budget/boq`,
        onDone: () => {
          reset();
          setOpen(false);
        },
      },
    );
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-3.5" /> Add BOQ line
      </Button>

      <FormDialog
        open={open}
        onOpenChange={setOpen}
        size="lg"
        title="Add a BOQ line"
        context="The priced bill of quantities. Budget vs Actual and every indent read off these lines."
        dirty={dirty}
        invalidReason={invalidReason}
        submitLabel="Add line"
        submitting={pending}
        onSubmit={submit}
        footerInfo={
          budgets.length === 0
            ? "No material allowance yet — nothing can be indented against this line."
            : `Line value ${formatInr(amount)} · ${budgets.length} material allowance${budgets.length === 1 ? "" : "s"}`
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Item code" required>
            <Input
              value={itemCode}
              onChange={(e) => setItemCode(e.target.value)}
              placeholder="BOQ-16"
            />
          </Field>
          <Field label="Trade" required>
            <NativeSelect value={trade} onChange={(e) => setTrade(e.target.value)}>
              {TRADES.map((t) => (
                <option key={t} value={t}>
                  {tradeLabel(t)}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>

        <Field label="Description" required>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="RCC M25 for columns and shear walls up to plinth"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Unit" required>
            <NativeSelect value={unit} onChange={(e) => setUnit(e.target.value)}>
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Quantity" required>
            <Input
              type="number"
              step="any"
              min={0}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </Field>
          <Field label="Rate" required hint="Per unit, in rupees.">
            <Input
              type="number"
              step="any"
              min={0}
              value={rate}
              onChange={(e) => setRate(e.target.value)}
            />
          </Field>
        </div>

        <section>
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-[0.9375rem] font-semibold">Material allowances</h3>
              <p className="text-xs text-muted-foreground">
                How much of each material this line is budgeted to consume. Indents are checked
                against it.
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addBudget}>
              <Plus className="size-3.5" /> Add material
            </Button>
          </div>

          {budgets.length === 0 ? (
            <p className="rounded-lg bg-muted/40 px-3 py-4 text-center text-xs text-muted-foreground">
              None yet. A line with no allowance cannot be indented for.
            </p>
          ) : (
            <div className="space-y-2">
              {budgets.map((b) => {
                const material = materialById.get(b.material_id);
                return (
                  <div key={b.key} className="grid grid-cols-12 items-end gap-2">
                    <div className="col-span-5 min-w-0">
                      <NativeSelect
                        value={b.material_id}
                        onChange={(e) => patch(b.key, { material_id: e.target.value })}
                        aria-label="Material"
                      >
                        <option value="">Select a material</option>
                        {materials.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </NativeSelect>
                    </div>
                    <div className="col-span-3">
                      <Input
                        type="number"
                        step="any"
                        min={0}
                        value={b.budget_qty}
                        onChange={(e) => patch(b.key, { budget_qty: e.target.value })}
                        placeholder={material ? `Qty in ${material.unit}` : "Quantity"}
                        aria-label="Budget quantity"
                      />
                    </div>
                    <div className="col-span-3">
                      <Input
                        type="number"
                        step="any"
                        min={0}
                        value={b.budget_rate}
                        onChange={(e) => patch(b.key, { budget_rate: e.target.value })}
                        placeholder="Rate"
                        aria-label="Budget rate"
                      />
                    </div>
                    <div className="col-span-1 flex justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Remove allowance"
                        onClick={() => setBudgets((rows) => rows.filter((x) => x.key !== b.key))}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                    {material && Number(b.budget_qty) > 0 ? (
                      <p className="col-span-12 -mt-1 text-xs text-muted-foreground">
                        <Qty value={Number(b.budget_qty)} unit={material.unit} /> across the whole
                        line
                        {qty > 0 ? (
                          <>
                            {" "}
                            — <Qty value={Number(b.budget_qty) / qty} unit={material.unit} /> per{" "}
                            {unit}
                          </>
                        ) : null}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </FormDialog>
    </>
  );
}
