"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AgeChip,
  HydrationGate,
  LineCount,
  ListPage,
  PageHeader,
  Qty,
  StatusPill,
  totalsByUnit,
  type Column,
} from "@/components/common";
import { GatePassDialog } from "@/components/stores/gate-pass-dialog";
import { GatePassSheet } from "@/components/stores/gate-pass-sheet";
import {
  useAccess,
  useAllRows,
  useProjectId,
  useProjectRows,
} from "@/lib/hooks";
import { ageInDays, today } from "@/lib/clock";
import { formatDate } from "@/lib/format";
import { gatePassTypeLabel } from "@/config/labels";
import { GATE_PASS_TYPES } from "@/lib/domain";
import type { GatePass, GatePassLine, Store } from "@/lib/domain";
import { cn } from "cn";

/**
 * Material leaving the gate: all three types of pass, and what is still out.
 *
 * The queue a storeman is chased about is the returnable one, so the overdue
 * rows carry the one red mark on the page and the "Still out" tab counts them.
 * Everything else reads as its own status.
 *
 * **No rupee figure, for any role.** A gate pass moves goods, not money.
 */
export default function GatePassPage() {
  const projectId = useProjectId();
  const access = useAccess("gate_pass");
  const passes = useProjectRows("gate_passes", projectId) as GatePass[];
  const lines = useProjectRows("gate_pass_lines", projectId) as GatePassLine[];
  const stores = useAllRows("stores") as Store[];
  const now = today();

  const [open, setOpen] = useState<GatePass | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [storeFilter, setStoreFilter] = useState<string | null>(null);

  const linesOf = (pass: GatePass) => lines.filter((l) => l.gate_pass_id === pass.id);
  const outstandingOf = (pass: GatePass) =>
    linesOf(pass).reduce((s, l) => s + Math.max(0, l.quantity - l.returned_qty), 0);
  const isOverdue = (pass: GatePass) =>
    pass.pass_type === "returnable" &&
    pass.status === "acknowledged" &&
    Boolean(pass.expected_return_date && pass.expected_return_date < now);

  /** Where a pass sits, for the status tabs. */
  const tabOf = (pass: GatePass) => {
    if (pass.status === "acknowledged") {
      return pass.pass_type === "returnable" ? "out" : "acknowledged";
    }
    return pass.status;
  };

  const columns: Array<Column<GatePass>> = [
    {
      key: "no",
      header: "Gate pass",
      primary: true,
      cell: (r) => (
        <span className="flex items-center gap-2">
          <span className="font-mono text-xs">{r.gate_pass_number}</span>
          {isOverdue(r) ? (
            <AlertTriangle className="size-3.5 shrink-0 text-destructive" />
          ) : null}
        </span>
      ),
    },
    {
      key: "type",
      header: "Type",
      secondary: true,
      cell: (r) => gatePassTypeLabel(r.pass_type),
    },
    { key: "date", header: "Date", cell: (r) => formatDate(r.gate_pass_date) },
    {
      key: "to",
      header: "Issued to",
      cell: (r) => r.issued_to_company || r.issued_to_name,
    },
    { key: "purpose", header: "Purpose", cell: (r) => r.purpose },
    {
      key: "items",
      header: "Going out",
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
    {
      key: "due",
      header: "Due back",
      cell: (r) =>
        r.expected_return_date ? (
          <span className={cn(isOverdue(r) && "font-medium text-destructive")}>
            {formatDate(r.expected_return_date)}
          </span>
        ) : (
          // A non-returnable pass has nothing to come back, which is a
          // different thing from a date nobody filled in.
          <span className="text-xs text-muted-foreground">Not expected back</span>
        ),
    },
    {
      key: "outstanding",
      header: "Still out",
      align: "right",
      cell: (r) => {
        const mine = linesOf(r);
        const left = outstandingOf(r);
        if (r.pass_type !== "returnable" || r.status !== "acknowledged" || left === 0) {
          return <span className="text-muted-foreground">—</span>;
        }
        const units = totalsByUnit(
          mine.map((l) => ({ unit: l.unit, qty: Math.max(0, l.quantity - l.returned_qty) })),
        ).filter((u) => u.value > 0);
        return units.length === 1 ? (
          <Qty
            value={units[0].value}
            unit={units[0].unit}
            className={isOverdue(r) ? "text-destructive" : undefined}
          />
        ) : (
          <LineCount lines={units.length} totals={units} />
        );
      },
    },
    {
      key: "status",
      header: "Status",
      cell: (r) => <StatusPill status={r.status} />,
    },
    // Every queue row carries its age: amber past 3 days, red past 7.
    {
      key: "age",
      header: "Age",
      cell: (r) => <AgeChip days={ageInDays(r.gate_pass_date)} verb="raised" />,
    },
    {
      key: "action",
      header: "",
      cell: (r) => (
        <Button
          size="xs"
          variant={actionableBy(r, access.canEdit, access.canApprove) ? "default" : "ghost"}
          onClick={() => setOpen(r)}
        >
          {quickLabel(r, access.canEdit, access.canApprove)}
        </Button>
      ),
    },
  ];

  const overdueCount = passes.filter(isOverdue).length;
  const projectStores = stores.filter((s) => s.project_id === projectId && s.is_active);

  const rows = passes
    .filter((r) => !typeFilter || r.pass_type === typeFilter)
    .filter((r) => !storeFilter || r.store_id === storeFilter)
    // Overdue first: it is the only thing on this page anybody chases.
    .sort(
      (a, b) =>
        Number(isOverdue(b)) - Number(isOverdue(a)) ||
        b.gate_pass_date.localeCompare(a.gate_pass_date),
    );

  return (
    <div>
      <PageHeader
        resource="gate_pass"
        title={access.meta.label}
        description="Material and plant leaving the gate: returnable, non-returnable and transfer passes, and what is still out."
        team={access.ownerTeam}
        outsideNav={access.outsideNav}
        stepCodes={access.meta.step_codes}
        owned={access.owned}
        actions={
          access.canCreate ? (
            <GatePassDialog projectId={projectId} today={now} />
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
            overdueCount > 0
              ? `${overdueCount} returnable ${overdueCount === 1 ? "pass is" : "passes are"} past the date they were due back.`
              : "Nothing is overdue."
          }
          tabs={[
            { key: "draft", label: "Draft", tone: "neutral" as const },
            { key: "pending_approval", label: "Awaiting approval", tone: "warning" as const },
            { key: "approved", label: "Approved", tone: "info" as const },
            { key: "out", label: "Still out", tone: "warning" as const },
            { key: "returned", label: "Returned", tone: "success" as const },
            { key: "acknowledged", label: "Acknowledged", tone: "neutral" as const },
            { key: "closed", label: "Closed", tone: "neutral" as const },
            { key: "rejected", label: "Rejected", tone: "destructive" as const },
          ]}
          tabOf={tabOf}
          searchIn={(r) => [
            r.gate_pass_number,
            r.issued_to_name,
            r.issued_to_company,
            r.purpose,
            r.vehicle_number,
          ]}
          searchPlaceholder="Pass number, company or vehicle"
          filters={[
            {
              key: "type",
              label: "Type",
              options: GATE_PASS_TYPES.map((t) => ({
                value: t,
                label: gatePassTypeLabel(t),
              })),
              value: typeFilter,
              onChange: setTypeFilter,
            },
            // A project with one store needs no store filter: a column of the
            // same name on every row is the first thing to go.
            ...(projectStores.length > 1
              ? [
                  {
                    key: "store",
                    label: "Store",
                    options: projectStores.map((s) => ({ value: s.id, label: s.name })),
                    value: storeFilter,
                    onChange: setStoreFilter,
                  },
                ]
              : []),
          ]}
          emptyMessage="No gate passes raised. One is raised when material or plant leaves site — a machine going for repair, surplus going back to a supplier, or scrap going out."
        />
      </HydrationGate>

      <GatePassSheet
        pass={open}
        open={open !== null}
        onOpenChange={(v) => !v && setOpen(null)}
        projectId={projectId}
        canEdit={access.canEdit}
        canApprove={access.canApprove}
      />
    </div>
  );
}

/** True when this role has something to do to the pass right now. */
function actionableBy(pass: GatePass, canEdit: boolean, canApprove: boolean): boolean {
  if (canApprove && pass.status === "pending_approval") return true;
  if (!canEdit) return false;
  return ["draft", "approved", "acknowledged"].includes(pass.status);
}

/** One primary action per row, named for what it does. */
function quickLabel(pass: GatePass, canEdit: boolean, canApprove: boolean): string {
  if (canApprove && pass.status === "pending_approval") return "Review";
  if (canEdit) {
    if (pass.status === "draft") return "Send";
    if (pass.status === "approved") return "At the gate";
    if (pass.status === "acknowledged") {
      return pass.pass_type === "returnable" ? "Record return" : "Close";
    }
  }
  return "Open";
}
