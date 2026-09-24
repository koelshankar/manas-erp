"use client";

import Link from "next/link";
import {
  PageHeader,
  DataTable,
  StatusPill,
  HydrationGate,
  StepCodeBadge,
  type Column,
} from "@/components/common";
import { useAllRows, useLookups } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import {
  approvalStepsFor,
  ownerTeamOf,
  ROLE_LABEL,
  teamOf,
} from "@/config/permissions";
import { STEP_LABELS } from "@/config/teams";
import { formatDate } from "@/lib/format";
import type { Approval, StepCode } from "@/lib/domain";
import { Card } from "@/components/ui/card";
import { recordLabel } from "@/config/labels";

/** The inbox: every pending Approval row whose required_role is the active role. */
export default function ApprovalsPage() {
  const { role, assigned_project_ids } = useSession();
  const approvals = useAllRows("approvals") as Approval[];
  const indents = useAllRows("indents");
  const comparatives = useAllRows("comparatives");
  const raBills = useAllRows("ra_bills");
  const lookup = useLookups();

  /**
   * An RA bill runs a four-step chain, so only the lowest pending sequence is
   * actionable. The other three rows exist but are not yet anybody's problem.
   */
  const billById = new Map(raBills.map((b) => [b.id, b]));

  /**
   * Only projects this user is posted to. A row with no project (there are
   * none today) would be everyone's business, so it stays visible.
   */
  const assigned = new Set(assigned_project_ids);
  function isMine(a: Approval): boolean {
    return !a.project_id || assigned.has(a.project_id);
  }

  /** A chain row only matters while its bill is actually in the chain. */
  function isLive(a: Approval): boolean {
    if (a.entity_type !== "ra_bill") return true;
    return billById.get(a.entity_id)?.status === "in_certification";
  }

  function isActionable(a: Approval): boolean {
    if (a.entity_type !== "ra_bill") return true;
    return billById.get(a.entity_id)?.current_sequence === a.sequence;
  }

  const mine = approvals
    .filter((a) => a.required_role === role && a.status === "pending")
    .filter(isMine)
    .filter(isLive)
    .filter(isActionable)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  /** Steps further down a chain that will reach this role later. */
  const upcoming = approvals
    .filter((a) => a.required_role === role && a.status === "pending")
    .filter(isMine)
    .filter(isLive)
    .filter((a) => !isActionable(a))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  const history = approvals
    .filter((a) => a.required_role === role && a.status !== "pending")
    .filter(isMine)
    .sort((a, b) => (b.acted_at ?? "").localeCompare(a.acted_at ?? ""))
    .slice(0, 20);

  function reference(a: Approval): string {
    if (a.entity_type === "indent") {
      return indents.find((x) => x.id === a.entity_id)?.indent_number ?? "—";
    }
    if (a.entity_type === "comparative") {
      return (
        comparatives.find((x) => x.id === a.entity_id)?.comparative_number ??
        "—"
      );
    }
    if (a.entity_type === "ra_bill") {
      return raBills.find((x) => x.id === a.entity_id)?.bill_number ?? "—";
    }
    return "—";
  }

  function href(a: Approval): string {
    if (!a.project_id) return "/approvals";
    if (a.entity_type === "indent")
      return `/projects/${a.project_id}/budget/indent-approval`;
    if (a.entity_type === "comparative")
      return `/projects/${a.project_id}/purchase/approval`;
    return `/projects/${a.project_id}/billing/certification`;
  }

  function ownerTeamFor(a: Approval) {
    if (a.entity_type === "indent") return ownerTeamOf("indent_approval");
    if (a.entity_type === "comparative")
      return ownerTeamOf("purchase_approval");
    return ownerTeamOf("certification");
  }

  const columns: Array<Column<Approval>> = [
    {
      key: "step",
      header: "Step",
      cell: (a) => (
        <StepCodeBadge
          codes={[a.step_code as StepCode]}
          team={ownerTeamFor(a)}
        />
      ),
    },
    {
      key: "ref",
      header: "Reference",
      primary: true,
      cell: (a) => (
        <Link
          href={href(a)}
          className="font-mono text-xs underline-offset-4 hover:underline"
        >
          {reference(a)}
        </Link>
      ),
    },
    {
      key: "type",
      header: "Type",
      secondary: true,
      cell: (a) => recordLabel(a.entity_type),
    },
    {
      key: "project",
      header: "Project",
      cell: (a) => lookup.project(a.project_id),
    },
    {
      key: "seq",
      header: "Chain position",
      align: "right",
      cell: (a) => `#${a.sequence}`,
    },
    { key: "raised", header: "Raised", cell: (a) => formatDate(a.created_at) },
    {
      key: "status",
      header: "Status",
      cell: (a) => <StatusPill status={a.status} />,
    },
  ];

  const historyColumns: Array<Column<Approval>> = [
    ...columns.filter((c) => c.key !== "raised"),
    { key: "acted", header: "Decided", cell: (a) => formatDate(a.acted_at) },
    { key: "comment", header: "Comment", cell: (a) => a.comment || "—" },
  ];

  return (
    <div>
      <PageHeader
        title="Approvals"
        description={`Everything waiting on the ${ROLE_LABEL[role]}, on the projects you are posted to. One generic Approval row drives every gate — A2, B2 and the C3–C4 bill chain.`}
        team={teamOf(role)}
        owned
      />

      <HydrationGate>
        <div className="space-y-8">
          <section>
            <div className="mb-4 flex flex-wrap gap-2">
              {approvalStepsFor(role).map((step) => (
                <Card
                  key={`${step.step_code}-${step.sequence}`}
                  size="sm"
                  className="px-3.5 py-2.5"
                >
                  <p className="font-mono text-xs font-semibold">
                    {step.step_code}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {STEP_LABELS[step.step_code]}
                  </p>
                </Card>
              ))}
            </div>
            <DataTable
              columns={columns}
              rows={mine}
              rowKey={(a) => a.id}
              emptyMessage={`Nothing is waiting on the ${ROLE_LABEL[role]} right now.`}
              caption={`${mine.length} pending.`}
            />
          </section>

          {upcoming.length > 0 ? (
            <section>
              <h2 className="mb-1 text-base font-semibold tracking-tight">
                Coming to you
              </h2>
              <p className="mb-3 text-sm text-muted-foreground">
                Steps you hold on bills that are still with an earlier link in
                the chain.
              </p>
              <DataTable
                columns={columns.filter((c) => c.key !== "status")}
                rows={upcoming}
                rowKey={(a) => a.id}
                emptyMessage="Nothing queued behind another step."
              />
            </section>
          ) : null}

          {history.length > 0 ? (
            <section>
              <h2 className="mb-3 text-base font-semibold tracking-tight">
                Recently decided
              </h2>
              <DataTable
                columns={historyColumns}
                rows={history}
                rowKey={(a) => a.id}
                emptyMessage="No decisions recorded yet."
              />
            </section>
          ) : null}
        </div>
      </HydrationGate>
    </div>
  );
}
