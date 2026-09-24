"use client";

import { Printer, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { RecordTrail, StatusPill } from "@/components/common";
import {
  useActor,
  useAllRows,
  useLookups,
  useProjectRows,
  useServiceAction,
} from "@/lib/hooks";
import { markPoSent } from "@/lib/services/purchase-service";
import { formatDate, formatInr, formatNumber } from "@/lib/format";
import type { PoLine, Project, PurchaseOrder, Supplier } from "@/lib/domain";
import {
  AppDialog,
  AppDialogBody,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from "@/components/ui-app";

/**
 * B3–B4 — the purchase order as a document.
 *
 * `print:` utilities strip the sheet chrome so Ctrl-P produces a clean single
 * page; see the @media print block in globals.css for the rest.
 */
export function PoDocumentSheet({
  po,
  open,
  onOpenChange,
  projectId,
  canSend,
  showValues,
}: {
  po: PurchaseOrder | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  canSend: boolean;
  showValues: boolean;
}) {
  const allLines = useProjectRows("po_lines", projectId) as PoLine[];
  const allPos = useProjectRows(
    "purchase_orders",
    projectId,
  ) as PurchaseOrder[];
  const projects = useAllRows("projects") as Project[];
  const suppliers = useAllRows("suppliers") as Supplier[];
  const lookup = useLookups();
  const actor = useActor();
  const { run, pending } = useServiceAction();

  // The live row, so marking the PO sent updates this sheet immediately.
  const live = po ? (allPos.find((p) => p.id === po.id) ?? po) : null;
  if (!live) return null;

  const lines = allLines.filter((l) => l.purchase_order_id === live.id);
  const project = projects.find((p) => p.id === live.project_id);
  const supplier = suppliers.find((s) => s.id === live.supplier_id);

  const { id: liveId, po_number } = live;
  async function send() {
    await run(() => markPoSent(liveId, actor), {
      success: `${po_number} marked sent to the vendor`,
      onDone: () => onOpenChange(false),
    });
  }

  return (
    <AppDialog open={open} onOpenChange={onOpenChange} size="xl">
      <AppDialogHeader className="print:hidden">
        <AppDialogTitle className="flex items-center gap-3 font-mono">
          {live.po_number}
          <StatusPill status={live.status} />
        </AppDialogTitle>
        <AppDialogDescription>
          Raised by {lookup.user(live.raised_by_user_id)} on{" "}
          {formatDate(live.po_date)}
        </AppDialogDescription>
      </AppDialogHeader>

      <AppDialogBody>
        <RecordTrail
          entityType="purchase_order"
          entityId={live.id}
          className="mb-4 print:hidden"
        />

        <article
          id="po-print-area"
          data-print-area
          className="space-y-6 rounded-xl bg-card p-6 ring-1 ring-border print:ring-0"
        >
          <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
            <div>
              <p className="text-lg font-semibold tracking-tight">
                Manas Developers LLP
              </p>
              <p className="text-xs text-muted-foreground">
                {project?.name} · {project?.location}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs tracking-wide text-muted-foreground uppercase">
                Purchase Order
              </p>
              <p className="font-mono text-sm font-semibold">
                {live.po_number}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatDate(live.po_date)}
              </p>
            </div>
          </header>

          <div className="grid gap-6 sm:grid-cols-2">
            <section>
              <h3 className="mb-1.5 text-xs tracking-wide text-muted-foreground uppercase">
                Supplier
              </h3>
              <p className="text-sm font-medium">{supplier?.name}</p>
              <p className="text-xs text-muted-foreground">
                {supplier?.address}
              </p>
              <p className="text-xs text-muted-foreground">
                {supplier?.city}, {supplier?.state}
              </p>
              <p className="mt-1 font-mono text-xs">GSTIN {supplier?.gstin}</p>
              <p className="text-xs text-muted-foreground">
                {supplier?.contact_person} · {supplier?.phone}
              </p>
            </section>

            <section>
              <h3 className="mb-1.5 text-xs tracking-wide text-muted-foreground uppercase">
                Deliver to
              </h3>
              <p className="text-sm">{live.delivery_address}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                Expected by {formatDate(live.expected_delivery_date)}
              </p>
            </section>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-border text-xs text-muted-foreground">
                  <th className="py-2 pr-3 text-left font-medium">#</th>
                  <th className="py-2 pr-3 text-left font-medium">Material</th>
                  <th className="py-2 pr-3 text-left font-medium">HSN</th>
                  <th className="py-2 pr-3 text-right font-medium">Qty</th>
                  <th className="py-2 pr-3 text-left font-medium">Unit</th>
                  {showValues ? (
                    <>
                      <th className="py-2 pr-3 text-right font-medium">Rate</th>
                      <th className="py-2 pr-3 text-right font-medium">
                        Freight
                      </th>
                      <th className="py-2 pr-3 text-right font-medium">GST</th>
                      <th className="py-2 text-right font-medium">Amount</th>
                    </>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {lines.map((line, i) => (
                  <tr key={line.id} className="border-b border-border/50">
                    <td className="py-2 pr-3 text-muted-foreground">{i + 1}</td>
                    <td className="py-2 pr-3">
                      {lookup.material(line.material_id)}
                      <span className="block text-[11px] text-muted-foreground">
                        {lookup.boqItem(line.boq_line_id)}
                      </span>
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs">
                      {lookup.materialHsn(line.material_id)}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {formatNumber(line.ordered_qty, 2)}
                    </td>
                    <td className="py-2 pr-3">{line.unit}</td>
                    {showValues ? (
                      <>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {formatInr(line.rate)}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {formatInr(line.freight_amount)}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {line.gst_percent}%
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {formatInr(line.line_total)}
                        </td>
                      </>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {showValues ? (
            <div className="ml-auto w-full max-w-xs space-y-1.5 text-sm">
              <Total label="Basic" value={live.basic_amount} />
              <Total label="Freight" value={live.freight_amount} />
              {live.is_interstate ? (
                <Total label="IGST" value={live.igst_amount} />
              ) : (
                <>
                  <Total label="CGST" value={live.cgst_amount} />
                  <Total label="SGST" value={live.sgst_amount} />
                </>
              )}
              <div className="flex items-center justify-between border-t border-border pt-1.5 font-semibold">
                <span>Total</span>
                <span className="tabular-nums">
                  {formatInr(live.total_amount)}
                </span>
              </div>
              <p className="pt-1 text-right text-[11px] text-muted-foreground">
                {live.is_interstate
                  ? `Inter-state supply from ${supplier?.state} — IGST applies.`
                  : "Intra-state supply within Goa — CGST and SGST apply."}
              </p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Rates and values are not shown on this document for your role.
            </p>
          )}

          <section className="border-t border-border pt-4">
            <h3 className="mb-1.5 text-xs tracking-wide text-muted-foreground uppercase">
              Terms
            </h3>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {live.terms}
            </p>
          </section>
        </article>
      </AppDialogBody>

      <AppDialogFooter className="print:hidden">
        <Button variant="outline" onClick={() => window.print()}>
          <Printer className="size-3.5" /> Print
        </Button>
        {canSend && live.status === "draft" ? (
          <Button onClick={send} disabled={pending}>
            <Send className="size-3.5" />{" "}
            {pending ? "Sending…" : "Mark sent to vendor"}
          </Button>
        ) : null}
      </AppDialogFooter>
    </AppDialog>
  );
}

function Total({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between text-muted-foreground">
      <span>{label}</span>
      <span className="tabular-nums text-foreground">{formatInr(value)}</span>
    </div>
  );
}
