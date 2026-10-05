"use client";

import { Fragment } from "react";
import {
  ISSUING_COMPANY,
  PO_BALANCE_SCHEDULE_NOTE,
  PO_SIGNATURE_LABELS,
  PO_STANDING_LINE,
} from "@/config/po-document";
import { PO_SIGNATURE_BLOCKS } from "@/lib/domain";
import type {
  Indent,
  PoDeliverySchedule,
  PoDeliveryScheduleLine,
  PoLine,
  PoTerm,
  Project,
  PurchaseOrder,
  Supplier,
} from "@/lib/domain";
import { poLineCharges } from "@/lib/services/po-math";
import { formatDate, formatInr, formatNumber, rupeesInWords } from "@/lib/format";
import { cn } from "cn";

/**
 * The purchase order as the document Manas sends a supplier, on A4.
 *
 * Transcribed from the three orders they gave us as the format: the title band,
 * the issuing company, the Indent Details table (one of theirs consolidates
 * thirteen), the supplier and delivery blocks, the standing line, the Material
 * Details grid with its tax columns, the Additional Charges block with the grand
 * total in words, each Delivery Schedule in its own table, the numbered clause
 * list and the four signature blocks.
 *
 * Marked `data-print-area`, so `<PrintButton>` prints this and nothing else.
 * `.print-page` is what puts the clauses and the acceptance block on their own
 * sheets rather than orphaning two clauses onto page three.
 *
 * `showValues` is the value-blind path: a role denied the `rates` data class gets
 * the same document with every money column absent — not zeroed, absent.
 */
export function PoDocument({
  po,
  lines,
  schedules,
  scheduleLines,
  terms,
  project,
  supplier,
  indents,
  preparedBy,
  recommendedBy,
  authorisedBy,
  showValues,
  materialLabel,
  materialSpec,
}: {
  po: PurchaseOrder;
  lines: PoLine[];
  schedules: PoDeliverySchedule[];
  scheduleLines: PoDeliveryScheduleLine[];
  terms: PoTerm[];
  project?: Project;
  supplier?: Supplier;
  /** Every indent this order draws on, in the order they print. */
  indents: Indent[];
  preparedBy: string;
  recommendedBy: string | null;
  authorisedBy: string | null;
  showValues: boolean;
  materialLabel: (id: string) => string;
  materialSpec: (id: string) => string;
}) {
  const state = supplier?.state ?? "Goa";
  /* Brand is blank on most materials, so the column only appears when it says
     something. A column of dashes on a legal document is noise. */
  const withBrand = lines.some((l) => l.brand.trim().length > 0);
  const charges = lines.map((l) => poLineCharges(l, state));
  const materialValue = charges.reduce((s, c) => s + c.basic_amount, 0);
  const materialTax = charges.reduce(
    (s, c) => s + c.cgst_amount + c.sgst_amount + c.igst_amount,
    0,
  );
  const freight = po.freight_amount + po.transportation_charge;
  const freightTax = Math.max(
    0,
    po.cgst_amount + po.sgst_amount + po.igst_amount - materialTax,
  );
  /* Money columns: 5 when CGST+SGST, 4 when IGST, 0 when the role is blind. */
  const moneyCols = showValues ? (po.is_interstate ? 4 : 5) : 0;
  const gridCols = 4 + (withBrand ? 1 : 0) + moneyCols;

  return (
    <article
      data-print-area
      className="space-y-6 rounded-xl bg-card p-6 text-sm ring-1 ring-border print:ring-0"
    >
      {/* --- title band ------------------------------------------------ */}
      <header className="space-y-4">
        <div className="border-y-2 border-foreground py-2 text-center">
          <h2 className="text-base font-bold tracking-[0.2em] uppercase">Purchase Order</h2>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0">
            <p className="text-base font-semibold tracking-tight">{ISSUING_COMPANY.name}</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {ISSUING_COMPANY.address}
              <br />
              Tel {ISSUING_COMPANY.phone} · {ISSUING_COMPANY.website}
              <br />
              GST No. <span className="font-mono">{ISSUING_COMPANY.gstin}</span>
            </p>
          </div>
          <dl className="shrink-0 space-y-0.5 text-xs">
            <HeadField label="PO No." value={<span className="font-mono">{po.po_number}</span>} />
            <HeadField label="PO Date" value={formatDate(po.po_date)} />
            <HeadField
              label="PO Amend No."
              value={po.amend_no > 0 ? <span className="num">{po.amend_no}</span> : "—"}
            />
          </dl>
        </div>
      </header>

      {/* --- indent details -------------------------------------------- */}
      <section>
        <Caption>Indent Details</Caption>
        {indents.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            This order is raised directly, against no indent.
          </p>
        ) : (
          <table className="w-full border border-border text-xs">
            <thead>
              <tr className="bg-muted/60 text-muted-foreground">
                <Th className="w-14">Sl No</Th>
                <Th>Indent No</Th>
                <Th className="w-32">Indent Date</Th>
              </tr>
            </thead>
            <tbody>
              {indents.map((indent, i) => (
                <tr key={indent.id} className="border-t border-border">
                  <Td className="text-muted-foreground">{i + 1}</Td>
                  <Td className="font-mono">{indent.indent_number}</Td>
                  <Td>{formatDate(indent.raised_date)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* --- supplier and delivery ------------------------------------- */}
      <div className="grid gap-5 sm:grid-cols-2">
        <section>
          <Caption>Supplier Name &amp; Address</Caption>
          <p className="font-medium">{supplier?.name}</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {supplier?.address}
            <br />
            {supplier?.city}, {supplier?.state}
            <br />
            PAN No. <span className="font-mono">{supplier?.pan || "—"}</span>
            <br />
            GST No. <span className="font-mono">{supplier?.gstin || "—"}</span>
            <br />
            {supplier?.contact_person} · {supplier?.phone}
            <br />
            {supplier?.email}
          </p>
        </section>

        <section>
          <Caption>Delivery Address</Caption>
          <p className="font-medium">{project?.name}</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {po.delivery_address}
            <br />
            {po.delivery_contact_name || po.delivery_contact_phone ? (
              <>
                Site contact: {po.delivery_contact_name || "—"}
                {po.delivery_contact_phone ? ` · ${po.delivery_contact_phone}` : ""}
                <br />
              </>
            ) : null}
            Expected by {formatDate(po.expected_delivery_date)}
          </p>
        </section>
      </div>

      <p className="text-xs leading-relaxed">{PO_STANDING_LINE}</p>

      {/* --- material details ------------------------------------------ */}
      <section>
        <Caption>Material Details</Caption>
        <div className="overflow-x-auto">
          <table className="w-full border border-border text-xs">
            <thead>
              <tr className="bg-muted/60 text-muted-foreground">
                <Th className="w-12">Sl No</Th>
                <Th className="min-w-[13rem]">Material</Th>
                {withBrand ? <Th className="w-24">Brand</Th> : null}
                <Th className="w-16">UOM</Th>
                <Th className="w-24" align="right">
                  Quantity
                </Th>
                {showValues ? (
                  <>
                    <Th className="w-24" align="right">
                      Rate
                    </Th>
                    {po.is_interstate ? (
                      <Th className="w-24" align="right">
                        IGST
                      </Th>
                    ) : (
                      <>
                        <Th className="w-24" align="right">
                          CGST
                        </Th>
                        <Th className="w-24" align="right">
                          SGST
                        </Th>
                      </>
                    )}
                    <Th className="w-28" align="right">
                      Net Amount
                    </Th>
                  </>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {lines.map((line, i) => {
                const c = charges[i];
                const spec = line.specification || materialSpec(line.material_id);
                return (
                  <tr key={line.id} className="border-t border-border align-top">
                    <Td className="text-muted-foreground">{i + 1}</Td>
                    <Td>
                      <span className="block font-medium">{materialLabel(line.material_id)}</span>
                      {spec ? (
                        <span className="mt-0.5 block leading-relaxed break-words text-muted-foreground">
                          {spec}
                        </span>
                      ) : null}
                    </Td>
                    {withBrand ? <Td>{line.brand || "—"}</Td> : null}
                    <Td>{line.unit}</Td>
                    <Td align="right" className="num">
                      {formatNumber(line.ordered_qty, 2)}
                    </Td>
                    {showValues ? (
                      <>
                        <Td align="right" className="num">
                          {formatInr(line.rate)}
                        </Td>
                        {po.is_interstate ? (
                          <Td align="right" className="num">
                            {formatInr(c.igst_amount)}
                          </Td>
                        ) : (
                          <>
                            <Td align="right" className="num">
                              {formatInr(c.cgst_amount)}
                            </Td>
                            <Td align="right" className="num">
                              {formatInr(c.sgst_amount)}
                            </Td>
                          </>
                        )}
                        <Td align="right" className="num font-medium">
                          {formatInr(c.net_amount)}
                        </Td>
                      </>
                    ) : null}
                  </tr>
                );
              })}
              {showValues ? (
                <tr className="border-t-2 border-foreground bg-muted/40">
                  <Td colSpan={gridCols - 1} align="right" className="font-semibold">
                    Taxable Total
                  </Td>
                  <Td align="right" className="num font-semibold">
                    {formatInr(materialValue)}
                  </Td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {showValues ? null : (
          <p className="mt-2 text-xs text-muted-foreground">
            Rates and values are not shown on this document for your role.
          </p>
        )}
      </section>

      {/* --- additional charges ---------------------------------------- */}
      {showValues ? (
        <section>
          <Caption>Additional Charges</Caption>
          <table className="w-full max-w-md border border-border text-xs">
            <tbody>
              <ChargeRow label="Material Value" value={materialValue} />
              <ChargeRow label="Transportation Charge" value={freight} />
              {po.is_interstate ? (
                <ChargeRow label="IGST on freight" value={freightTax} />
              ) : (
                <>
                  <ChargeRow label="CGST on freight" value={freightTax / 2} />
                  <ChargeRow label="SGST on freight" value={freightTax - freightTax / 2} />
                </>
              )}
              {po.is_interstate ? (
                <ChargeRow label="IGST" value={po.igst_amount} />
              ) : (
                <>
                  <ChargeRow label="CGST" value={po.cgst_amount} />
                  <ChargeRow label="SGST" value={po.sgst_amount} />
                </>
              )}
              <tr className="border-t-2 border-foreground bg-muted/40">
                <Td className="font-semibold">Total Cost</Td>
                <Td align="right" className="num font-semibold">
                  {formatInr(po.total_amount)}
                </Td>
              </tr>
            </tbody>
          </table>

          <div className="mt-3 border border-border bg-muted/40 px-3 py-2">
            <p className="flex flex-wrap items-baseline justify-between gap-3">
              <span className="text-xs font-semibold tracking-wide uppercase">Grand Total</span>
              <span className="num text-base font-bold">{formatInr(po.total_amount)}</span>
            </p>
            <p className="mt-1 text-xs leading-relaxed">{rupeesInWords(po.total_amount)}</p>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {po.is_interstate
              ? `Inter-state supply from ${supplier?.state} — IGST applies.`
              : "Intra-state supply within Goa — CGST and SGST apply."}
          </p>
        </section>
      ) : null}

      {/* --- delivery schedules ---------------------------------------- */}
      {schedules.length > 0 ? (
        <section className="space-y-4">
          {schedules.map((schedule, si) => {
            const own = scheduleLines.filter((l) => l.po_delivery_schedule_id === schedule.id);
            return (
              <div key={schedule.id}>
                <Caption>{schedule.title || `Delivery Schedule ${si + 1}`}</Caption>
                <table className="w-full border border-border text-xs">
                  <thead>
                    <tr className="bg-muted/60 text-muted-foreground">
                      <Th>Material</Th>
                      <Th className="w-16">UOM</Th>
                      <Th className="w-24" align="right">
                        Quantity
                      </Th>
                      {schedule.is_balance ? null : <Th className="w-32">Delivery Date</Th>}
                    </tr>
                  </thead>
                  <tbody>
                    {own.map((l) => (
                      <tr key={l.id} className="border-t border-border">
                        <Td>{materialLabel(l.material_id)}</Td>
                        <Td>{l.unit}</Td>
                        <Td align="right" className="num">
                          {formatNumber(l.quantity, 2)}
                        </Td>
                        {schedule.is_balance ? null : <Td>{formatDate(l.delivery_date)}</Td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {schedule.is_balance ? (
                  <p className="mt-1.5 text-xs leading-relaxed">
                    {schedule.note || PO_BALANCE_SCHEDULE_NOTE}
                  </p>
                ) : schedule.note ? (
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    {schedule.note}
                  </p>
                ) : null}
              </div>
            );
          })}
        </section>
      ) : null}

      {/* --- terms ------------------------------------------------------ */}
      {terms.length > 0 ? (
        <section className="print-page">
          <Caption>Terms and Conditions</Caption>
          <ol className="space-y-1.5">
            {terms.map((t) => (
              <li key={t.id} className="flex gap-2 text-xs leading-relaxed">
                <span className="num w-5 shrink-0 text-right text-muted-foreground">
                  {t.sequence}.
                </span>
                <span className="min-w-0">{t.text}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {/* --- order acceptance ------------------------------------------ */}
      <section>
        <Caption>Order Acceptance</Caption>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {PO_SIGNATURE_BLOCKS.map((block) => {
            const name =
              block === "prepared_by"
                ? preparedBy
                : block === "recommended_by"
                  ? recommendedBy
                  : block === "authorised_signatory"
                    ? authorisedBy
                    : null;
            return (
              <div key={block} className="min-w-0">
                <div className="h-14 border-b border-foreground" />
                <p className="mt-1.5 text-xs font-semibold">{PO_SIGNATURE_LABELS[block]}</p>
                <p className="text-xs text-muted-foreground">{name ?? " "}</p>
              </div>
            );
          })}
        </div>
      </section>
    </article>
  );
}

/* ------------------------------------------------------------------ */

function Caption({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
      {children}
    </h3>
  );
}

function HeadField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-6">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function Th({
  children,
  className,
  align = "left",
}: {
  children?: React.ReactNode;
  className?: string;
  align?: "left" | "right";
}) {
  return (
    <th
      className={cn(
        "border-r border-border px-2 py-1.5 font-medium last:border-r-0",
        align === "right" ? "text-right" : "text-left",
        className,
      )}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className,
  align = "left",
  colSpan,
}: {
  children?: React.ReactNode;
  className?: string;
  align?: "left" | "right";
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={cn(
        "border-r border-border px-2 py-1.5 last:border-r-0",
        align === "right" ? "text-right" : "text-left",
        className,
      )}
    >
      {children}
    </td>
  );
}

function ChargeRow({ label, value }: { label: string; value: number }) {
  return (
    <tr className="border-t border-border first:border-t-0">
      <Td className="text-muted-foreground">{label}</Td>
      <Td align="right" className="num">
        {formatInr(value)}
      </Td>
    </tr>
  );
}
