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
  allSupplierBalances,
  supplierLedger,
  type SupplierLedgerSummary,
} from "@/lib/services/ledger-service";
import { formatDate, formatInr } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Supplier } from "@/lib/domain";
import { cn } from "cn";
import { ledgerEntryLabel } from "@/config/labels";

type BalanceRow = {
  supplier_id: string;
  total_credit: number;
  total_debit: number;
  balance: number;
};

/**
 * The supplier account. Verified vendor bills credit the supplier; debit notes
 * raised from returns debit them back.
 */
export default function SupplierLedgerPage() {
  const access = useAccess("supplier_ledger");
  const suppliers = useAllRows("suppliers") as Supplier[];
  const lookup = useLookups();
  const [openSupplier, setOpenSupplier] = useState<string | null>(null);

  const { data: balances } = useRepositoryQuery<BalanceRow[]>(
    () => allSupplierBalances(),
    [],
  );
  const { data: detail } = useRepositoryQuery<SupplierLedgerSummary | null>(
    async () => (openSupplier ? supplierLedger(openSupplier) : null),
    [openSupplier],
  );

  const rows = (balances ?? []).filter((b) =>
    suppliers.some((s) => s.id === b.supplier_id),
  );

  const columns: Array<Column<BalanceRow>> = [
    {
      key: "supplier",
      header: "Supplier",
      primary: true,
      cell: (r) => (
        <button
          onClick={() =>
            setOpenSupplier(
              r.supplier_id === openSupplier ? null : r.supplier_id,
            )
          }
          className="underline decoration-border underline-offset-4 hover:decoration-foreground"
        >
          {lookup.supplier(r.supplier_id)}
        </button>
      ),
    },
    {
      key: "state",
      header: "State",
      secondary: true,
      cell: (r) => lookup.supplierState(r.supplier_id),
    },
    {
      key: "credit",
      header: "Bills (credit)",
      align: "right",
      money: true,
      cell: (r) => formatInr(r.total_credit),
    },
    {
      key: "debit",
      header: "Debit notes",
      align: "right",
      money: true,
      cell: (r) => formatInr(r.total_debit),
    },
    {
      key: "balance",
      header: "Balance payable",
      align: "right",
      money: true,
      cell: (r) => (
        <span className={cn("font-medium", r.balance > 0 && "text-foreground")}>
          {formatInr(r.balance)}
        </span>
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
            setOpenSupplier(
              r.supplier_id === openSupplier ? null : r.supplier_id,
            )
          }
        >
          {r.supplier_id === openSupplier ? "Hide" : "Ledger"}
        </Button>
      ),
    },
  ];

  const detailColumns: Array<
    Column<NonNullable<typeof detail>["rows"][number]>
  > = [
    { key: "date", header: "Date", cell: (r) => formatDate(r.entry_date) },
    {
      key: "ref",
      header: "Reference",
      primary: true,
      cell: (r) =>
        r.reference_type === "vendor_bill" ? (
          <RecordLink href="/accounts-handover" label={r.reference_number} />
        ) : (
          <span className="font-mono text-xs">{r.reference_number}</span>
        ),
    },
    {
      key: "type",
      header: "Type",
      secondary: true,
      cell: (r) => ledgerEntryLabel(r.entry_type),
    },
    { key: "narration", header: "Narration", cell: (r) => r.narration },
    {
      key: "debit",
      header: "Debit",
      align: "right",
      money: true,
      cell: (r) => (r.debit ? formatInr(r.debit) : "—"),
    },
    {
      key: "credit",
      header: "Credit",
      align: "right",
      money: true,
      cell: (r) => (r.credit ? formatInr(r.credit) : "—"),
    },
    {
      key: "balance",
      header: "Balance",
      align: "right",
      money: true,
      cell: (r) => formatInr(r.balance),
    },
  ];

  return (
    <div>
      <PageHeader
        title={access.meta.label}
        description="Running account per supplier: bills credit, debit notes debit, balance is what is still owed."
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
            rows={rows}
            rowKey={(r) => r.supplier_id}
            showValues={access.showValues}
            emptyMessage="No supplier activity yet."
            caption={
              access.showValues
                ? `Total payable ${formatInr(rows.reduce((s, r) => s + r.balance, 0))}.`
                : "Values are hidden for your role."
            }
          />

          {openSupplier && detail ? (
            <section>
              <SectionHeading
                title={lookup.supplier(openSupplier)}
                description={`${detail.rows.length} entries.`}
              />
              {detail.rows.length > 0 ? (
                <DataTable
                  columns={detailColumns}
                  rows={detail.rows}
                  rowKey={(r) => r.id}
                  showValues={access.showValues}
                  emptyMessage="Nothing posted yet."
                />
              ) : (
                <Card className="px-6 py-8 text-center">
                  <p className="text-sm text-muted-foreground">
                    Nothing has been posted to this supplier yet. A bill reaches
                    the ledger when it is verified at B7.
                  </p>
                </Card>
              )}
            </section>
          ) : null}
        </div>
      </HydrationGate>
    </div>
  );
}
