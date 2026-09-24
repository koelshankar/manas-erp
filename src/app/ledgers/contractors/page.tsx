"use client";

import { useState } from "react";
import {
  PageHeader,
  PrintButton,
  DataTable,
  HydrationGate,
  SectionHeading,
  RecordLink,
  type Column,
} from "@/components/common";
import {
  useAccess,
  useAllRows,
  useLookups,
  useRepositoryQuery,
} from "@/lib/hooks";
import {
  contractorRunningAccount,
  type ContractorAccountRow,
} from "@/lib/services/billing-service";
import { formatInr, formatPercent } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TDS_PERCENT, type Contractor } from "@/lib/domain";
import { cn } from "cn";
import { contractorTypeLabel } from "@/config/labels";

/**
 * The contractor running account, per work order.
 *
 * Only a bill that has cleared the C3–C4 chain counts. Payments are Accounts'
 * business and deliberately out of scope here.
 */
export default function ContractorLedgerPage() {
  const access = useAccess("contractor_ledger");
  const contractors = useAllRows("contractors") as Contractor[];
  const lookup = useLookups();
  const [openContractor, setOpenContractor] = useState<string | null>(null);

  const { data } = useRepositoryQuery<ContractorAccountRow[]>(
    () => contractorRunningAccount(),
    [],
  );
  const rows = data ?? [];

  /** One row per contractor, summing their work orders. */
  const byContractor = contractors
    .map((c) => {
      const mine = rows.filter((r) => r.contractor_id === c.id);
      const sum = (pick: (r: ContractorAccountRow) => number) =>
        Math.round(mine.reduce((s, r) => s + pick(r), 0) * 100) / 100;
      return {
        contractor: c,
        work_orders: mine.length,
        order_value: sum((r) => r.order_value),
        certified_amount: sum((r) => r.certified_amount),
        retention_held: sum((r) => r.retention_held),
        tds_deducted: sum((r) => r.tds_deducted),
        advances_recovered: sum((r) => r.advances_recovered),
        net_payable: sum((r) => r.net_payable),
        balance_to_bill: sum((r) => r.balance_to_bill),
        bills_in_chain: mine.reduce((s, r) => s + r.bills_in_chain, 0),
      };
    })
    .filter((r) => r.work_orders > 0);

  type Row = (typeof byContractor)[number];

  const columns: Array<Column<Row>> = [
    {
      key: "contractor",
      header: "Contractor",
      primary: true,
      cell: (r) => (
        <button
          onClick={() =>
            setOpenContractor(
              r.contractor.id === openContractor ? null : r.contractor.id,
            )
          }
          className="underline decoration-border underline-offset-4 hover:decoration-foreground"
        >
          {r.contractor.name}
        </button>
      ),
    },
    {
      key: "type",
      header: "Constitution",
      secondary: true,
      cell: (r) => (
        <span className="text-xs">
          {contractorTypeLabel(r.contractor.type)}
          <span className="ml-1 text-muted-foreground">
            TDS {formatPercent(TDS_PERCENT[r.contractor.type])}
          </span>
        </span>
      ),
    },
    {
      key: "wos",
      header: "Work orders",
      align: "right",
      cell: (r) => r.work_orders,
    },
    {
      key: "order",
      header: "Order value",
      align: "right",
      money: true,
      cell: (r) => formatInr(r.order_value),
    },
    {
      key: "certified",
      header: "Certified to date",
      align: "right",
      money: true,
      cell: (r) => formatInr(r.certified_amount),
    },
    {
      key: "retention",
      header: "Retention held",
      align: "right",
      money: true,
      cell: (r) => formatInr(r.retention_held),
    },
    {
      key: "tds",
      header: "TDS deducted",
      align: "right",
      money: true,
      cell: (r) => formatInr(r.tds_deducted),
    },
    {
      key: "advances",
      header: "Advances recovered",
      align: "right",
      money: true,
      cell: (r) => formatInr(r.advances_recovered),
    },
    {
      key: "balance",
      header: "Balance to bill",
      align: "right",
      money: true,
      cell: (r) => (
        <span className={cn(r.balance_to_bill < 0 && "text-destructive")}>
          {formatInr(r.balance_to_bill)}
        </span>
      ),
    },
    {
      key: "chain",
      header: "In chain",
      align: "right",
      cell: (r) =>
        r.bills_in_chain > 0 ? (
          <span className="text-warning">{r.bills_in_chain}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "open",
      header: "",
      cell: (r) => (
        <Button
          variant="ghost"
          size="xs"
          onClick={() =>
            setOpenContractor(
              r.contractor.id === openContractor ? null : r.contractor.id,
            )
          }
        >
          {r.contractor.id === openContractor ? "Hide" : "Work orders"}
        </Button>
      ),
    },
  ];

  const detailColumns: Array<Column<ContractorAccountRow>> = [
    {
      key: "wo",
      header: "Work order",
      primary: true,
      cell: (r) => (
        <RecordLink
          href={`/projects/${r.project_id}/budget/work-orders`}
          label={r.wo_number}
        />
      ),
    },
    {
      key: "project",
      header: "Project",
      secondary: true,
      cell: (r) => lookup.project(r.project_id),
    },
    {
      key: "order",
      header: "Order value",
      align: "right",
      money: true,
      cell: (r) => formatInr(r.order_value),
    },
    {
      key: "certified",
      header: "Certified",
      align: "right",
      money: true,
      cell: (r) => formatInr(r.certified_amount),
    },
    {
      key: "retention",
      header: "Retention",
      align: "right",
      money: true,
      cell: (r) => formatInr(r.retention_held),
    },
    {
      key: "tds",
      header: "TDS",
      align: "right",
      money: true,
      cell: (r) => formatInr(r.tds_deducted),
    },
    {
      key: "advances",
      header: "Advances",
      align: "right",
      money: true,
      cell: (r) => formatInr(r.advances_recovered),
    },
    {
      key: "net",
      header: "Net payable",
      align: "right",
      money: true,
      cell: (r) => formatInr(r.net_payable),
    },
    {
      key: "balance",
      header: "Balance to bill",
      align: "right",
      money: true,
      cell: (r) => formatInr(r.balance_to_bill),
    },
  ];

  const detail = rows.filter((r) => r.contractor_id === openContractor);

  return (
    <div>
      <PageHeader
        title={access.meta.label}
        description="Order value against what has been certified, with retention, TDS and advances held back. Payment itself is Accounts' business."
        team={access.ownerTeam}
        outsideNav={access.outsideNav}
        owned={access.owned}
        actions={<PrintButton label="Print statement" />}
      />
      <HydrationGate>
        {/* The statement is what gets signed and filed; the nav is not. */}
        <div className="space-y-8" data-print-area>
          <DataTable
            columns={columns}
            rows={byContractor}
            rowKey={(r) => r.contractor.id}
            showValues={access.showValues}
            emptyMessage="No contractor billing activity yet."
            caption={
              access.showValues
                ? `Retention held across all contractors: ${formatInr(byContractor.reduce((s, r) => s + r.retention_held, 0))}.`
                : "Values are hidden for your role."
            }
          />

          {openContractor && detail.length > 0 ? (
            <section>
              <SectionHeading
                title={lookup.contractor(openContractor)}
                description={`${detail.length} work order${detail.length > 1 ? "s" : ""}.`}
              />
              <DataTable
                columns={detailColumns}
                rows={detail}
                rowKey={(r) => r.work_order_id}
                showValues={access.showValues}
                emptyMessage="No work orders."
              />
            </section>
          ) : null}

          <Card className="px-5 py-4">
            <p className="text-xs leading-relaxed text-muted-foreground">
              Only bills that have cleared the C3–C4 chain — certified or handed
              over — count towards these figures. A bill still inside the chain
              is shown separately so it is clear what is committed but not yet
              certified.
            </p>
          </Card>
        </div>
      </HydrationGate>
    </div>
  );
}
