"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AgeChip,
  DataTable,
  HydrationGate,
  NativeSelect,
  PageHeader,
  StatusPill,
  type Column,
} from "@/components/common";
import { ToneChip } from "@/components/common/status-chip";
import { useAllRows, useLookups, useUnseen } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import { APPROVAL_CHAINS, ROLE_LABEL, teamOf, type ApprovalChainKey } from "@/config/permissions";
import { ageInDays } from "@/lib/clock";
import { formatDate } from "@/lib/format";
import type { Approval } from "@/lib/domain";
import { recordLabel } from "@/config/labels";
import { cn } from "cn";

/**
 * The groups, in the order a reader looks for them. A role sees only the ones
 * whose chain it holds a step in — a Purchase Head with two chains sees two
 * sections, an HoD with one sees one.
 */
const GROUPS: Array<{ chain: ApprovalChainKey; title: string }> = [
  { chain: "indent", title: "Indent approvals" },
  { chain: "comparative", title: "Comparative approvals" },
  { chain: "purchase_order", title: "Purchase order approvals" },
  { chain: "gate_pass", title: "Gate pass approvals" },
  { chain: "ra_bill", title: "RA bill approvals" },
];

/** Where each kind of document is opened from. */
function pageFor(a: Approval): string {
  const base = `/projects/${a.project_id}`;
  switch (a.entity_type) {
    case "indent":
      return `${base}/procurement/indent-approval`;
    case "comparative":
      return `${base}/procurement/approval`;
    case "purchase_order":
      return `${base}/procurement/purchase-orders`;
    case "gate_pass":
      return `${base}/stores/gate-pass`;
    default:
      return `${base}/billing/certification`;
  }
}

/** The inbox: every pending Approval this role holds, grouped by document type. */
export default function ApprovalsPage() {
  const { role, assigned_project_ids } = useSession();
  const router = useRouter();
  const approvals = useAllRows("approvals") as Approval[];
  const indents = useAllRows("indents");
  const comparatives = useAllRows("comparatives");
  const raBills = useAllRows("ra_bills");
  const purchaseOrders = useAllRows("purchase_orders");
  const gatePasses = useAllRows("gate_passes");
  const lookup = useLookups();
  const unseen = useUnseen();

  // Per group: collapsed by the reader, and the project it is narrowed to.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [projectOf, setProjectOf] = useState<Record<string, string>>({});

  const billById = useMemo(() => new Map(raBills.map((b) => [b.id, b])), [raBills]);
  const poById = useMemo(() => new Map(purchaseOrders.map((p) => [p.id, p])), [purchaseOrders]);

  /** Only projects this user is posted to. */
  const assigned = new Set(assigned_project_ids);
  const isMine = (a: Approval) => !a.project_id || assigned.has(a.project_id);

  /** A chain row only matters while its document is actually in the chain. */
  function isLive(a: Approval): boolean {
    if (a.entity_type === "ra_bill") return billById.get(a.entity_id)?.status === "in_certification";
    if (a.entity_type === "purchase_order") {
      return poById.get(a.entity_id)?.status === "pending_approval";
    }
    if (a.entity_type === "gate_pass") {
      return gatePasses.find((p) => p.id === a.entity_id)?.status === "pending_approval";
    }
    return true;
  }

  /** A chain runs in order, so only the lowest pending step is anybody's yet. */
  function isActionable(a: Approval): boolean {
    if (a.entity_type === "ra_bill") return billById.get(a.entity_id)?.current_sequence === a.sequence;
    if (a.entity_type === "purchase_order") return poById.get(a.entity_id)?.current_sequence === a.sequence;
    return true;
  }

  const held = approvals.filter((a) => a.required_role === role && a.status === "pending" && isMine(a));
  const mine = held.filter(isLive).filter(isActionable);
  /** Steps further down a chain that will reach this role later. */
  const upcoming = held.filter(isLive).filter((a) => !isActionable(a));
  const history = approvals
    .filter((a) => a.required_role === role && a.status !== "pending")
    .filter(isMine)
    .sort((a, b) => (b.acted_at ?? "").localeCompare(a.acted_at ?? ""))
    .slice(0, 20);

  function reference(a: Approval): string {
    switch (a.entity_type) {
      case "indent":
        return indents.find((x) => x.id === a.entity_id)?.indent_number ?? "—";
      case "comparative":
        return comparatives.find((x) => x.id === a.entity_id)?.comparative_number ?? "—";
      case "purchase_order":
        return poById.get(a.entity_id)?.po_number ?? "—";
      case "ra_bill":
        return billById.get(a.entity_id)?.bill_number ?? "—";
      case "gate_pass":
        return gatePasses.find((x) => x.id === a.entity_id)?.gate_pass_number ?? "—";
      default:
        return "—";
    }
  }

  const open = (a: Approval) =>
    router.push(`${a.project_id ? pageFor(a) : "/approvals"}?open=${a.entity_id}`);

  const columns: Array<Column<Approval>> = [
    {
      key: "ref",
      header: "Reference",
      primary: true,
      cell: (a) => <span className="font-mono text-xs">{reference(a)}</span>,
    },
    {
      key: "project",
      header: "Project",
      secondary: true,
      cell: (a) => lookup.project(a.project_id),
    },
    { key: "raised", header: "Raised", cell: (a) => formatDate(a.created_at) },
    {
      key: "age",
      header: "Waiting",
      cell: (a) => <AgeChip days={ageInDays(a.created_at)} verb="raised" />,
    },
    {
      key: "seq",
      header: "Your step",
      cell: (a) => {
        const step = APPROVAL_CHAINS[a.entity_type as ApprovalChainKey]?.find(
          (s) => s.sequence === a.sequence,
        );
        return <span className="text-sm">{step?.label ?? "Approval"}</span>;
      },
    },
    {
      key: "open",
      header: "",
      cell: (a) => (
        <Button size="xs" onClick={() => open(a)}>
          Review and approve
        </Button>
      ),
    },
  ];

  const historyColumns: Array<Column<Approval>> = [
    {
      key: "type",
      header: "Document",
      secondary: true,
      cell: (a) => recordLabel(a.entity_type),
    },
    ...columns.filter((c) => c.key === "ref" || c.key === "project"),
    { key: "status", header: "Decision", cell: (a) => <StatusPill status={a.status} /> },
    { key: "acted", header: "Decided", cell: (a) => formatDate(a.acted_at) },
    { key: "comment", header: "Comment", cell: (a) => a.comment || "—" },
  ];

  const groups = GROUPS.filter((g) =>
    APPROVAL_CHAINS[g.chain].some((s) => s.required_role === role),
  );
  const multiProject = assigned_project_ids.length > 1;
  const unreadTotal = mine.filter((a) => unseen.has(a.entity_type, a.entity_id)).length;

  return (
    <div>
      <PageHeader
        title="Approvals"
        description={`Everything waiting on the ${ROLE_LABEL[role]}, by kind of document — newest first, unread at the top.`}
        team={teamOf(role)}
        owned
      />

      <HydrationGate>
        <div className="space-y-4">
          {unreadTotal > 0 ? (
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{unreadTotal} unread</span> — bold, with a
              dot, until you open them.
            </p>
          ) : null}

          {groups.map((group) => {
            const all = mine.filter((a) => a.entity_type === group.chain);
            const projectIds = [...new Set(all.map((a) => a.project_id).filter(Boolean))] as string[];
            const picked = projectOf[group.chain] ?? "";
            const shown = all
              .filter((a) => !picked || a.project_id === picked)
              // Unread first, then newest.
              .sort(
                (a, b) =>
                  Number(unseen.has(b.entity_type, b.entity_id)) -
                    Number(unseen.has(a.entity_type, a.entity_id)) ||
                  b.created_at.localeCompare(a.created_at),
              );
            const unread = all.filter((a) => unseen.has(a.entity_type, a.entity_id)).length;
            const isCollapsed = collapsed[group.chain] ?? false;
            const bodyId = `approvals-${group.chain}`;

            return (
              <section key={group.chain} aria-labelledby={`${bodyId}-title`}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <button
                    type="button"
                    aria-expanded={!isCollapsed}
                    aria-controls={bodyId}
                    onClick={() => setCollapsed((c) => ({ ...c, [group.chain]: !isCollapsed }))}
                    className="flex min-h-11 flex-1 items-center gap-2 rounded-lg text-left focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    <ChevronDown
                      className={cn(
                        "size-4 shrink-0 text-muted-foreground transition-transform",
                        isCollapsed && "-rotate-90",
                      )}
                    />
                    <h2 id={`${bodyId}-title`} className="min-w-0">
                      {group.title}
                    </h2>
                    <ToneChip tone={all.length > 0 ? "warning" : "neutral"}>{all.length}</ToneChip>
                    {unread > 0 ? (
                      <span className="num text-xs font-semibold text-foreground">{unread} unread</span>
                    ) : null}
                  </button>
                  {multiProject && projectIds.length > 1 && !isCollapsed ? (
                    <NativeSelect
                      value={picked}
                      onChange={(e) => setProjectOf((p) => ({ ...p, [group.chain]: e.target.value }))}
                      aria-label={`Project, ${group.title}`}
                      className="h-9 w-full sm:w-56"
                    >
                      <option value="">All projects</option>
                      {projectIds.map((id) => (
                        <option key={id} value={id}>
                          {lookup.project(id)}
                        </option>
                      ))}
                    </NativeSelect>
                  ) : null}
                </div>

                {isCollapsed ? null : (
                  <div id={bodyId} className="mt-2">
                    <DataTable
                      columns={columns}
                      rows={shown}
                      rowKey={(a) => a.id}
                      onRowClick={open}
                      rowUnseen={(a) => unseen.has(a.entity_type, a.entity_id)}
                      emptyMessage={`No ${group.title.toLowerCase()} are waiting on you.`}
                    />
                  </div>
                )}
              </section>
            );
          })}

          {upcoming.length > 0 ? (
            <section>
              <h2 className="mb-1">Coming to you</h2>
              <p className="mb-3 text-sm text-muted-foreground">
                Steps you hold on documents that are still with an earlier link in the chain.
              </p>
              <DataTable
                columns={columns.filter((c) => c.key !== "open" && c.key !== "age")}
                rows={[...upcoming].sort((a, b) => b.created_at.localeCompare(a.created_at))}
                rowKey={(a) => a.id}
              />
            </section>
          ) : null}

          {history.length > 0 ? (
            <section>
              <h2 className="mb-3">Recently decided</h2>
              <DataTable
                columns={historyColumns}
                rows={history}
                rowKey={(a) => a.id}
                emptyMessage="No decisions yet. Items you approve or send back will be listed here."
              />
            </section>
          ) : null}
        </div>
      </HydrationGate>
    </div>
  );
}
