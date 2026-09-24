"use client";

import { useEffect, useMemo, useState } from "react";
import { PackagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Field, NativeSelect, Warning } from "@/components/common";
import { useActor, useLookups, useNewParam, useProjectId, useProjectRows, useServiceAction } from "@/lib/hooks";
import { postGrn } from "@/lib/services/stores-service";
import { formatDate, formatNumber } from "@/lib/format";
import type { PoLine, PurchaseOrder } from "@/lib/domain";
import {
  AppDialog,
  AppDialogBody,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
  SubmitButton,
} from "@/components/ui-app";

type Draft = {
  received: string;
  accepted: string;
  rejected: string;
  reason: string;
};

/**
 * B5-B6 — material received on site.
 *
 * Quantities only: this screen is used by the Site Engineer, who is denied
 * `view` on rates, so no money appears anywhere on it.
 */
export function ReceiveMaterialDialog({
  showValues,
  today,
}: {
  showValues: boolean;
  today: string;
}) {
  const projectId = useProjectId();
  // Opened by the top bar's "+ New" menu via ?new=1, or by the button below.
  const [open, setOpen] = useNewParam();
  const [poId, setPoId] = useState("");
  const [challan, setChallan] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [receivedOn, setReceivedOn] = useState(today);
  const [remarks, setRemarks] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  const purchaseOrders = useProjectRows(
    "purchase_orders",
    projectId,
  ) as PurchaseOrder[];
  const poLines = useProjectRows("po_lines", projectId) as PoLine[];
  const lookup = useLookups();
  const actor = useActor();
  const { run, pending } = useServiceAction();

  const openPos = useMemo(
    () =>
      purchaseOrders.filter(
        (p) => p.status === "sent" || p.status === "partially_received",
      ),
    [purchaseOrders],
  );
  const lines = useMemo(
    () => poLines.filter((l) => l.purchase_order_id === poId),
    [poLines, poId],
  );

  useEffect(() => {
    setDrafts(
      Object.fromEntries(
        lines.map((l) => {
          const pending_qty = l.ordered_qty - l.received_qty - l.rejected_qty;
          return [
            l.id,
            {
              received: String(pending_qty),
              accepted: String(pending_qty),
              rejected: "0",
              reason: "",
            },
          ];
        }),
      ),
    );
  }, [lines]);

  function patch(id: string, change: Partial<Draft>) {
    setDrafts((d) => {
      const nextDraft = { ...d[id], ...change };
      // Accepted follows received unless the user is splitting out a rejection.
      if (change.received !== undefined) {
        const rejected = Number(nextDraft.rejected) || 0;
        nextDraft.accepted = String(
          Math.max(0, Number(change.received) - rejected),
        );
      }
      if (change.rejected !== undefined) {
        const received = Number(nextDraft.received) || 0;
        nextDraft.accepted = String(
          Math.max(0, received - (Number(change.rejected) || 0)),
        );
      }
      return { ...d, [id]: nextDraft };
    });
  }

  function reset() {
    setPoId("");
    setChallan("");
    setVehicle("");
    setReceivedOn(today);
    setRemarks("");
    setDrafts({});
  }

  async function submit() {
    await run(
      () =>
        postGrn(
          {
            purchase_order_id: poId,
            challan_number: challan,
            vehicle_number: vehicle,
            received_on: receivedOn,
            remarks,
            lines: lines
              .filter((l) => Number(drafts[l.id]?.received ?? 0) > 0)
              .map((l) => ({
                po_line_id: l.id,
                received_qty: Number(drafts[l.id].received),
                accepted_qty: Number(drafts[l.id].accepted),
                rejected_qty: Number(drafts[l.id].rejected) || 0,
                rejection_reason: drafts[l.id].reason,
              })),
          },
          actor,
        ),
      {
        view: `/projects/${projectId}/site/grn`,
        success: (result) =>
          result.returns.length > 0
            ? `${result.grn.grn_number} posted — a return was raised for the rejected material`
            : `${result.grn.grn_number} posted and added to site stock`,
        onDone: () => {
          setOpen(false);
          reset();
        },
      },
    );
  }

  const selectedPo = purchaseOrders.find((p) => p.id === poId);
  const anyRejected = lines.some(
    (l) => Number(drafts[l.id]?.rejected ?? 0) > 0,
  );

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <PackagePlus className="size-3.5" /> Receive material
      </Button>

      <AppDialog open={open} onOpenChange={setOpen} size="xl">
        <AppDialogHeader>
          <AppDialogTitle>
            Receive material against a purchase order
          </AppDialogTitle>
          <AppDialogDescription>
            B5–B6 — accepted quantity goes straight into site stock. Anything
            rejected raises a return for Purchase to chase with the supplier.
          </AppDialogDescription>
        </AppDialogHeader>
        <AppDialogBody>
          <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
            <Field label="Purchase order" required>
              <NativeSelect
                value={poId}
                onChange={(e) => setPoId(e.target.value)}
              >
                <option value="">Select an open PO</option>
                {openPos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.po_number} — {lookup.supplier(p.supplier_id)} (expected{" "}
                    {formatDate(p.expected_delivery_date)})
                  </option>
                ))}
              </NativeSelect>
            </Field>

            {selectedPo ? (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Challan number" required>
                    <Input
                      value={challan}
                      onChange={(e) => setChallan(e.target.value)}
                      placeholder="CH-2026/118"
                    />
                  </Field>
                  <Field label="Vehicle number" required>
                    <Input
                      value={vehicle}
                      onChange={(e) => setVehicle(e.target.value)}
                      placeholder="GA 03 AB 1234"
                    />
                  </Field>
                  <Field label="Received on" required>
                    <Input
                      type="date"
                      value={receivedOn}
                      onChange={(e) => setReceivedOn(e.target.value)}
                    />
                  </Field>
                </div>

                <div className="space-y-3">
                  {lines.map((line) => {
                    const pendingQty =
                      line.ordered_qty - line.received_qty - line.rejected_qty;
                    const draft = drafts[line.id] ?? {
                      received: "0",
                      accepted: "0",
                      rejected: "0",
                      reason: "",
                    };
                    const over = Number(draft.accepted) > pendingQty;

                    return (
                      <Card key={line.id} className="px-4 py-4">
                        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                          <p className="text-sm font-semibold">
                            {lookup.material(line.material_id)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {lookup.boqItem(line.boq_line_id)}
                          </p>
                        </div>

                        <dl className="mb-3 grid grid-cols-3 gap-4 rounded-lg bg-muted/50 px-3 py-2.5">
                          <Stat
                            label="Ordered"
                            value={line.ordered_qty}
                            unit={line.unit}
                          />
                          <Stat
                            label="Received so far"
                            value={line.received_qty}
                            unit={line.unit}
                          />
                          <Stat
                            label="Pending"
                            value={pendingQty}
                            unit={line.unit}
                          />
                        </dl>

                        <div className="grid gap-3 sm:grid-cols-3">
                          <Field label={`Received (${line.unit})`}>
                            <Input
                              type="number"
                              min={0}
                              step="any"
                              value={draft.received}
                              onChange={(e) =>
                                patch(line.id, { received: e.target.value })
                              }
                            />
                          </Field>
                          <Field label={`Rejected (${line.unit})`}>
                            <Input
                              type="number"
                              min={0}
                              step="any"
                              value={draft.rejected}
                              onChange={(e) =>
                                patch(line.id, { rejected: e.target.value })
                              }
                            />
                          </Field>
                          <Field
                            label={`Accepted (${line.unit})`}
                            error={
                              over
                                ? `Only ${formatNumber(pendingQty, 2)} is pending`
                                : undefined
                            }
                          >
                            <Input
                              type="number"
                              min={0}
                              step="any"
                              value={draft.accepted}
                              readOnly
                              aria-invalid={over || undefined}
                            />
                          </Field>
                          {Number(draft.rejected) > 0 ? (
                            <Field
                              label="Rejection reason"
                              required
                              className="sm:col-span-3"
                            >
                              <Input
                                value={draft.reason}
                                onChange={(e) =>
                                  patch(line.id, { reason: e.target.value })
                                }
                                placeholder="What was wrong with the material"
                              />
                            </Field>
                          ) : null}
                        </div>
                      </Card>
                    );
                  })}
                </div>

                {anyRejected ? (
                  <Warning>
                    Rejected material raises a return automatically. Purchase
                    will dispatch it and issue a debit note against the
                    supplier.
                  </Warning>
                ) : null}

                <Field label="Remarks">
                  <Input
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    placeholder="Anything worth recording about the delivery"
                  />
                </Field>

                {showValues ? null : (
                  <p className="text-xs text-muted-foreground">
                    Rates and values are not shown on this screen for your role.
                  </p>
                )}
              </>
            ) : null}
          </div>
        </AppDialogBody>

        <AppDialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <SubmitButton
            type="button"
            onClick={submit}
            submitting={pending}
            busyLabel="Posting…"
            invalidReason={poId ? undefined : "Pick the purchase order this delivery is against."}
          >
            Post GRN
          </SubmitButton>
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
  unit: string;
}) {
  return (
    <div>
      <dt className="text-[10px] tracking-wide text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="text-sm font-medium tabular-nums">
        {formatNumber(value, 2)}
        <span className="ml-1 text-[10px] text-muted-foreground">{unit}</span>
      </dd>
    </div>
  );
}
