"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import {
  PageHeader,
  DataTable,
  HydrationGate,
  SectionHeading,
  type Column,
} from "@/components/common";
import { useAccess, useAllRows, useLookups } from "@/lib/hooks";
import {
  formatDate,
  formatDateTime,
  formatInr,
  formatPercent,
} from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { RaBill, VendorBill } from "@/lib/domain";
import { cn } from "cn";

type Tab = "vendor" | "contractor";

/**
 * B8 and C5. Accounts is out of scope for this ERP — this page is the
 * read-only boundary. No role, not even the HoD, gets an edit grant here.
 */
export default function AccountsHandoverPage() {
  const access = useAccess("accounts_handover");
  const raBills = (useAllRows("ra_bills") as RaBill[]).filter(
    (b) => b.status === "handed_over",
  );
  const vendorBills = (useAllRows("vendor_bills") as VendorBill[]).filter(
    (b) => b.status === "handed_over",
  );
  const lookup = useLookups();
  const [tab, setTab] = useState<Tab>("vendor");

  const vendorColumns: Array<Column<VendorBill>> = [
    {
      key: "no",
      header: "Invoice",
      primary: true,
      cell: (r) => <span className="font-mono text-xs">{r.bill_number}</span>,
    },
    {
      key: "ref",
      header: "Our ref",
      cell: (r) => (
        <span className="font-mono text-xs">{r.reference_number}</span>
      ),
    },
    {
      key: "project",
      header: "Project",
      secondary: true,
      cell: (r) => lookup.project(r.project_id),
    },
    {
      key: "supplier",
      header: "Supplier",
      cell: (r) => lookup.supplier(r.supplier_id),
    },
    {
      key: "po",
      header: "POs",
      cell: (r) =>
        r.purchase_order_ids.map((id) => lookup.poNumber(id)).join(", "),
    },
    {
      key: "grn",
      header: "GRNs",
      cell: (r) => r.grn_ids.map((id) => lookup.grnNumber(id)).join(", "),
    },
    {
      key: "amount",
      header: "Bill amount",
      align: "right",
      money: true,
      cell: (r) => formatInr(r.bill_total_amount),
    },
    {
      key: "verified",
      header: "Verified by",
      cell: (r) => lookup.user(r.verified_by_user_id),
    },
    {
      key: "handed",
      header: "Handed over",
      cell: (r) => formatDateTime(r.handed_over_at),
    },
  ];

  const raColumns: Array<Column<RaBill>> = [
    {
      key: "no",
      header: "Bill",
      primary: true,
      cell: (r) => <span className="font-mono text-xs">{r.bill_number}</span>,
    },
    {
      key: "project",
      header: "Project",
      secondary: true,
      cell: (r) => lookup.project(r.project_id),
    },
    {
      key: "contractor",
      header: "Contractor",
      cell: (r) => lookup.contractor(r.contractor_id),
    },
    {
      key: "wo",
      header: "Work order",
      cell: (r) => lookup.workOrder(r.work_order_id),
    },
    { key: "date", header: "Bill date", cell: (r) => formatDate(r.bill_date) },
    {
      key: "gross",
      header: "Gross",
      align: "right",
      money: true,
      cell: (r) => formatInr(r.gross_amount),
    },
    {
      key: "retention",
      header: "Retention",
      align: "right",
      money: true,
      cell: (r) => (
        <span>
          {formatInr(r.retention_amount)}
          <span className="block text-[10px] text-muted-foreground">
            {formatPercent(r.retention_percent)}
          </span>
        </span>
      ),
    },
    {
      key: "tds",
      header: "TDS",
      align: "right",
      money: true,
      cell: (r) => (
        <span>
          {formatInr(r.tds_amount)}
          <span className="block text-[10px] text-muted-foreground">
            {formatPercent(r.tds_percent)}
          </span>
        </span>
      ),
    },
    {
      key: "deductions",
      header: "Total deductions",
      align: "right",
      money: true,
      cell: (r) => formatInr(r.total_deductions),
    },
    {
      key: "net",
      header: "Net payable",
      align: "right",
      money: true,
      cell: (r) => formatInr(r.net_payable_amount),
    },
    {
      key: "handed",
      header: "Handed over",
      cell: (r) => formatDateTime(r.handed_over_at),
    },
  ];

  const tabs: Array<{ key: Tab; label: string; count: number; total: number }> =
    [
      {
        key: "vendor",
        label: "Vendor bills — B8",
        count: vendorBills.length,
        total: vendorBills.reduce((s, b) => s + b.bill_total_amount, 0),
      },
      {
        key: "contractor",
        label: "Contractor bills — C5",
        count: raBills.length,
        total: raBills.reduce((s, b) => s + b.net_payable_amount, 0),
      },
    ];

  return (
    <div>
      <PageHeader
        title={access.meta.label}
        description="Verified vendor bills (B8) and certified contractor bills (C5) released to Accounts for payment."
        team={access.ownerTeam}
        outsideNav={access.outsideNav}
        stepCodes={access.meta.step_codes}
        owned={access.owned}
      />
      <HydrationGate>
        <div className="space-y-6">
          <Card className="flex flex-row items-start gap-3 border-l-[3px] border-team-accounts bg-muted/40 px-5 py-4">
            <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <p className="text-sm leading-relaxed text-muted-foreground">
              Accounts is outside the scope of this ERP. This outbox is
              read-only for every role — nothing on this page can be edited,
              approved or withdrawn here.
            </p>
          </Card>

          <div className="flex flex-wrap gap-1 border-b border-border">
            {tabs.map((t) => (
              <Button
                key={t.key}
                variant="ghost"
                onClick={() => setTab(t.key)}
                className={cn(
                  "rounded-none rounded-t-lg border-b-2 px-4",
                  tab === t.key
                    ? "border-team-accounts text-foreground"
                    : "border-transparent text-muted-foreground",
                )}
              >
                {t.label}
                <span className="ml-2 rounded-full bg-muted px-1.5 py-0.5 text-[11px]">
                  {t.count}
                </span>
              </Button>
            ))}
          </div>

          {tab === "vendor" ? (
            <section>
              <SectionHeading
                title="Vendor bills"
                description="Cleared by the three-way match against the PO and the GRN."
              />
              <DataTable
                columns={vendorColumns}
                rows={vendorBills}
                rowKey={(r) => r.id}
                showValues={access.showValues}
                emptyMessage="No vendor bills handed over yet."
                caption={
                  access.showValues
                    ? `${vendorBills.length} invoices worth ${formatInr(tabs[0].total)}.`
                    : `${vendorBills.length} invoices.`
                }
              />
            </section>
          ) : (
            <section>
              <SectionHeading
                title="Contractor bills"
                description="Certified through the C3–C4 chain, with retention and TDS already deducted."
              />
              <DataTable
                columns={raColumns}
                rows={raBills}
                rowKey={(r) => r.id}
                showValues={access.showValues}
                emptyMessage="No contractor bills handed over yet."
                caption={
                  access.showValues
                    ? `${raBills.length} bills, ${formatInr(tabs[1].total)} net payable.`
                    : `${raBills.length} bills.`
                }
              />
            </section>
          )}
        </div>
      </HydrationGate>
    </div>
  );
}
