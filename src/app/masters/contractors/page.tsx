"use client";

import {
  PageHeader,
  DataTable,
  HydrationGate,
  type Column,
} from "@/components/common";
import { useAccess, useAllRows } from "@/lib/hooks";
import { formatPercent } from "@/lib/format";
import { ContractorDialog } from "@/components/billing/contractor-dialog";
import { TDS_PERCENT, type Contractor } from "@/lib/domain";
import { contractorTypeLabel, tradeLabel } from "@/config/labels";

export default function ContractorsPage() {
  const access = useAccess("contractors");
  const rows = useAllRows("contractors") as Contractor[];
  const workOrders = useAllRows("work_orders");
  const raBills = useAllRows("ra_bills");

  const columns: Array<Column<Contractor>> = [
    {
      key: "code",
      header: "Code",
      cell: (r) => <span className="font-mono text-xs">{r.code}</span>,
    },
    { key: "name", header: "Contractor", primary: true, cell: (r) => r.name },
    {
      key: "trade",
      header: "Trade",
      secondary: true,
      cell: (r) => tradeLabel(r.trade),
    },
    {
      key: "type",
      header: "Constitution",
      cell: (r) => contractorTypeLabel(r.type),
    },
    {
      key: "tds",
      header: "TDS",
      align: "right",
      cell: (r) => formatPercent(TDS_PERCENT[r.type]),
    },
    {
      key: "pan",
      header: "PAN",
      cell: (r) => <span className="font-mono text-xs">{r.pan}</span>,
    },
    {
      key: "gstin",
      header: "GSTIN",
      cell: (r) =>
        r.gstin ? (
          <span className="font-mono text-xs">{r.gstin}</span>
        ) : (
          <span className="text-xs text-muted-foreground">Unregistered</span>
        ),
    },
    { key: "contact", header: "Contact", cell: (r) => r.contact_person },
    {
      key: "phone",
      header: "Phone",
      cell: (r) => <span className="whitespace-nowrap">{r.phone}</span>,
    },
    {
      key: "retention",
      header: "Retention",
      align: "right",
      cell: (r) => formatPercent(r.default_retention_percent),
    },
    {
      key: "wos",
      header: "Work orders",
      align: "right",
      cell: (r) => workOrders.filter((w) => w.contractor_id === r.id).length,
    },
    {
      key: "bills",
      header: "RA bills",
      align: "right",
      cell: (r) => raBills.filter((b) => b.contractor_id === r.id).length,
    },
    {
      key: "edit",
      header: "",
      cell: (r) =>
        access.canEdit ? <ContractorDialog contractor={r} /> : null,
    },
  ];

  return (
    <div>
      <PageHeader
        title={access.meta.label}
        description="Scope, rates and retention. The constitution here sets the TDS rate on every RA bill."
        team={access.ownerTeam}
        outsideNav={access.outsideNav}
        owned={access.owned}
        actions={access.canCreate ? <ContractorDialog /> : null}
      />
      <HydrationGate>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          showValues={access.showValues}
          emptyMessage="No contractors on the master."
          caption={`${rows.length} contractors · ${rows.filter((r) => TDS_PERCENT[r.type] === 1).length} at 1% TDS, ${rows.filter((r) => TDS_PERCENT[r.type] === 2).length} at 2%.`}
        />
      </HydrationGate>
    </div>
  );
}
