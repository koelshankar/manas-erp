"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import {
  PageHeader,
  ListPage,
  StatusPill,
  HydrationGate,
  RecordLink,
  type Column,
} from "@/components/common";
import {
  useAccess,
  useLookups,
  useProjectColumn,
  useProjectId,
  useScopedRows,
  withProjectColumn,
} from "@/lib/hooks";
import { formatDate, formatInr } from "@/lib/format";
import { VendorBillDialog } from "@/components/material/vendor-bill-dialog";
import { VendorBillSheet } from "@/components/material/vendor-bill-sheet";
import { Button } from "@/components/ui/button";
import { today } from "@/lib/clock";
import type { VendorBill } from "@/lib/domain";
import { cn } from "cn";

function Mark({ ok }: { ok: boolean }) {
  return ok ? (
    <Check className="size-4 text-success" aria-label="matched" />
  ) : (
    <X className="size-4 text-destructive" aria-label="not matched" />
  );
}

/** B7 — three-way match, verification and the handover to Accounts. */
export default function VendorBillsPage() {
  const projectId = useProjectId();
  const access = useAccess("vendor_bills");
  // "All my projects" widens this list; one project narrows it (audit QH3).
  const rows = useScopedRows("vendor_bills") as VendorBill[];
  const projectColumn = useProjectColumn<VendorBill>();
  const lookup = useLookups();
  const [selected, setSelected] = useState<VendorBill | null>(null);

  const columns: Array<Column<VendorBill>> = [
    {
      key: "no",
      header: "Invoice",
      primary: true,
      cell: (r) => (
        <button
          onClick={() => setSelected(r)}
          className="font-mono text-xs underline decoration-border underline-offset-4 hover:decoration-foreground"
        >
          {r.bill_number}
        </button>
      ),
    },
    {
      key: "supplier",
      header: "Supplier",
      secondary: true,
      cell: (r) => lookup.supplier(r.supplier_id),
    },
    {
      key: "grns",
      header: "GRNs",
      cell: (r) => (
        <span className="flex flex-wrap gap-1.5">
          {r.grn_ids.map((id) => (
            <RecordLink
              key={id}
              href={`/projects/${projectId}/site/grn`}
              label={lookup.grnNumber(id)}
            />
          ))}
        </span>
      ),
    },
    { key: "date", header: "Bill date", cell: (r) => formatDate(r.bill_date) },
    {
      key: "billed",
      header: "Billed",
      align: "right",
      money: true,
      cell: (r) => formatInr(r.bill_total_amount),
    },
    {
      key: "expected",
      header: "Expected",
      align: "right",
      money: true,
      cell: (r) => formatInr(r.expected_total_amount),
    },
    {
      key: "variance",
      header: "Variance",
      align: "right",
      money: true,
      cell: (r) => (
        <span className={cn(r.amount_variance !== 0 && "text-destructive")}>
          {formatInr(r.amount_variance)}
        </span>
      ),
    },
    {
      key: "match",
      header: "Qty / Rate / Tax",
      cell: (r) => (
        <span className="flex items-center gap-1.5">
          <Mark ok={r.is_quantity_matched} />
          <Mark ok={r.is_rate_matched} />
          <Mark ok={r.is_tax_matched} />
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (r) => <StatusPill status={r.status} />,
    },
    {
      key: "open",
      header: "",
      cell: (r) => (
        <Button variant="ghost" size="xs" onClick={() => setSelected(r)}>
          Open
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        resource="vendor_bills"
        title={access.meta.label}
        description="Billed quantity against the GRN, billed rate and GST against the PO. Verifying posts to the supplier ledger."
        team={access.ownerTeam}
        outsideNav={access.outsideNav}
        stepCodes={access.meta.step_codes}
        owned={access.owned}
        actions={
          access.canCreate ? (
            <VendorBillDialog projectId={projectId} today={today()} />
          ) : null
        }
      />
      <HydrationGate>
        <ListPage
          columns={withProjectColumn(columns, projectColumn)}
          rows={[...rows].sort((a, b) =>
            b.bill_date.localeCompare(a.bill_date),
          )}
          rowKey={(r) => r.id}
          showValues={access.showValues}
          caption={`${rows.filter((r) => r.status === "mismatch").length} bills failing the three-way match.`}
          tabs={[{ key: "draft", label: "Draft", tone: "neutral" as const },{ key: "matched", label: "Matched", tone: "success" as const },{ key: "mismatch", label: "Mismatch", tone: "destructive" as const },{ key: "verified", label: "Verified", tone: "success" as const },{ key: "handed_over", label: "With accounts", tone: "neutral" as const }]}
          tabOf={(r) => r.status}
          searchIn={(r) => [r.bill_number, r.reference_number]}
          searchPlaceholder={"Bill or supplier invoice number"}
          emptyMessage={"No supplier bills have come in on this project yet."}
        />
        <VendorBillSheet
          bill={selected}
          open={selected !== null}
          onOpenChange={(v) => !v && setSelected(null)}
          projectId={projectId}
          canAct={access.canEdit}
          showValues={access.showValues}
        />
      </HydrationGate>
    </div>
  );
}
