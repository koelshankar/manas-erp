"use client";

import { useState } from "react";
import { FileOutput } from "lucide-react";
import {
  PageHeader,
  DataTable,
  StatusPill,
  HydrationGate,
  SectionHeading,
  RecordLink,
  NativeSelect,
  Field,
  LineCount,
  totalsByUnit,
  type Column,
} from "@/components/common";
import {
  useAccess,
  useActor,
  useLookups,
  useProjectId,
  useProjectRows,
  useServiceAction,
} from "@/lib/hooks";
import { createPurchaseOrders } from "@/lib/services/purchase-service";
import { formatDate, formatInr } from "@/lib/format";
import { PoDocumentSheet } from "@/components/material/po-document-sheet";
import { Button } from "@/components/ui/button";
import type { Comparative, PoLine, PurchaseOrder } from "@/lib/domain";
import {
  AppDialog,
  AppDialogBody,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
  SubmitButton,
} from "@/components/ui-app";

/** B3–B4 — purchase orders generated from an approved comparative. */
export default function PurchaseOrdersPage() {
  const projectId = useProjectId();
  const access = useAccess("purchase_orders");
  const rows = useProjectRows("purchase_orders", projectId) as PurchaseOrder[];
  const lines = useProjectRows("po_lines", projectId) as PoLine[];
  const comparatives = useProjectRows(
    "comparatives",
    projectId,
  ) as Comparative[];
  const lookup = useLookups();
  const [selected, setSelected] = useState<PurchaseOrder | null>(null);

  /** Approved comparatives that have not yet produced POs. */
  const ready = comparatives.filter(
    (c) =>
      c.status === "approved" && !rows.some((p) => p.comparative_id === c.id),
  );

  const columns: Array<Column<PurchaseOrder>> = [
    {
      key: "no",
      header: "PO",
      primary: true,
      cell: (r) => (
        <button
          onClick={() => setSelected(r)}
          className="font-mono text-xs underline decoration-border underline-offset-4 hover:decoration-foreground"
        >
          {r.po_number}
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
      key: "state",
      header: "Tax",
      cell: (r) => (
        <span className="text-xs">
          {r.is_interstate ? "IGST" : "CGST + SGST"}
          <span className="ml-1 text-muted-foreground">
            ({lookup.supplierState(r.supplier_id)})
          </span>
        </span>
      ),
    },
    { key: "date", header: "PO date", cell: (r) => formatDate(r.po_date) },
    {
      key: "expected",
      header: "Expected",
      cell: (r) => formatDate(r.expected_delivery_date),
    },
    {
      key: "lines",
      header: "Lines",
      align: "right",
      cell: (r) => lines.filter((l) => l.purchase_order_id === r.id).length,
    },
    {
      key: "pending",
      header: "Pending qty",
      align: "right",
      cell: (r) => {
        const open = lines
          .filter((l) => l.purchase_order_id === r.id)
          .map((l) => ({ unit: l.unit, qty: l.ordered_qty - l.received_qty - l.rejected_qty }))
          .filter((l) => l.qty > 0);
        return open.length === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <LineCount lines={open.length} totals={totalsByUnit(open)} />
        );
      },
    },
    {
      key: "basic",
      header: "Basic",
      align: "right",
      money: true,
      cell: (r) => formatInr(r.basic_amount),
    },
    {
      key: "tax",
      header: "Tax",
      align: "right",
      money: true,
      cell: (r) => formatInr(r.cgst_amount + r.sgst_amount + r.igst_amount),
    },
    {
      key: "total",
      header: "Total",
      align: "right",
      money: true,
      cell: (r) => formatInr(r.total_amount),
    },
    {
      key: "from",
      header: "From",
      cell: (r) =>
        r.comparative_id ? (
          <RecordLink
            href={`/projects/${projectId}/purchase/comparatives`}
            label={lookup.comparativeNumber(r.comparative_id)}
          />
        ) : (
          "—"
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
        resource="purchase_orders"
        title={access.meta.label}
        description="One PO per selected supplier, taxed CGST+SGST inside Goa and IGST outside it."
        team={access.ownerTeam}
        outsideNav={access.outsideNav}
        stepCodes={access.meta.step_codes}
        owned={access.owned}
        actions={
          access.canCreate ? (
            <GeneratePosDialog ready={ready} projectId={projectId} />
          ) : null
        }
      />
      <HydrationGate>
        <div className="space-y-8">
          {ready.length > 0 ? (
            <section>
              <SectionHeading
                title="Approved comparatives awaiting a PO"
                description="B2 is done; these are ready for B3."
              />
              <DataTable
                columns={[
                  {
                    key: "no",
                    header: "Comparative",
                    primary: true,
                    cell: (c: Comparative) => (
                      <span className="font-mono text-xs">
                        {c.comparative_number}
                      </span>
                    ),
                  },
                  {
                    key: "date",
                    header: "Approved",
                    secondary: true,
                    cell: (c: Comparative) => formatDate(c.decided_at),
                  },
                  {
                    key: "value",
                    header: "Selected value",
                    align: "right",
                    money: true,
                    cell: (c: Comparative) => formatInr(c.total_selected_value),
                  },
                ]}
                rows={ready}
                rowKey={(c) => c.id}
                showValues={access.showValues}
                emptyMessage="Nothing ready."
              />
            </section>
          ) : null}

          <section>
            <SectionHeading title="Purchase orders" />
            <DataTable
              columns={columns}
              rows={[...rows].sort((a, b) =>
                b.po_date.localeCompare(a.po_date),
              )}
              rowKey={(r) => r.id}
              showValues={access.showValues}
              emptyMessage="No purchase orders on this project yet."
              caption={
                access.showValues
                  ? `${rows.length} POs worth ${formatInr(rows.reduce((s, r) => s + r.total_amount, 0))}.`
                  : `${rows.length} POs. Values are hidden for your role.`
              }
            />
          </section>
        </div>

        <PoDocumentSheet
          po={selected}
          open={selected !== null}
          onOpenChange={(v) => !v && setSelected(null)}
          projectId={projectId}
          canSend={access.canEdit}
          showValues={access.showValues}
        />
      </HydrationGate>
    </div>
  );
}

function GeneratePosDialog({
  ready,
  projectId,
}: {
  ready: Comparative[];
  projectId: string;
}) {
  const [open, setOpen] = useState(false);
  const [comparativeId, setComparativeId] = useState("");
  const actor = useActor();
  const { run, pending } = useServiceAction();
  void projectId;

  async function submit() {
    await run(
      () => createPurchaseOrders({ comparative_id: comparativeId }, actor),
      {
        view: `/projects/${projectId}/purchase/purchase-orders`,
        success: (r) =>
          r.purchase_orders.length === 1
            ? `${r.purchase_orders[0].po_number} created`
            : `${r.purchase_orders.length} POs created, one per supplier`,
        onDone: () => {
          setOpen(false);
          setComparativeId("");
        },
      },
    );
  }

  return (
    <>
      <Button
        size="sm"
        onClick={() => setOpen(true)}
        disabled={ready.length === 0}
      >
        <FileOutput className="size-3.5" /> Generate POs
      </Button>
      <AppDialog open={open} onOpenChange={setOpen} size="md">
        <AppDialogHeader>
          <AppDialogTitle>Generate purchase orders</AppDialogTitle>
          <AppDialogDescription>
            B3 — one PO per selected supplier on the comparative. Where the
            award was split, you get several.
          </AppDialogDescription>
        </AppDialogHeader>
        <AppDialogBody>
          <Field label="Approved comparative" required>
            <NativeSelect
              value={comparativeId}
              onChange={(e) => setComparativeId(e.target.value)}
            >
              <option value="">Select a comparative</option>
              {ready.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.comparative_number} — {formatInr(c.total_selected_value)}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </AppDialogBody>

        <AppDialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <SubmitButton
            type="button"
            onClick={submit}
            submitting={pending}
            busyLabel="Generating…"
            invalidReason={comparativeId ? undefined : "Pick the approved comparative to raise orders from."}
          >
            Generate
          </SubmitButton>
        </AppDialogFooter>
      </AppDialog>
    </>
  );
}
