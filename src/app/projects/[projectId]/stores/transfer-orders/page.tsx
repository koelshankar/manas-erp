"use client";

import { useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AgeChip,
  HydrationGate,
  LineCount,
  ListPage,
  PageHeader,
  StatusPill,
  totalsByUnit,
  type Column,
} from "@/components/common";
import { TransferDialog } from "@/components/stores/transfer-dialog";
import { TransferSheet } from "@/components/stores/transfer-sheet";
import {
  useAccess,
  useAllRows,
  useLookups,
  useProjectId,
} from "@/lib/hooks";
import { ageInDays, today } from "@/lib/clock";
import { formatDate } from "@/lib/format";
import type { MaterialTransfer, MaterialTransferLine, Store } from "@/lib/domain";

/**
 * Stock moving between stores, in both directions.
 *
 * A transfer is filed under the project it **leaves**, so a page scoped to the
 * project in the URL would show a receiving storeman nothing to acknowledge —
 * his own queue would be on somebody else's screen. So this list reads both:
 * transfers out of this project's stores, and transfers arriving at them. The
 * Direction column says which, and it is the only cross-project read in the
 * Stores tab.
 *
 * **No rupee figure, for any role.** A transfer moves goods between our own
 * stores; nothing is bought or sold.
 */
export default function TransferOrdersPage() {
  const projectId = useProjectId();
  const access = useAccess("transfer_orders");
  const allTransfers = useAllRows("material_transfers") as MaterialTransfer[];
  const allLines = useAllRows("material_transfer_lines") as MaterialTransferLine[];
  const stores = useAllRows("stores") as Store[];
  const lookup = useLookups();

  const [open, setOpen] = useState<MaterialTransfer | null>(null);

  const rows = useMemo(
    () =>
      allTransfers
        .filter((t) => t.project_id === projectId || t.to_project_id === projectId)
        .sort(
          (a, b) =>
            // In transit first: the only state anybody has to act on.
            Number(b.status === "in_transit") - Number(a.status === "in_transit") ||
            b.transfer_date.localeCompare(a.transfer_date),
        ),
    [allTransfers, projectId],
  );

  const storeName = (id: string) => stores.find((s) => s.id === id)?.name ?? "—";
  const linesOf = (t: MaterialTransfer) =>
    allLines.filter((l) => l.material_transfer_id === t.id);
  /** Out of this project, or in to it. A transfer inside one project is "out". */
  const isInbound = (t: MaterialTransfer) =>
    t.to_project_id === projectId && t.project_id !== projectId;

  const columns: Array<Column<MaterialTransfer>> = [
    {
      key: "no",
      header: "Transfer",
      primary: true,
      cell: (r) => <span className="font-mono text-xs">{r.transfer_number}</span>,
    },
    {
      key: "direction",
      header: "Direction",
      secondary: true,
      cell: (r) =>
        isInbound(r) ? (
          <span className="flex items-center gap-1.5">
            <ArrowDownLeft className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            Incoming
          </span>
        ) : (
          <span className="flex items-center gap-1.5">
            <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            Outgoing
          </span>
        ),
    },
    { key: "date", header: "Date", cell: (r) => formatDate(r.transfer_date) },
    { key: "from", header: "From", cell: (r) => storeName(r.from_store_id) },
    {
      key: "to",
      header: "To",
      cell: (r) =>
        r.to_project_id === r.project_id
          ? storeName(r.to_store_id)
          : `${lookup.project(r.to_project_id)} — ${storeName(r.to_store_id)}`,
    },
    {
      key: "materials",
      header: "Materials",
      cell: (r) => {
        const mine = linesOf(r);
        return (
          <LineCount
            lines={mine.length}
            totals={totalsByUnit(mine.map((l) => ({ unit: l.unit, qty: l.quantity })))}
          />
        );
      },
    },
    { key: "reason", header: "Reason", cell: (r) => r.reason },
    {
      key: "status",
      header: "Status",
      cell: (r) => <StatusPill status={r.status} />,
    },
    {
      key: "age",
      header: "Age",
      cell: (r) => <AgeChip days={ageInDays(r.transfer_date)} verb="raised" />,
    },
    {
      key: "action",
      header: "",
      cell: (r) => {
        const actionable =
          access.canEdit && (r.status === "draft" || r.status === "in_transit");
        return (
          <Button
            size="xs"
            variant={actionable ? "default" : "ghost"}
            onClick={() => setOpen(r)}
          >
            {!actionable
              ? "Open"
              : r.status === "draft"
                ? "Dispatch"
                : "Acknowledge"}
          </Button>
        );
      },
    },
  ];

  const inTransit = rows.filter((r) => r.status === "in_transit");
  const awaitingUs = inTransit.filter((r) => r.to_project_id === projectId).length;

  return (
    <div>
      <PageHeader
        resource="transfer_orders"
        title={access.meta.label}
        description="Stock moved between stores, and what is in transit. A transfer is complete only when the receiving store signs for it."
        team={access.ownerTeam}
        outsideNav={access.outsideNav}
        stepCodes={access.meta.step_codes}
        owned={access.owned}
        actions={
          access.canCreate ? (
            <TransferDialog projectId={projectId} today={today()} />
          ) : null
        }
      />
      <HydrationGate>
        <ListPage
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          onRowClick={(r) => setOpen(r)}
          caption={
            inTransit.length === 0
              ? "Nothing is in transit."
              : awaitingUs > 0
                ? `${inTransit.length} in transit, ${awaitingUs} waiting on this site to sign for ${awaitingUs === 1 ? "it" : "them"}.`
                : `${inTransit.length} in transit, waiting on the receiving store.`
          }
          tabs={[
            { key: "draft", label: "Draft", tone: "neutral" as const },
            { key: "in_transit", label: "In transit", tone: "warning" as const },
            { key: "acknowledged", label: "Received", tone: "success" as const },
            { key: "cancelled", label: "Cancelled", tone: "neutral" as const },
          ]}
          tabOf={(r) => r.status}
          searchIn={(r) => [r.transfer_number, r.reason, r.vehicle_number]}
          searchPlaceholder="Transfer number or reason"
          emptyMessage="Nothing has been transferred. A transfer order moves stock from one store to another — the quantity leaves here on dispatch and arrives there when their store signs for it."
        />
      </HydrationGate>

      <TransferSheet
        transfer={open}
        open={open !== null}
        onOpenChange={(v) => !v && setOpen(null)}
        projectId={projectId}
        canEdit={access.canEdit}
      />
    </div>
  );
}
