"use client";

import { useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Warning } from "@/components/common";
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
import {
  createMaterialTransfer,
  updateMaterialTransfer,
} from "@/lib/services/transfer-service";
import { formatNumber } from "@/lib/format";
import type {
  Material,
  MaterialTransfer,
  MaterialTransferLine,
  Project,
  StockLedgerEntry,
  Store,
} from "@/lib/domain";
import { FormDialog } from "@/components/ui-app";

type DraftLine = { material_id: string; quantity: string; remarks: string };

const BLANK: DraftLine = { material_id: "", quantity: "", remarks: "" };

/**
 * The material transfer order: stock moving between stores, which may be
 * between projects.
 *
 * Material is **inherited from stock, never picked blind** — the picker is
 * narrowed to what the issuing store actually holds, which is the Phase 3 rule
 * applied to a document that has no document above it. A transfer is the one
 * stores form that names two stores, so the far end is picked across the whole
 * portfolio while the near end is narrowed to this project.
 */
export function TransferDialog({
  projectId,
  today,
  editing,
  trigger = "button",
  onDone,
}: {
  projectId: string;
  today: string;
  editing?: MaterialTransfer | null;
  trigger?: "button" | "none";
  onDone?: () => void;
}) {
  const isEdit = Boolean(editing);
  // The top bar's "+ New" menu opens the new form via ?new=1.
  const [newOpen, setNewOpen] = useNewParam();
  const [editOpen, setEditOpen] = useState(false);
  const open = isEdit ? editOpen : newOpen;
  const setOpen = isEdit ? setEditOpen : setNewOpen;

  const primaryStore = usePrimaryStoreId(projectId);
  const ledger = useProjectRows("stock_ledger_entries", projectId) as StockLedgerEntry[];
  const existingLines = useProjectRows(
    "material_transfer_lines",
    projectId,
  ) as MaterialTransferLine[];
  const materials = useAllRows("materials") as Material[];
  const stores = useAllRows("stores") as Store[];
  const projects = useAllRows("projects") as Project[];
  const actor = useActor();
  const { run, pending } = useServiceAction();

  const [fromStoreId, setFromStoreId] = useState(editing?.from_store_id ?? "");
  const [toStoreId, setToStoreId] = useState(editing?.to_store_id ?? "");
  const [transferDate, setTransferDate] = useState(editing?.transfer_date ?? today);
  const [reason, setReason] = useState(editing?.reason ?? "");
  const [vehicle, setVehicle] = useState(editing?.vehicle_number ?? "");
  const [remarks, setRemarks] = useState(editing?.remarks ?? "");
  const [lines, setLines] = useState<DraftLine[]>(() =>
    editing
      ? existingLines
          .filter((l) => l.material_transfer_id === editing.id)
          .map((l) => ({
            material_id: l.material_id,
            quantity: String(l.quantity),
            remarks: l.remarks,
          }))
      : [{ ...BLANK }],
  );

  const from = fromStoreId || primaryStore;
  const to = stores.find((s) => s.id === toStoreId);

  /** What the issuing store holds, which is all a transfer may move. */
  const balances = new Map<string, number>();
  ledger
    .filter((e) => e.store_id === from)
    .forEach((e) => {
      balances.set(
        e.material_id,
        (balances.get(e.material_id) ?? 0) + e.quantity_in - e.quantity_out,
      );
    });
  const stocked = [...balances.entries()].filter(([, q]) => q > 0).map(([id]) => id);
  const balanceOf = (id: string) => balances.get(id) ?? 0;

  function setLine(index: number, patch: Partial<DraftLine>) {
    setLines((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  const filled = lines.filter((l) => l.material_id && Number(l.quantity) > 0);
  const overStock = lines.some(
    (l) => l.material_id && Number(l.quantity) > balanceOf(l.material_id),
  );
  const duplicated = new Set(filled.map((l) => l.material_id)).size !== filled.length;
  const crossProject = Boolean(to && to.project_id !== projectId);

  const invalidReason = !from
    ? "This project has no open store. Add one in Masters first."
    : !toStoreId
      ? "Pick the store it is going to"
      : toStoreId === from
        ? "A transfer has to go somewhere else"
        : reason.trim().length < 3
          ? "Say why it is being moved"
          : filled.length === 0
            ? "Add at least one material and a quantity"
            : duplicated
              ? "The same material appears on two lines"
              : overStock
                ? "A line asks for more than the issuing store holds"
                : undefined;

  async function submit() {
    const payload = {
      project_id: projectId,
      from_store_id: from,
      to_project_id: to?.project_id ?? "",
      to_store_id: toStoreId,
      transfer_date: transferDate,
      reason,
      vehicle_number: vehicle,
      remarks,
      lines: filled.map((l) => ({
        material_id: l.material_id,
        quantity: Number(l.quantity),
        remarks: l.remarks,
      })),
    };

    await run(
      () =>
        editing
          ? updateMaterialTransfer({ ...payload, material_transfer_id: editing.id }, actor)
          : createMaterialTransfer(payload, actor),
      {
        success: (result) =>
          editing
            ? `${result.transfer.transfer_number} updated`
            : `${result.transfer.transfer_number} drafted — dispatch it when the lorry goes`,
        view: `/projects/${projectId}/stores/transfer-orders`,
        onDone: () => {
          setOpen(false);
          if (!editing) {
            setToStoreId("");
            setReason("");
            setVehicle("");
            setRemarks("");
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
          <ArrowLeftRight className="size-3.5" />
          {isEdit ? "Edit" : "New transfer order"}
        </Button>
      ) : null}

      <FormDialog
        open={open}
        onOpenChange={setOpen}
        size="lg"
        title={editing ? `Edit ${editing.transfer_number}` : "Move stock to another store"}
        context="Stock leaves on dispatch and arrives only when the receiving store signs for it."
        dirty={filled.length > 0}
        invalidReason={invalidReason}
        submitLabel={editing ? "Save changes" : "Save as draft"}
        submitting={pending}
        onSubmit={submit}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <StorePicker
            value={from}
            onChange={(id) => {
              setFromStoreId(id);
              // The new store holds different stock, so the lines start again.
              setLines([{ ...BLANK }]);
            }}
            projectId={projectId}
            label="From store"
          />

          {/*
            The far end reads across the portfolio: a transfer may cross
            projects, which is exactly the case the store model was built to
            answer.
          */}
          <StorePicker
            value={toStoreId}
            onChange={setToStoreId}
            projectId={projectId}
            label="To store"
            allProjects
            exclude={[from]}
            hint="May be another project's store."
          />

          <Field label="Transfer date" required>
            <Input
              type="date"
              value={transferDate}
              onChange={(e) => setTransferDate(e.target.value)}
            />
          </Field>

          <Field label="Vehicle number">
            <Input value={vehicle} onChange={(e) => setVehicle(e.target.value)} />
          </Field>

          <Field label="Reason for transfer" required className="sm:col-span-2">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>

          <Field label="Remarks" className="sm:col-span-2">
            <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </Field>
        </div>

        <LineEditor
          label="Materials"
          hint="Only what the issuing store holds can be moved."
          count={lines.length}
          onAdd={() => setLines((rows) => [...rows, { ...BLANK }])}
          addLabel="Add a material"
        >
          {lines.map((line, index) => {
            const material = materials.find((m) => m.id === line.material_id);
            const balance = balanceOf(line.material_id);
            const over = Boolean(line.material_id) && Number(line.quantity) > balance;

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
                    only={stocked}
                    required
                    hint={
                      line.material_id
                        ? `${formatNumber(balance, 2)} ${material?.unit ?? ""} in the issuing store`
                        : "Only materials in the issuing store can be moved."
                    }
                  />
                </div>

                <Field
                  label={`Quantity${material ? ` (${material.unit})` : ""}`}
                  required
                  error={
                    over ? `Only ${formatNumber(balance, 2)} in the issuing store` : undefined
                  }
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

        {crossProject ? (
          <Warning>
            This moves stock to{" "}
            {projects.find((p) => p.id === to!.project_id)?.name ?? "another project"}. The
            quantity leaves this project&apos;s position on dispatch and only reaches theirs
            when their store signs for it.
          </Warning>
        ) : null}
      </FormDialog>
    </>
  );
}
