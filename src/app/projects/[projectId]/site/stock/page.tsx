"use client";

import { AlertTriangle } from "lucide-react";
import { DataTable, HydrationGate, PageHeader, Qty, RecordLink, SectionHeading, type Column } from "@/components/common";
import {
  useAccess,
  useAllRows,
  useLookups,
  useProjectId,
  useProjectRows,
} from "@/lib/hooks";
import { formatDate, formatInr } from "@/lib/format";
import { IssueMaterialDialog } from "@/components/material/issue-material-dialog";
import { today } from "@/lib/clock";
import type { Material, MaterialIssue, StockLedgerEntry } from "@/lib/domain";
import { cn } from "cn";
import { movementLabel, recordLabel } from "@/config/labels";

type Balance = {
  material_id: string;
  balance: number;
  received: number;
  issued: number;
  value: number;
  reorder_level: number;
  unit: string;
  low: boolean;
};

/** A5 — site stock, maintained by GRN receipts and issues to work orders. */
export default function SiteStockPage() {
  const projectId = useProjectId();
  const access = useAccess("site_stock");
  const ledger = useProjectRows(
    "stock_ledger_entries",
    projectId,
  ) as StockLedgerEntry[];
  const issues = useProjectRows(
    "material_issues",
    projectId,
  ) as MaterialIssue[];
  const materials = useAllRows("materials") as Material[];
  const lookup = useLookups();

  const byMaterial = new Map<string, Balance>();
  [...ledger]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .forEach((e) => {
      const material = materials.find((m) => m.id === e.material_id);
      const row =
        byMaterial.get(e.material_id) ??
        ({
          material_id: e.material_id,
          balance: 0,
          received: 0,
          issued: 0,
          value: 0,
          reorder_level: material?.reorder_level ?? 0,
          unit: material?.unit ?? "",
          low: false,
        } satisfies Balance);
      row.balance += e.quantity_in - e.quantity_out;
      row.received += e.quantity_in;
      row.issued += e.quantity_out;
      row.value += (e.quantity_in - e.quantity_out) * (e.rate ?? 0);
      row.low = row.balance < row.reorder_level;
      byMaterial.set(e.material_id, row);
    });
  const balances = [...byMaterial.values()].sort(
    (a, b) =>
      Number(b.low) - Number(a.low) ||
      a.material_id.localeCompare(b.material_id),
  );
  const lowCount = balances.filter((b) => b.low).length;

  const balanceColumns: Array<Column<Balance>> = [
    {
      key: "code",
      header: "Code",
      cell: (r) => (
        <span className="font-mono text-xs">
          {lookup.materialCode(r.material_id)}
        </span>
      ),
    },
    {
      key: "material",
      header: "Material",
      primary: true,
      cell: (r) => (
        <span className="flex items-center gap-2">
          {lookup.material(r.material_id)}
          {r.low ? (
            <AlertTriangle className="size-3.5 shrink-0 text-warning" />
          ) : null}
        </span>
      ),
    },
    {
      key: "received",
      header: "Received",
      align: "right",
      cell: (r) => <Qty value={r.received} unit={r.unit} />,
    },
    {
      key: "issued",
      header: "Issued",
      align: "right",
      cell: (r) => <Qty value={r.issued} unit={r.unit} />,
    },
    {
      key: "balance",
      header: "On site",
      align: "right",
      secondary: true,
      cell: (r) => (
        <Qty
          value={r.balance}
          unit={r.unit}
          className={cn("font-medium", r.low && "text-warning")}
        />
      ),
    },
    {
      key: "reorder",
      header: "Reorder level",
      align: "right",
      cell: (r) => <Qty value={r.reorder_level} unit={r.unit} />,
    },
    {
      key: "value",
      header: "Stock value",
      align: "right",
      money: true,
      cell: (r) => formatInr(r.value),
    },
  ];

  const ledgerColumns: Array<Column<StockLedgerEntry>> = [
    { key: "date", header: "Date", cell: (r) => formatDate(r.movement_date) },
    {
      key: "material",
      header: "Material",
      primary: true,
      cell: (r) => lookup.material(r.material_id),
    },
    {
      key: "type",
      header: "Movement",
      secondary: true,
      cell: (r) => movementLabel(r.movement_type),
    },
    {
      key: "in",
      header: "In",
      align: "right",
      cell: (r) => <Qty value={r.quantity_in} unit={lookup.materialUnit(r.material_id)} dashIfZero />,
    },
    {
      key: "out",
      header: "Out",
      align: "right",
      cell: (r) => <Qty value={r.quantity_out} unit={lookup.materialUnit(r.material_id)} dashIfZero />,
    },
    {
      key: "balance",
      header: "Balance",
      align: "right",
      cell: (r) => <Qty value={r.balance_quantity} unit={lookup.materialUnit(r.material_id)} />,
    },
    {
      key: "rate",
      header: "Rate",
      align: "right",
      money: true,
      cell: (r) => formatInr(r.rate),
    },
    {
      key: "value",
      header: "Value",
      align: "right",
      money: true,
      cell: (r) => formatInr(r.value),
    },
    {
      key: "ref",
      header: "Reference",
      cell: (r) => r.remarks || recordLabel(r.source_entity_type),
    },
  ];

  const issueColumns: Array<Column<MaterialIssue>> = [
    {
      key: "no",
      header: "Issue",
      primary: true,
      cell: (r) => <span className="font-mono text-xs">{r.issue_number}</span>,
    },
    {
      key: "material",
      header: "Material",
      secondary: true,
      cell: (r) => lookup.material(r.material_id),
    },
    { key: "date", header: "Date", cell: (r) => formatDate(r.issue_date) },
    {
      key: "qty",
      header: "Quantity",
      align: "right",
      cell: (r) => <Qty value={r.quantity} unit={r.unit} />,
    },
    {
      key: "rate",
      header: "Rate",
      align: "right",
      money: true,
      cell: (r) => formatInr(r.rate),
    },
    {
      key: "value",
      header: "Value",
      align: "right",
      money: true,
      cell: (r) => formatInr(r.value),
    },
    {
      key: "wo",
      header: "To work order",
      cell: (r) => (
        <RecordLink
          href={`/projects/${projectId}/budget/work-orders`}
          label={lookup.workOrder(r.work_order_id)}
        />
      ),
    },
    {
      key: "boq",
      header: "BOQ line",
      cell: (r) => (
        <RecordLink
          href={`/projects/${projectId}/budget/budget-vs-actual`}
          label={lookup.boqItem(r.boq_line_id)}
        />
      ),
    },
    {
      key: "contractor",
      header: "Contractor",
      cell: (r) => lookup.contractor(r.issued_to_contractor_id),
    },
  ];

  return (
    <div>
      <PageHeader
        resource="site_stock"
        title={access.meta.label}
        description="Site inventory maintained by GRN receipts and issues to work orders."
        team={access.ownerTeam}
        outsideNav={access.outsideNav}
        stepCodes={access.meta.step_codes}
        owned={access.owned}
        actions={
          access.canCreate ? (
            <IssueMaterialDialog
              projectId={projectId}
              showValues={access.showValues}
              today={today()}
            />
          ) : null
        }
      />
      <HydrationGate>
        <div className="space-y-8">
          <section>
            <SectionHeading
              title="Current balances"
              description={
                lowCount > 0
                  ? `${lowCount} material${lowCount > 1 ? "s are" : " is"} below its reorder level.`
                  : "Everything is above its reorder level."
              }
            />
            <DataTable
              columns={balanceColumns}
              rows={balances}
              rowKey={(r) => r.material_id}
              showValues={access.showValues}
              emptyMessage="No stock on site yet."
            />
          </section>

          <section>
            <SectionHeading
              title="Stock ledger"
              description="Receipts and issues in date order."
            />
            <DataTable
              columns={ledgerColumns}
              rows={[...ledger].sort((a, b) =>
                b.movement_date.localeCompare(a.movement_date),
              )}
              rowKey={(r) => r.id}
              showValues={access.showValues}
              emptyMessage="No stock movements recorded."
            />
          </section>

          <section>
            <SectionHeading
              title="Issue history"
              description="Stock handed to a contractor against a work order and BOQ line."
            />
            <DataTable
              columns={issueColumns}
              rows={[...issues].sort((a, b) =>
                b.issue_date.localeCompare(a.issue_date),
              )}
              rowKey={(r) => r.id}
              showValues={access.showValues}
              emptyMessage="Nothing issued from site stock yet."
            />
          </section>
        </div>
      </HydrationGate>
    </div>
  );
}
