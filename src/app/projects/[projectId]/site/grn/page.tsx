"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AppDialog,
  AppDialogBody,
  AppDialogFooter,
  AppDialogHeader,
} from "@/components/ui-app";

import {
  Attachments,
  DataTable,
  DetailRow,
  HydrationGate,
  PageHeader,
  RecordLink,
  RecordTrail,
  SectionHeading,
  StatusPill,
  type Column,
} from "@/components/common";
import {
  useAccess,
  useLookups,
  useProjectId,
  useProjectRows,
} from "@/lib/hooks";
import { countOf, formatDate, formatInr, formatNumber } from "@/lib/format";
import { ReceiveMaterialDialog } from "@/components/material/receive-material-dialog";
import { today } from "@/lib/clock";
import type { Grn, GrnLine, PurchaseOrder } from "@/lib/domain";

/**
 * B5–B6 sit under Site Execution: the material lands on site and the Site
 * Engineer verifies it, so the chart's green box is recoloured orange here.
 * That role is denied `view` on rates, so no value column renders for them.
 */
export default function GrnPage() {
  const projectId = useProjectId();
  const access = useAccess("grn");
  // The challan lives on the GRN, so opening one is how it gets attached.
  const [selected, setSelected] = useState<Grn | null>(null);
  const rows = useProjectRows("grns", projectId) as Grn[];
  const lines = useProjectRows("grn_lines", projectId) as GrnLine[];
  const pos = useProjectRows("purchase_orders", projectId) as PurchaseOrder[];
  const lookup = useLookups();

  const openPos = pos.filter(
    (p) => p.status === "sent" || p.status === "partially_received",
  );

  const grnColumns: Array<Column<Grn>> = [
    {
      key: "no",
      header: "GRN",
      primary: true,
      cell: (r) => <span className="font-mono text-xs">{r.grn_number}</span>,
    },
    {
      key: "po",
      header: "Against PO",
      secondary: true,
      cell: (r) => (
        <RecordLink
          href={`/projects/${projectId}/purchase/purchase-orders`}
          label={lookup.poNumber(r.purchase_order_id)}
        />
      ),
    },
    {
      key: "supplier",
      header: "Supplier",
      cell: (r) => lookup.supplier(r.supplier_id),
    },
    { key: "date", header: "Received", cell: (r) => formatDate(r.received_on) },
    { key: "challan", header: "Challan", cell: (r) => r.challan_number },
    { key: "vehicle", header: "Vehicle", cell: (r) => r.vehicle_number },
    {
      key: "accepted",
      header: "Accepted",
      align: "right",
      cell: (r) =>
        formatNumber(
          lines
            .filter((l) => l.grn_id === r.id)
            .reduce((s, l) => s + l.accepted_qty, 0),
          2,
        ),
    },
    {
      key: "rejected",
      header: "Rejected",
      align: "right",
      cell: (r) => {
        const rejected = lines
          .filter((l) => l.grn_id === r.id)
          .reduce((s, l) => s + l.rejected_qty, 0);
        return rejected > 0 ? (
          <span className="text-destructive">{formatNumber(rejected, 2)}</span>
        ) : (
          "—"
        );
      },
    },
    {
      key: "value",
      header: "Received value",
      align: "right",
      money: true,
      cell: (r) =>
        formatInr(
          lines
            .filter((l) => l.grn_id === r.id)
            .reduce((s, l) => s + l.accepted_qty * l.rate, 0),
        ),
    },
    {
      key: "by",
      header: "Received by",
      cell: (r) => lookup.user(r.received_by_user_id),
    },
    {
      key: "status",
      header: "Status",
      cell: (r) => <StatusPill status={r.status} />,
    },
  ];

  const openColumns: Array<Column<PurchaseOrder>> = [
    {
      key: "no",
      header: "PO",
      primary: true,
      cell: (r) => <span className="font-mono text-xs">{r.po_number}</span>,
    },
    {
      key: "supplier",
      header: "Supplier",
      secondary: true,
      cell: (r) => lookup.supplier(r.supplier_id),
    },
    {
      key: "expected",
      header: "Expected",
      cell: (r) => formatDate(r.expected_delivery_date),
    },
    {
      key: "status",
      header: "Status",
      cell: (r) => <StatusPill status={r.status} />,
    },
  ];

  return (
    <div>
      <PageHeader
        resource="grn"
        title={access.meta.label}
        description="Material received on site and verified against the PO. Posting a GRN updates site stock and is final — corrections go through a return."
        team={access.ownerTeam}
        outsideNav={access.outsideNav}
        stepCodes={access.meta.step_codes}
        owned={access.owned}
        actions={
          access.canCreate ? (
            <ReceiveMaterialDialog
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
              title="Deliveries expected"
              description="POs out with the vendor and not yet fully received."
            />
            <DataTable
              columns={openColumns}
              rows={openPos}
              rowKey={(r) => r.id}
              showValues={access.showValues}
              emptyMessage="No deliveries outstanding."
            />
          </section>

          <section>
            <SectionHeading title="Goods received" />
            <DataTable
              columns={grnColumns}
              rows={[...rows].sort((a, b) =>
                b.received_on.localeCompare(a.received_on),
              )}
              rowKey={(r) => r.id}
              showValues={access.showValues}
              onRowClick={setSelected}
              rowActions={(r) => (
                <Button variant="ghost" size="xs" onClick={() => setSelected(r)}>
                  Open
                </Button>
              )}
              emptyMessage="No goods received on this project yet."
              caption={`${countOf(rows.length, "GRN")}, ${countOf(lines.length, "received line")}.`}
            />

            <GrnDetailDialog
              grn={selected}
              open={selected !== null}
              onOpenChange={(v) => !v && setSelected(null)}
              canEdit={access.canEdit}
            />
          </section>
        </div>
      </HydrationGate>
    </div>
  );
}

/**
 * One goods receipt, and the challan photographed at the gate.
 *
 * A GRN is immutable once posted — corrections go through a Return — so this
 * is a reading view with one thing to add: the paper it was received against.
 */
function GrnDetailDialog({
  grn,
  open,
  onOpenChange,
  canEdit,
}: {
  grn: Grn | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  canEdit: boolean;
}) {
  const lookup = useLookups();
  if (!grn) return null;

  return (
    <AppDialog open={open} onOpenChange={onOpenChange} size="lg">
      <AppDialogHeader
        title={<span className="font-mono">{grn.grn_number}</span>}
        context={`Received ${formatDate(grn.received_on)} from ${lookup.supplier(grn.supplier_id)}`}
      />
      <AppDialogBody className="space-y-6">
        <RecordTrail entityType="grn" entityId={grn.id} />
        <dl className="divide-y divide-border/60">
          <DetailRow label="Challan number">{grn.challan_number || "—"}</DetailRow>
          <DetailRow label="Vehicle">{grn.vehicle_number || "—"}</DetailRow>
          <DetailRow label="Received by">{lookup.user(grn.received_by_user_id)}</DetailRow>
          {grn.remarks ? <DetailRow label="Remarks">{grn.remarks}</DetailRow> : null}
        </dl>
        <Attachments
          entityType="grn"
          entityId={grn.id}
          projectId={grn.project_id}
          canEdit={canEdit}
        />
      </AppDialogBody>
      <AppDialogFooter>
        <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
          Close
        </Button>
      </AppDialogFooter>
    </AppDialog>
  );
}
