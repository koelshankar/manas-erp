"use client";

import { DataTable, DetailRow, RecordLink, RecordTrail, statusLabel, type Column } from "@/components/common";
import { useLookups, useRepositoryQuery } from "@/lib/hooks";
import {
  budgetDrilldown,
  budgetRaBills,
  type BudgetDrilldownRow,
  type BudgetRaBillRow,
} from "@/lib/services/budget-service";
import { formatDate, formatInr, formatNumber, formatPercent } from "@/lib/format";
import type { BudgetVsActualRow } from "@/lib/services/budget-service";
import {
  AppDialog,
  AppDialogBody,
  AppDialogDescription,
  AppDialogHeader,
  AppDialogTitle,
} from "@/components/ui-app";

/** Every issue booked against one BOQ line, with the GRN and PO behind it. */
export function BudgetDrilldownSheet({
  row,
  open,
  onOpenChange,
  projectId,
  showValues,
}: {
  row: BudgetVsActualRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  showValues: boolean;
}) {
  const lookup = useLookups();
  const { data, loading } = useRepositoryQuery<BudgetDrilldownRow[]>(
    async () => (row ? budgetDrilldown(projectId, row.boq_line_id) : []),
    [projectId, row?.boq_line_id],
  );
  const { data: bills } = useRepositoryQuery<BudgetRaBillRow[]>(
    async () => (row ? budgetRaBills(projectId, row.boq_line_id) : []),
    [projectId, row?.boq_line_id],
  );

  if (!row) return null;

  const columns: Array<Column<BudgetDrilldownRow>> = [
    {
      key: "issue",
      header: "Issue",
      primary: true,
      cell: (r) => (
        <RecordLink
          href={`/projects/${projectId}/site/stock`}
          label={r.issue_number}
        />
      ),
    },
    {
      key: "date",
      header: "Date",
      secondary: true,
      cell: (r) => formatDate(r.issue_date),
    },
    {
      key: "material",
      header: "Material",
      cell: (r) => lookup.material(r.material_id),
    },
    {
      key: "qty",
      header: "Quantity",
      align: "right",
      cell: (r) => `${formatNumber(r.quantity, 2)} ${r.unit}`,
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
      header: "Work order",
      cell: (r) => (
        <RecordLink
          href={`/projects/${projectId}/budget/work-orders`}
          label={lookup.workOrder(r.work_order_id)}
        />
      ),
    },
    {
      key: "grn",
      header: "GRN",
      cell: (r) =>
        r.grn_number ? (
          <RecordLink
            href={`/projects/${projectId}/site/grn`}
            label={r.grn_number}
          />
        ) : (
          "—"
        ),
    },
    {
      key: "po",
      header: "PO",
      cell: (r) =>
        r.po_number ? (
          <RecordLink
            href={`/projects/${projectId}/purchase/purchase-orders`}
            label={r.po_number}
          />
        ) : (
          "—"
        ),
    },
  ];

  const billColumns: Array<Column<BudgetRaBillRow>> = [
    {
      key: "bill",
      header: "RA bill",
      primary: true,
      cell: (r) => (
        <RecordLink
          href={`/projects/${projectId}/billing/ra-bills`}
          label={r.bill_number}
        />
      ),
    },
    {
      key: "date",
      header: "Bill date",
      secondary: true,
      cell: (r) => formatDate(r.bill_date),
    },
    {
      key: "contractor",
      header: "Contractor",
      cell: (r) => lookup.contractor(r.contractor_id),
    },
    { key: "status", header: "Status", cell: (r) => statusLabel(r.status) },
    {
      key: "qty",
      header: "Certified",
      align: "right",
      cell: (r) => `${formatNumber(r.certified_qty, 2)} ${r.unit}`,
    },
    {
      key: "rate",
      header: "Rate",
      align: "right",
      money: true,
      cell: (r) => formatInr(r.rate),
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      money: true,
      cell: (r) => formatInr(r.amount),
    },
  ];

  return (
    <AppDialog open={open} onOpenChange={onOpenChange} size="xl">
      <AppDialogHeader>
        <AppDialogTitle className="font-mono">{row.item_code}</AppDialogTitle>
        <AppDialogDescription>{row.description}</AppDialogDescription>
      </AppDialogHeader>

      <AppDialogBody className="space-y-6">
        <RecordTrail entityType="boq_line" entityId={row.boq_line_id} />

        <dl className="divide-y divide-border/60">
          <DetailRow label="BOQ quantity">
            {formatNumber(row.budget_quantity, 2)} {row.unit}
          </DetailRow>
          {showValues ? (
            <>
              <DetailRow label="Material budget">
                {formatInr(row.material_budget_value)}
              </DetailRow>
              <DetailRow label="Material issued">
                {formatInr(row.material_issued_value)}
              </DetailRow>
              <DetailRow label="Variance">
                {formatInr(row.material_variance)}
              </DetailRow>
              <DetailRow label="Material consumed">
                {formatPercent(row.material_percent_consumed, 1)}
              </DetailRow>
              <DetailRow label="Work order value">
                {formatInr(row.work_order_value)}
              </DetailRow>
              <DetailRow label="Contractor certified">
                {formatInr(row.certified_amount)} (
                {formatPercent(row.certified_percent, 1)})
              </DetailRow>
              <DetailRow label="Total actual">
                {formatInr(row.total_actual)} of {formatInr(row.total_budget)}
              </DetailRow>
            </>
          ) : null}
        </dl>

        <section>
          <h3 className="mb-3 text-sm font-semibold">
            RA bills against this line
          </h3>
          <DataTable
            columns={billColumns}
            rows={bills ?? []}
            rowKey={(r) => `${r.ra_bill_id}:${r.certified_qty}`}
            showValues={showValues}
            emptyMessage="No contractor bill has been raised against this BOQ line."
          />
        </section>

        <section>
          <h3 className="mb-3 text-sm font-semibold">
            Issues against this line
          </h3>
          <DataTable
            columns={columns}
            rows={data ?? []}
            rowKey={(r) => r.issue_id}
            showValues={showValues}
            emptyMessage={
              loading
                ? "Loading…"
                : "Nothing has been issued against this BOQ line."
            }
          />
        </section>
      </AppDialogBody>
    </AppDialog>
  );
}
