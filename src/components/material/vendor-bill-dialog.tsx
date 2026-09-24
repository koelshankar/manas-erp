"use client";

import { useEffect, useMemo, useState } from "react";
import { FilePlus2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Field, NativeSelect } from "@/components/common";
import { useActor, useAllRows, useLookups, useNewParam, useProjectRows, useServiceAction } from "@/lib/hooks";
import { createVendorBill } from "@/lib/services/vendor-bill-service";
import { formatInr, formatNumber } from "@/lib/format";
import type { Grn, GrnLine, Supplier } from "@/lib/domain";
import {
  AppDialog,
  AppDialogBody,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from "@/components/ui-app";

type Draft = {
  include: boolean;
  billed_qty: string;
  billed_rate: string;
  billed_gst_percent: string;
};

/**
 * B7 — enter a supplier invoice against one or more GRNs.
 *
 * The three-way match runs in the service on save; this form just collects what
 * the vendor actually billed so the differences show up.
 */
export function VendorBillDialog({
  projectId,
  today,
}: {
  projectId: string;
  today: string;
}) {
  // Opened by the top bar's "+ New" menu via ?new=1, or by the button below.
  const [open, setOpen] = useNewParam();
  const [supplierId, setSupplierId] = useState("");
  const [billNumber, setBillNumber] = useState("");
  const [billDate, setBillDate] = useState(today);
  const [receivedDate, setReceivedDate] = useState(today);
  const [remarks, setRemarks] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  const grns = useProjectRows("grns", projectId) as Grn[];
  const grnLines = useProjectRows("grn_lines", projectId) as GrnLine[];
  const suppliers = useAllRows("suppliers") as Supplier[];
  const lookup = useLookups();
  const actor = useActor();
  const { run, pending } = useServiceAction();

  /** Suppliers with at least one GRN line still to be billed. */
  const billableSuppliers = useMemo(() => {
    const ids = new Set(
      grnLines
        .filter((l) => l.accepted_qty - l.billed_qty > 0)
        .map((l) => grns.find((g) => g.id === l.grn_id)?.supplier_id)
        .filter((id): id is string => Boolean(id)),
    );
    return suppliers.filter((s) => ids.has(s.id));
  }, [grnLines, grns, suppliers]);

  const candidates = useMemo(() => {
    if (!supplierId) return [];
    const mine = new Set(
      grns.filter((g) => g.supplier_id === supplierId).map((g) => g.id),
    );
    return grnLines.filter(
      (l) => mine.has(l.grn_id) && l.accepted_qty - l.billed_qty > 0,
    );
  }, [grnLines, grns, supplierId]);

  useEffect(() => {
    setDrafts(
      Object.fromEntries(
        candidates.map((l) => [
          l.id,
          {
            include: true,
            billed_qty: String(l.accepted_qty - l.billed_qty),
            billed_rate: String(l.rate),
            billed_gst_percent: String(l.gst_percent),
          },
        ]),
      ),
    );
  }, [candidates]);

  function patch(id: string, change: Partial<Draft>) {
    setDrafts((d) => ({ ...d, [id]: { ...d[id], ...change } }));
  }

  function reset() {
    setSupplierId("");
    setBillNumber("");
    setBillDate(today);
    setReceivedDate(today);
    setRemarks("");
    setDrafts({});
  }

  async function submit() {
    await run(
      () =>
        createVendorBill(
          {
            project_id: projectId,
            supplier_id: supplierId,
            bill_number: billNumber,
            bill_date: billDate,
            received_date: receivedDate,
            remarks,
            lines: candidates
              .filter((l) => drafts[l.id]?.include)
              .map((l) => ({
                grn_line_id: l.id,
                billed_qty: Number(drafts[l.id].billed_qty),
                billed_rate: Number(drafts[l.id].billed_rate),
                billed_gst_percent: Number(drafts[l.id].billed_gst_percent),
              })),
          },
          actor,
        ),
      {
        view: `/projects/${projectId}/purchase/vendor-bills`,
        success: (r) =>
          r.bill.status === "matched"
            ? `${r.bill.reference_number} matched against the PO and GRN`
            : `${r.bill.reference_number} saved — it failed the three-way match`,
        onDone: () => {
          setOpen(false);
          reset();
        },
      },
    );
  }

  const included = candidates.filter((l) => drafts[l.id]?.include);

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <FilePlus2 className="size-3.5" /> Enter vendor bill
      </Button>

      <AppDialog open={open} onOpenChange={setOpen} size="xl">
        <AppDialogHeader>
          <AppDialogTitle>Enter a vendor bill</AppDialogTitle>
          <AppDialogDescription>
            B7 — billed quantity is matched against the GRN, and billed rate and
            GST against the PO. Any difference lands the bill in mismatch.
          </AppDialogDescription>
        </AppDialogHeader>
        <AppDialogBody>
          <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Supplier" required>
                <NativeSelect
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                >
                  <option value="">
                    Select a supplier with unbilled receipts
                  </option>
                  {billableSuppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.state})
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Supplier's invoice number" required>
                <Input
                  value={billNumber}
                  onChange={(e) => setBillNumber(e.target.value)}
                  placeholder="INV/2026/1182"
                />
              </Field>
              <Field label="Bill date" required>
                <Input
                  type="date"
                  value={billDate}
                  onChange={(e) => setBillDate(e.target.value)}
                />
              </Field>
              <Field label="Received on" required>
                <Input
                  type="date"
                  value={receivedDate}
                  onChange={(e) => setReceivedDate(e.target.value)}
                />
              </Field>
            </div>

            {supplierId && candidates.length === 0 ? (
              <p className="rounded-lg bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
                Every receipt from this supplier has already been billed.
              </p>
            ) : null}

            {candidates.map((line) => {
              const draft = drafts[line.id];
              if (!draft) return null;
              const unbilled = line.accepted_qty - line.billed_qty;
              const qtyOff =
                Math.abs(Number(draft.billed_qty) - line.accepted_qty) > 0.0005;
              const rateOff =
                Math.abs(Number(draft.billed_rate) - line.rate) >= 1;
              const taxOff =
                Math.abs(Number(draft.billed_gst_percent) - line.gst_percent) >
                0.0005;

              return (
                <Card key={line.id} className="px-4 py-4">
                  <label className="mb-3 flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={draft.include}
                      onChange={(e) =>
                        patch(line.id, { include: e.target.checked })
                      }
                      className="size-4 accent-[var(--team-purchase)]"
                    />
                    <span className="text-sm font-semibold">
                      {lookup.material(line.material_id)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {lookup.grnNumber(line.grn_id)} · accepted{" "}
                      {formatNumber(line.accepted_qty, 2)} {line.unit} ·
                      unbilled {formatNumber(unbilled, 2)}
                    </span>
                  </label>

                  {draft.include ? (
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Field
                        label={`Billed qty (${line.unit})`}
                        hint={
                          qtyOff
                            ? `GRN accepted ${formatNumber(line.accepted_qty, 2)}`
                            : "Matches the GRN"
                        }
                      >
                        <Input
                          type="number"
                          step="any"
                          value={draft.billed_qty}
                          onChange={(e) =>
                            patch(line.id, { billed_qty: e.target.value })
                          }
                          aria-invalid={qtyOff || undefined}
                        />
                      </Field>
                      <Field
                        label="Billed rate"
                        hint={
                          rateOff
                            ? `PO rate is ${formatInr(line.rate)}`
                            : "Matches the PO"
                        }
                      >
                        <Input
                          type="number"
                          step="any"
                          value={draft.billed_rate}
                          onChange={(e) =>
                            patch(line.id, { billed_rate: e.target.value })
                          }
                          aria-invalid={rateOff || undefined}
                        />
                      </Field>
                      <Field
                        label="Billed GST %"
                        hint={
                          taxOff
                            ? `PO GST is ${line.gst_percent}%`
                            : "Matches the PO"
                        }
                      >
                        <Input
                          type="number"
                          step="any"
                          value={draft.billed_gst_percent}
                          onChange={(e) =>
                            patch(line.id, {
                              billed_gst_percent: e.target.value,
                            })
                          }
                          aria-invalid={taxOff || undefined}
                        />
                      </Field>
                    </div>
                  ) : null}
                </Card>
              );
            })}

            {included.length > 0 ? (
              <Field label="Remarks">
                <Input
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                />
              </Field>
            ) : null}
          </div>
        </AppDialogBody>

        <AppDialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={pending || included.length === 0 || !billNumber}
          >
            {pending ? "Matching…" : "Save and match"}
          </Button>
        </AppDialogFooter>
      </AppDialog>
    </>
  );
}
