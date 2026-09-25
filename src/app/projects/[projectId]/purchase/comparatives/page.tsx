"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { useState } from "react";
import {
  PageHeader,
  ListPage,
  StatusPill,
  HydrationGate,
  type Column,
} from "@/components/common";
import {
  useAccess,
  useLookups,
  useProjectColumn,
  useProjectId,
  useProjectRows,
  useScopedRows,
  withProjectColumn,
} from "@/lib/hooks";
import { countOf, formatDate, formatInr } from "@/lib/format";
import { ComparativeSheet } from "@/components/material/comparative-sheet";
import { Button } from "@/components/ui/button";
import type { Comparative, ComparativeLine } from "@/lib/domain";

/** B1 — vendor quotes lined up per indent line. */
export default function ComparativesPage() {
  const projectId = useProjectId();
  const access = useAccess("comparatives");
  // "All my projects" widens this list; one project narrows it (audit QH3).
  const rows = useScopedRows("comparatives") as Comparative[];
  const projectColumn = useProjectColumn<Comparative>();
  const lines = useProjectRows(
    "comparative_lines",
    projectId,
  ) as ComparativeLine[];
  const quotes = useProjectRows("quotes", projectId);
  const lookup = useLookups();
  const [selected, setSelected] = useState<Comparative | null>(null);

  const columns: Array<Column<Comparative>> = [
    {
      key: "no",
      header: "Comparative",
      primary: true,
      cell: (r) => (
        <button
          onClick={() => setSelected(r)}
          className="font-mono text-xs underline decoration-border underline-offset-4 hover:decoration-foreground"
        >
          {r.comparative_number}
        </button>
      ),
    },
    {
      key: "indents",
      header: "From indents",
      secondary: true,
      cell: (r) => r.indent_ids.map((id) => lookup.indentNumber(id)).join(", "),
    },
    {
      key: "date",
      header: "Prepared",
      cell: (r) => formatDate(r.prepared_date),
    },
    {
      key: "by",
      header: "Prepared by",
      cell: (r) => lookup.user(r.prepared_by_user_id),
    },
    {
      key: "lines",
      header: "Lines",
      align: "right",
      cell: (r) => lines.filter((l) => l.comparative_id === r.id).length,
    },
    {
      key: "quotes",
      header: "Quotes",
      align: "right",
      cell: (r) => quotes.filter((q) => q.comparative_id === r.id).length,
    },
    {
      key: "suppliers",
      header: "Selected suppliers",
      cell: (r) =>
        [
          ...new Set(
            lines
              .filter((l) => l.comparative_id === r.id)
              .map((l) => lookup.supplier(l.selected_supplier_id)),
          ),
        ].join(", ") || "—",
    },
    {
      key: "l1",
      header: "L1",
      /*
       * A column of em-dashes said nothing: "—" could equally mean "is L1",
       * "not evaluated" or "no quotes" (audit PO5). Now it names the state,
       * and where L1 was passed over it carries what that cost.
       */
      cell: (r) => {
        const own = lines.filter((l) => l.comparative_id === r.id);
        if (own.length === 0) {
          return <span className="text-muted-foreground">Not evaluated</span>;
        }
        const off = own.filter((l) => !l.is_l1_selected);
        if (off.length === 0) {
          return (
            <span className="whitespace-nowrap text-success">
              L1 on every line
            </span>
          );
        }
        const premium = off.reduce((sum, line) => {
          const lineQuotes = quotes.filter((q) => q.comparative_line_id === line.id);
          const chosen = lineQuotes.find((q) => q.is_selected);
          const best = lineQuotes.find((q) => q.is_l1);
          return sum + (chosen && best ? chosen.landed_amount - best.landed_amount : 0);
        }, 0);
        return (
          <span className="whitespace-nowrap text-warning">
            Not L1 on {countOf(off.length, "line")}
            {premium > 0 && access.showValues ? ` (+${formatInr(premium)})` : ""}
          </span>
        );
      },
    },
    {
      key: "value",
      header: "Selected value",
      align: "right",
      money: true,
      cell: (r) => formatInr(r.total_selected_value),
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
        resource="comparatives"
        title={access.meta.label}
        description="Vendor quotes lined up per indent line. L1 is decided on landed cost — rate plus freight plus tax."
        team={access.ownerTeam}
        outsideNav={access.outsideNav}
        stepCodes={access.meta.step_codes}
        owned={access.owned}
        actions={
          access.canCreate ? (
            <Button size="sm" nativeButton={false} render={<Link href={`/projects/${projectId}/purchase/comparatives/new`} />}>
              <Plus className="size-3.5" /> New comparative
            </Button>
          ) : null
        }
      />
      <HydrationGate>
        <ListPage
          columns={withProjectColumn(columns, projectColumn)}
          rows={[...rows].sort((a, b) =>
            b.prepared_date.localeCompare(a.prepared_date),
          )}
          rowKey={(r) => r.id}
          showValues={access.showValues}
          caption={
            access.showValues
              ? `${rows.length} comparatives, ${quotes.length} quotes.`
              : `${rows.length} comparatives. Rates are hidden for your role.`
          }
          tabs={[{ key: "draft", label: "Draft", tone: "neutral" as const },{ key: "pending_approval", label: "Awaiting approval", tone: "warning" as const },{ key: "approved", label: "Approved", tone: "success" as const },{ key: "sent_back", label: "Sent back", tone: "destructive" as const },{ key: "rejected", label: "Rejected", tone: "destructive" as const }]}
          tabOf={(r) => r.status}
          searchIn={(r) => [r.comparative_number]}
          searchPlaceholder={"Comparative number"}
          emptyMessage={"No vendor quotes have been lined up on this project yet."}
        />
        <ComparativeSheet
          comparative={selected}
          open={selected !== null}
          onOpenChange={(v) => !v && setSelected(null)}
          projectId={projectId}
          canDecide={false}
          showValues={access.showValues}
        />
      </HydrationGate>
    </div>
  );
}
