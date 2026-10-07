"use client";

import { useState } from "react";
import { useMarkSeen } from "@/lib/hooks/use-unseen";
import { PackageCheck, Truck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Field, PrintButton, Qty, StatusPill } from "@/components/common";
import { TransferDocument } from "./transfer-document";
import { TransferDialog } from "./transfer-dialog";
import {
  useActor,
  useAllRows,
  useLookups,
  useServiceAction,
} from "@/lib/hooks";
import {
  acknowledgeMaterialTransfer,
  cancelMaterialTransfer,
  dispatchMaterialTransfer,
} from "@/lib/services/transfer-service";
import { formatDate, formatNumber } from "@/lib/format";
import { today } from "@/lib/clock";
import type {
  MaterialTransfer,
  MaterialTransferLine,
  Project,
  Store,
} from "@/lib/domain";
import {
  AppDialog,
  AppDialogBody,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
  SubmitButton,
} from "@/components/ui-app";

/**
 * One transfer order: the paper, and whichever of its three acts is possible.
 *
 * It reads across projects on purpose. A transfer is filed under the project it
 * leaves, but the person who has to acknowledge it stands at the other end, so
 * the sheet loads its rows from the whole portfolio rather than from the
 * project in the URL — otherwise a receiving storeman opening the document from
 * his own queue would find it empty.
 */
export function TransferSheet({
  transfer,
  open,
  onOpenChange,
  projectId,
  canEdit,
  autoAct = null,
}: {
  transfer: MaterialTransfer | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  canEdit: boolean;
  /** Start straight in this act's dialog — set by a "My work" button. */
  autoAct?: string | null;
}) {
  useMarkSeen("material_transfer", open ? transfer?.id : null);
  const allTransfers = useAllRows("material_transfers") as MaterialTransfer[];
  const allLines = useAllRows("material_transfer_lines") as MaterialTransferLine[];
  const stores = useAllRows("stores") as Store[];
  const projects = useAllRows("projects") as Project[];
  const lookup = useLookups();

  // The live row, so acting on the transfer updates this sheet immediately.
  const live = transfer
    ? (allTransfers.find((t) => t.id === transfer.id) ?? transfer)
    : null;
  if (!live) return null;

  const lines = allLines
    .filter((l) => l.material_transfer_id === live.id)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const toStore = stores.find((s) => s.id === live.to_store_id);

  return (
    <AppDialog open={open} onOpenChange={onOpenChange} size="xl">
      <AppDialogHeader className="print:hidden">
        <AppDialogTitle className="flex flex-wrap items-center gap-3 font-mono">
          {live.transfer_number}
          <StatusPill status={live.status} />
        </AppDialogTitle>
        <AppDialogDescription>
          Raised by {lookup.user(live.raised_by_user_id)} on{" "}
          {formatDate(live.transfer_date)}
          {live.dispatched_at ? ` · dispatched ${formatDate(live.dispatched_at)}` : ""}
        </AppDialogDescription>
      </AppDialogHeader>

      <AppDialogBody>
        {live.status === "in_transit" ? (
          <Card className="mb-4 border-l-2 border-l-warning px-4 py-3 print:hidden">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              In transit
            </p>
            <p className="mt-1 text-sm leading-relaxed">
              The quantity has left {lookup.project(live.project_id)} and has not arrived
              anywhere. {toStore?.name ?? "The receiving store"} has to sign for what
              actually turned up.
            </p>
          </Card>
        ) : null}

        <TransferDocument
          transfer={live}
          lines={lines}
          fromProject={projects.find((p) => p.id === live.project_id)}
          fromStore={stores.find((s) => s.id === live.from_store_id)}
          toProject={projects.find((p) => p.id === live.to_project_id)}
          toStore={toStore}
          raisedBy={lookup.user(live.raised_by_user_id)}
          acknowledgedBy={
            live.acknowledged_by_user_id ? lookup.user(live.acknowledged_by_user_id) : null
          }
          materialLabel={(id) => lookup.material(id)}
        />
      </AppDialogBody>

      <AppDialogFooter className="print:hidden">
        <PrintButton label="Print / PDF" />
        {canEdit && live.status === "draft" ? (
          <>
            <CancelAction transfer={live} onDone={() => onOpenChange(false)} />
            <TransferDialog projectId={projectId} today={today()} editing={live} />
            <DispatchAction transfer={live} />
          </>
        ) : null}
        {canEdit && live.status === "in_transit" ? (
          <AcknowledgeAction transfer={live} lines={lines} startOpen={autoAct === "acknowledge_receipt"} />
        ) : null}
      </AppDialogFooter>
    </AppDialog>
  );
}

/** The lorry leaves. Stock comes off the issuing store and nowhere else yet. */
function DispatchAction({ transfer }: { transfer: MaterialTransfer }) {
  const actor = useActor();
  const { run, pending } = useServiceAction();
  return (
    <Button
      size="sm"
      disabled={pending}
      onClick={() =>
        run(() => dispatchMaterialTransfer(transfer.id, actor), {
          success: (result) =>
            `${result.transfer.transfer_number} dispatched — ${result.stock_entries.length} ${result.stock_entries.length === 1 ? "line" : "lines"} off the issuing store`,
          view: `/projects/${transfer.project_id}/stores/transfer-orders`,
        })
      }
    >
      <Truck className="size-3.5" /> Dispatch
    </Button>
  );
}

/**
 * The receiving store signs for it, which is what completes the transfer.
 *
 * Every line defaults to arriving in full, because that is what usually
 * happened; a short delivery is entered as a smaller quantity and the
 * difference then prints on the document rather than being written out of it.
 */
function AcknowledgeAction({
  transfer,
  lines,
  startOpen,
}: {
  transfer: MaterialTransfer;
  lines: MaterialTransferLine[];
  startOpen: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  const [receivedOn, setReceivedOn] = useState(today());
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(lines.map((l) => [l.id, String(l.quantity)])),
  );
  const lookup = useLookups();
  const actor = useActor();
  const { run, pending } = useServiceAction();

  const over = lines.some((l) => Number(values[l.id] ?? 0) > l.quantity);
  const nothing = lines.every((l) => Number(values[l.id] ?? 0) === 0);
  const shortfall = lines.reduce(
    (s, l) => s + Math.max(0, l.quantity - Number(values[l.id] ?? 0)),
    0,
  );

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <PackageCheck className="size-3.5" /> Acknowledge receipt
      </Button>

      <AppDialog open={open} onOpenChange={setOpen} size="md">
        <AppDialogHeader
          title={`What arrived on ${transfer.transfer_number}?`}
          context="Each line is set to what was sent. Change it only where less turned up."
        />
        <AppDialogBody className="space-y-4">
          <Field label="Received on" required>
            <Input
              type="date"
              value={receivedOn}
              onChange={(e) => setReceivedOn(e.target.value)}
            />
          </Field>

          <div className="space-y-3">
            {lines.map((line) => {
              const value = Number(values[line.id] ?? 0);
              return (
                <div key={line.id} className="rounded-xl border border-border p-3">
                  <p className="text-sm font-medium">{lookup.material(line.material_id)}</p>
                  <p className="mb-2 text-xs text-muted-foreground">
                    <Qty value={line.quantity} unit={line.unit} /> dispatched
                  </p>
                  <Field
                    label="Received"
                    error={
                      value > line.quantity
                        ? `Only ${formatNumber(line.quantity, 2)} was sent`
                        : undefined
                    }
                  >
                    <Input
                      type="number"
                      min={0}
                      max={line.quantity}
                      step="any"
                      value={values[line.id] ?? ""}
                      onChange={(e) =>
                        setValues((v) => ({ ...v, [line.id]: e.target.value }))
                      }
                      aria-invalid={value > line.quantity || undefined}
                    />
                  </Field>
                </div>
              );
            })}
          </div>

          {shortfall > 0 && !over ? (
            <p className="rounded-lg bg-warning-soft px-3 py-2 text-xs leading-relaxed text-warning ring-1 ring-warning/30">
              {formatNumber(shortfall, 2)} less than was dispatched. The shortfall stays on
              the document — the quantity sent is not rewritten.
            </p>
          ) : null}
        </AppDialogBody>
        <AppDialogFooter>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <SubmitButton
            type="button"
            label="Acknowledge receipt"
            invalidReason={
              over
                ? "A line receives more than was sent"
                : nothing
                  ? "Nothing arrived? Record at least one quantity"
                  : undefined
            }
            submitting={pending}
            onClick={() =>
              run(
                () =>
                  acknowledgeMaterialTransfer(
                    {
                      material_transfer_id: transfer.id,
                      received_on: receivedOn,
                      lines: lines.map((l) => ({
                        material_transfer_line_id: l.id,
                        received_qty: Number(values[l.id] ?? 0),
                      })),
                    },
                    actor,
                  ),
                {
                  success: (result) =>
                    `${result.transfer.transfer_number} received — ${result.stock_entries.length} ${result.stock_entries.length === 1 ? "line" : "lines"} into the store`,
                  view: `/projects/${transfer.to_project_id}/stores/stock-position`,
                  onDone: () => setOpen(false),
                },
              )
            }
          />
        </AppDialogFooter>
      </AppDialog>
    </>
  );
}

/** A draft nobody dispatched. Once it is on a lorry, it cannot be cancelled. */
function CancelAction({
  transfer,
  onDone,
}: {
  transfer: MaterialTransfer;
  onDone: () => void;
}) {
  const actor = useActor();
  const { run, pending } = useServiceAction();
  return (
    <Button
      variant="destructive"
      size="sm"
      disabled={pending}
      onClick={() =>
        run(() => cancelMaterialTransfer(transfer.id, actor), {
          success: `${transfer.transfer_number} cancelled`,
          view: `/projects/${transfer.project_id}/stores/transfer-orders`,
          onDone,
        })
      }
    >
      <X className="size-3.5" /> Cancel
    </Button>
  );
}
