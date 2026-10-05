"use client";

import { useState } from "react";
import { DoorOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, NativeSelect, Warning } from "@/components/common";
import { MaterialPicker } from "@/components/material/material-picker";
import { LineEditor, LineRow } from "./line-editor";
import { StorePicker, usePrimaryStoreId } from "./store-picker";
import {
  useActor,
  useAllRows,
  useNewParam,
  useProjectRows,
  useServiceAction,
} from "@/lib/hooks";
import { createGatePass, updateGatePass } from "@/lib/services/gate-pass-service";
import { daysAheadDate } from "@/lib/clock";
import { formatNumber } from "@/lib/format";
import { GATE_PASS_TYPE_LABEL } from "@/config/labels";
import { GATE_PASS_TYPES, UNITS } from "@/lib/domain";
import type {
  GatePass,
  GatePassLine,
  GatePassType,
  Material,
  StockLedgerEntry,
  Unit,
} from "@/lib/domain";
import { FormDialog } from "@/components/ui-app";

/**
 * A line is one of two kinds, and the kind decides which fields it carries.
 * Holding it explicitly rather than inferring it from which field is empty is
 * what keeps the form from flickering between the two while it is being typed.
 */
type DraftLine = {
  kind: "stock" | "other";
  material_id: string;
  description: string;
  unit: Unit;
  quantity: string;
  remarks: string;
};

const BLANK: DraftLine = {
  kind: "stock",
  material_id: "",
  description: "",
  unit: "nos",
  quantity: "",
  remarks: "",
};

/**
 * The gate pass, on the form Manas sent us.
 *
 * **The type decides the form.** Returnable asks for the date it is expected
 * back; the other two do not have the field at all, rather than showing it
 * greyed out. The service refuses the mismatch either way, so the screen and
 * the rule cannot drift apart.
 *
 * **A line may have no material.** A gate pass is also how a contractor's own
 * mixer, a ladder or scaffolding that was never received on a GRN leaves the
 * site, and forcing those through the material master would mean inventing
 * leaves nobody will ever indent. Such a line says what it is in words and
 * moves no stock — which is why the picker is a choice here and nowhere else in
 * the Stores tab.
 */
export function GatePassDialog({
  projectId,
  today,
  /** An existing draft to rewrite. Omit to raise a new pass. */
  editing,
  trigger = "button",
  onDone,
}: {
  projectId: string;
  today: string;
  editing?: GatePass | null;
  trigger?: "button" | "none";
  onDone?: () => void;
}) {
  const isEdit = Boolean(editing);
  // The top bar's "+ New" menu opens this via ?new=1 when it is the new form.
  const [newOpen, setNewOpen] = useNewParam();
  const [editOpen, setEditOpen] = useState(false);
  const open = isEdit ? editOpen : newOpen;
  const setOpen = isEdit ? setEditOpen : setNewOpen;

  const primaryStore = usePrimaryStoreId(projectId);
  const existingLines = useProjectRows("gate_pass_lines", projectId) as GatePassLine[];
  const ledger = useProjectRows("stock_ledger_entries", projectId) as StockLedgerEntry[];
  const materials = useAllRows("materials") as Material[];
  const actor = useActor();
  const { run, pending } = useServiceAction();

  const [form, setForm] = useState(() => initial(editing, today, primaryStore));
  const [lines, setLines] = useState<DraftLine[]>(() =>
    editing
      ? existingLines
          .filter((l) => l.gate_pass_id === editing.id)
          .map((l) => ({
            kind: (l.material_id ? "stock" : "other") as DraftLine["kind"],
            material_id: l.material_id ?? "",
            description: l.description,
            unit: l.unit,
            quantity: String(l.quantity),
            remarks: l.remarks,
          }))
      : [{ ...BLANK }],
  );

  const store = form.store_id || primaryStore;

  /** What this store holds, for the lines that draw on stock. */
  const balances = new Map<string, number>();
  ledger
    .filter((e) => e.store_id === store)
    .forEach((e) => {
      balances.set(
        e.material_id,
        (balances.get(e.material_id) ?? 0) + e.quantity_in - e.quantity_out,
      );
    });
  const stocked = [...balances.entries()].filter(([, q]) => q > 0).map(([id]) => id);
  const balanceOf = (id: string) => balances.get(id) ?? 0;

  function set<K extends keyof ReturnType<typeof initial>>(
    key: K,
    value: ReturnType<typeof initial>[K],
  ) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function setLine(index: number, patch: Partial<DraftLine>) {
    setLines((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  const returnable = form.pass_type === "returnable";

  const named = (l: DraftLine) =>
    l.kind === "stock" ? Boolean(l.material_id) : l.description.trim().length > 1;
  const filled = lines.filter((l) => Number(l.quantity) > 0 && named(l));
  const overStock = lines.some(
    (l) => l.kind === "stock" && l.material_id && Number(l.quantity) > balanceOf(l.material_id),
  );
  const unnamed = lines.some((l) => Number(l.quantity) > 0 && !named(l));

  const invalidReason = !store
    ? "This project has no open store. Add one in Masters first."
    : form.issued_to_name.trim().length < 2
      ? "Say who is taking it"
      : form.purpose.trim().length < 3
        ? "Say why it is leaving site"
        : returnable && !form.expected_return_date
          ? "A returnable pass needs the date it is expected back"
          : filled.length === 0
            ? "Add at least one line with a quantity"
            : unnamed
              ? "Name the material, or describe what is going out"
              : overStock
                ? "A line asks for more than the store holds"
                : undefined;

  async function submit() {
    const payload = {
      project_id: projectId,
      store_id: store,
      pass_type: form.pass_type,
      gate_pass_date: form.gate_pass_date,
      issued_to_name: form.issued_to_name,
      issued_to_company: form.issued_to_company,
      vehicle_number: form.vehicle_number,
      driver_name: form.driver_name,
      purpose: form.purpose,
      // Only a returnable pass carries one, and the service refuses the rest.
      expected_return_date: returnable ? form.expected_return_date : null,
      remarks: form.remarks,
      lines: filled.map((l) => ({
        material_id: l.kind === "stock" ? l.material_id : null,
        description: l.kind === "stock" ? "" : l.description,
        // A stock line's unit comes off the material, never off the form: a
        // material measured in bags cannot leave the gate in kilograms.
        unit:
          l.kind === "stock"
            ? (materials.find((m) => m.id === l.material_id)?.unit ?? l.unit)
            : l.unit,
        quantity: Number(l.quantity),
        remarks: l.remarks,
      })),
    };

    await run(
      () =>
        editing
          ? updateGatePass({ ...payload, gate_pass_id: editing.id }, actor)
          : createGatePass(payload, actor),
      {
        success: (result) =>
          editing
            ? `${result.gate_pass.gate_pass_number} updated`
            : `${result.gate_pass.gate_pass_number} drafted — send it for approval`,
        view: `/projects/${projectId}/stores/gate-pass`,
        onDone: () => {
          setOpen(false);
          if (!editing) {
            setForm(initial(null, today, primaryStore));
            setLines([{ ...BLANK }]);
          }
          onDone?.();
        },
      },
    );
  }

  return (
    <>
      {trigger === "button" ? (
        <Button
          size="sm"
          variant={isEdit ? "outline" : "default"}
          onClick={() => setOpen(true)}
        >
          <DoorOpen className="size-3.5" /> {isEdit ? "Edit" : "Raise gate pass"}
        </Button>
      ) : null}

      <FormDialog
        open={open}
        onOpenChange={setOpen}
        size="lg"
        title={editing ? `Edit ${editing.gate_pass_number}` : "Raise a gate pass"}
        context="Material leaving the gate. The type decides what the form asks for."
        dirty={filled.length > 0}
        invalidReason={invalidReason}
        submitLabel={editing ? "Save changes" : "Save as draft"}
        submitting={pending}
        onSubmit={submit}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Type"
            required
            hint={
              returnable
                ? "Tracked until it comes back."
                : form.pass_type === "transfer"
                  ? "Accompanies a material transfer order out of the gate."
                  : "Nothing is expected back."
            }
          >
            <NativeSelect
              value={form.pass_type}
              onChange={(e) => {
                const next = e.target.value as GatePassType;
                set("pass_type", next);
                // The field only exists on a returnable pass, so leaving a
                // stale date behind would be refused by the service.
                if (next !== "returnable") set("expected_return_date", "");
                else if (!form.expected_return_date) {
                  set("expected_return_date", daysAheadDate(7));
                }
              }}
            >
              {GATE_PASS_TYPES.map((t) => (
                <option key={t} value={t}>
                  {GATE_PASS_TYPE_LABEL[t]}
                </option>
              ))}
            </NativeSelect>
          </Field>

          <Field label="Date" required>
            <Input
              type="date"
              value={form.gate_pass_date}
              onChange={(e) => set("gate_pass_date", e.target.value)}
            />
          </Field>

          <StorePicker
            value={store}
            onChange={(id) => {
              set("store_id", id);
              setLines([{ ...BLANK }]);
            }}
            projectId={projectId}
            label="From store"
          />

          {/*
            Only a returnable pass has this field. A greyed-out date on a
            non-returnable pass asks a question the form has already answered.
          */}
          {returnable ? (
            <Field
              label="Expected return date"
              required
              hint="What the overdue list is measured against."
            >
              <Input
                type="date"
                value={form.expected_return_date}
                onChange={(e) => set("expected_return_date", e.target.value)}
              />
            </Field>
          ) : null}

          <Field label="Issued to" required hint="Who is taking it out.">
            <Input
              value={form.issued_to_name}
              onChange={(e) => set("issued_to_name", e.target.value)}
            />
          </Field>

          <Field label="Company">
            <Input
              value={form.issued_to_company}
              onChange={(e) => set("issued_to_company", e.target.value)}
            />
          </Field>

          <Field label="Vehicle number">
            <Input
              value={form.vehicle_number}
              onChange={(e) => set("vehicle_number", e.target.value)}
            />
          </Field>

          <Field label="Driver name">
            <Input
              value={form.driver_name}
              onChange={(e) => set("driver_name", e.target.value)}
            />
          </Field>

          <Field
            label="Purpose / reason for removal"
            required
            className="sm:col-span-2"
            hint="What the project manager reads before signing."
          >
            <Input value={form.purpose} onChange={(e) => set("purpose", e.target.value)} />
          </Field>

          <Field label="Remarks" className="sm:col-span-2">
            <Input value={form.remarks} onChange={(e) => set("remarks", e.target.value)} />
          </Field>
        </div>

        <LineEditor
          label="What is going out"
          hint="Pick a material from this store, or describe a non-stock item."
          count={lines.length}
          onAdd={() => setLines((rows) => [...rows, { ...BLANK }])}
        >
          {lines.map((line, index) => {
            const material = materials.find((m) => m.id === line.material_id);
            const balance = balanceOf(line.material_id);
            const over = line.kind === "stock" && Number(line.quantity) > balance;

            return (
              <LineRow
                key={index}
                index={index}
                removable={lines.length > 1}
                onRemove={() => setLines((rows) => rows.filter((_, i) => i !== index))}
              >
                <Field
                  label="Line is"
                  hint={
                    line.kind === "stock"
                      ? "Comes out of the store's stock."
                      : "Never received on a GRN, so it moves no stock."
                  }
                >
                  <NativeSelect
                    value={line.kind}
                    onChange={(e) =>
                      // Changing the kind starts the line again: the two kinds
                      // fill different fields.
                      setLine(index, {
                        ...BLANK,
                        kind: e.target.value as DraftLine["kind"],
                        remarks: line.remarks,
                      })
                    }
                  >
                    <option value="stock">Material from the store</option>
                    <option value="other">Tool, plant or other non-stock item</option>
                  </NativeSelect>
                </Field>

                <Field
                  label={`Quantity${material ? ` (${material.unit})` : ""}`}
                  required
                  error={over ? `Only ${formatNumber(balance, 2)} in this store` : undefined}
                >
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    value={line.quantity}
                    onChange={(e) => setLine(index, { quantity: e.target.value })}
                    aria-invalid={over || undefined}
                  />
                </Field>

                {line.kind === "stock" ? (
                  <div className="sm:col-span-2">
                    <MaterialPicker
                      value={line.material_id || null}
                      onChange={(id) => setLine(index, { material_id: id, quantity: "" })}
                      only={stocked}
                      required
                      hint={
                        line.material_id
                          ? `${formatNumber(balance, 2)} ${material?.unit ?? ""} in this store`
                          : "Only materials in this store can be taken out on a pass."
                      }
                    />
                  </div>
                ) : (
                  <>
                    <Field label="What is going out" required>
                      <Input
                        value={line.description}
                        onChange={(e) => setLine(index, { description: e.target.value })}
                        placeholder="Plate compactor, 5HP"
                      />
                    </Field>
                    <Field label="UOM" required>
                      <NativeSelect
                        value={line.unit}
                        onChange={(e) => setLine(index, { unit: e.target.value as Unit })}
                      >
                        {UNITS.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </NativeSelect>
                    </Field>
                  </>
                )}

                <Field label="Remarks" className="sm:col-span-2">
                  <Input
                    value={line.remarks}
                    onChange={(e) => setLine(index, { remarks: e.target.value })}
                  />
                </Field>
              </LineRow>
            );
          })}
        </LineEditor>

        {returnable ? (
          <Warning>
            Stock leaves the store when the project manager approves this pass, and
            comes back only when the return is recorded against it.
          </Warning>
        ) : null}
      </FormDialog>
    </>
  );
}

function initial(pass: GatePass | null | undefined, today: string, store: string) {
  return {
    store_id: pass?.store_id ?? store,
    pass_type: (pass?.pass_type ?? "returnable") as GatePassType,
    gate_pass_date: pass?.gate_pass_date ?? today,
    issued_to_name: pass?.issued_to_name ?? "",
    issued_to_company: pass?.issued_to_company ?? "",
    vehicle_number: pass?.vehicle_number ?? "",
    driver_name: pass?.driver_name ?? "",
    purpose: pass?.purpose ?? "",
    expected_return_date: pass?.expected_return_date ?? daysAheadDate(7),
    remarks: pass?.remarks ?? "",
  };
}
