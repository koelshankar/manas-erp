"use client";

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
  useActor,
  useLookups,
  useProjectColumn,
  useProjectId,
  useScopedRows,
  useServiceAction,
  withProjectColumn,
} from "@/lib/hooks";
import { advanceReturn } from "@/lib/services/stores-service";
import { formatDate, formatInr, formatNumber } from "@/lib/format";
import { Button } from "@/components/ui/button";
import type { Return } from "@/lib/domain";

/**
 * Rejected material going back to the supplier.
 *
 * Returns are raised automatically by the GRN; Purchase dispatches them and
 * issues the debit note, which posts against the supplier's account.
 */
export default function ReturnsPage() {
  const projectId = useProjectId();
  const access = useAccess("returns");
  // "All my projects" widens this list; one project narrows it (audit QH3).
  const rows = useScopedRows("returns") as Return[];
  const projectColumn = useProjectColumn<Return>();
  const lookup = useLookups();
  const actor = useActor();
  const { run, pending } = useServiceAction();

  async function advance(entry: Return) {
    const to = entry.status === "raised" ? "dispatched" : "debit_note_issued";
    await run(() => advanceReturn(entry.id, to, actor), {
      view: `/projects/${projectId}/purchase/returns`,
        success: (r) =>
        r.status === "dispatched"
          ? `${r.return_number} marked dispatched`
          : `Debit note ${r.debit_note_number} issued`,
    });
  }

  const columns: Array<Column<Return>> = [
    {
      key: "no",
      header: "Return",
      primary: true,
      cell: (r) => <span className="font-mono text-xs">{r.return_number}</span>,
    },
    {
      key: "supplier",
      header: "Supplier",
      secondary: true,
      cell: (r) => lookup.supplier(r.supplier_id),
    },
    {
      key: "material",
      header: "Material",
      cell: (r) => lookup.material(r.material_id),
    },
    {
      key: "grn",
      header: "Against GRN",
      cell: (r) => (
        <RecordLink
          href={`/projects/${projectId}/site/grn`}
          label={lookup.grnNumber(r.grn_id)}
        />
      ),
    },
    {
      key: "qty",
      header: "Quantity",
      align: "right",
      cell: (r) => `${formatNumber(r.quantity, 2)} ${r.unit}`,
    },
    {
      key: "amount",
      header: "Value",
      align: "right",
      money: true,
      cell: (r) => formatInr(r.amount),
    },
    { key: "date", header: "Raised", cell: (r) => formatDate(r.return_date) },
    { key: "reason", header: "Reason", cell: (r) => r.reason },
    {
      key: "dn",
      header: "Debit note",
      cell: (r) => r.debit_note_number ?? "—",
    },
    {
      key: "status",
      header: "Status",
      cell: (r) => <StatusPill status={r.status} />,
    },
    {
      key: "action",
      header: "",
      cell: (r) =>
        access.canEdit && r.status !== "debit_note_issued" ? (
          <Button size="xs" onClick={() => advance(r)} disabled={pending}>
            {r.status === "raised" ? "Mark dispatched" : "Issue debit note"}
          </Button>
        ) : null,
    },
  ];

  return (
    <div>
      <PageHeader
        resource="returns"
        title={access.meta.label}
        description="Material rejected at receipt goes back to the supplier; the debit note posts against their account."
        team={access.ownerTeam}
        outsideNav={access.outsideNav}
        stepCodes={access.meta.step_codes}
        owned={access.owned}
      />
      <HydrationGate>
        <ListPage
          columns={withProjectColumn(columns, projectColumn)}
          rows={[...rows].sort((a, b) =>
            b.return_date.localeCompare(a.return_date),
          )}
          rowKey={(r) => r.id}
          showValues={access.showValues}
          caption={`${rows.filter((r) => r.status !== "debit_note_issued").length} still open.`}
          tabs={[{ key: "raised", label: "Raised", tone: "warning" as const },{ key: "dispatched", label: "Dispatched", tone: "info" as const },{ key: "debit_note_issued", label: "Debit note issued", tone: "success" as const }]}
          tabOf={(r) => r.status}
          searchIn={(r) => [r.return_number]}
          searchPlaceholder={"Return number"}
          emptyMessage={"Nothing has been sent back to a supplier on this project."}
        />
      </HydrationGate>
    </div>
  );
}
