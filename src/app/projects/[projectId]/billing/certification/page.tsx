"use client";

import { useState } from "react";
import {
  PageHeader,
  DataTable,
  ListPage,
  StatusPill,
  HydrationGate,
  SectionHeading,
  type Column,
} from "@/components/common";
import {
  useAccess,
  useAllRows,
  useLookups,
  useProjectId,
  useProjectRows,
} from "@/lib/hooks";
import { useSession } from "@/lib/session";
import { formatDate, formatInr, formatNumber } from "@/lib/format";
import { CertificationSheet } from "@/components/billing/certification-sheet";
import { Button } from "@/components/ui/button";
import {
  APPROVAL_CHAINS,
  ROLE_LABEL,
  type ApprovalStepSpec,
} from "@/config/permissions";
import { TEAM_STYLES } from "@/config/team-styles";
import type { RaBill, RaBillLine, RaBillRevision } from "@/lib/domain";
import { cn } from "cn";

/** C3–C4 — the certification chain. */
export default function CertificationPage() {
  const projectId = useProjectId();
  const access = useAccess("certification");
  const { role } = useSession();
  const bills = useProjectRows("ra_bills", projectId) as RaBill[];
  const lines = useProjectRows("ra_bill_lines", projectId) as RaBillLine[];
  const revisions = useAllRows("ra_bill_revisions") as RaBillRevision[];
  const lookup = useLookups();
  const [selected, setSelected] = useState<RaBill | null>(null);

  const inChain = bills.filter((b) => b.status === "in_certification");
  const mine = inChain.filter((b) => {
    const step = APPROVAL_CHAINS.ra_bill.find(
      (s) => s.sequence === b.current_sequence,
    );
    return step?.required_role === role;
  });
  const others = inChain.filter((b) => !mine.includes(b));
  const done = bills
    .filter((b) => b.status !== "in_certification")
    .sort((a, b) => b.bill_date.localeCompare(a.bill_date));

  function columns(actionable: boolean): Array<Column<RaBill>> {
    return [
      {
        key: "no",
        header: "Bill",
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
        key: "contractor",
        header: "Contractor",
        secondary: true,
        cell: (r) => lookup.contractor(r.contractor_id),
      },
      {
        key: "wo",
        header: "Work order",
        cell: (r) => lookup.workOrder(r.work_order_id),
      },
      {
        key: "date",
        header: "Bill date",
        cell: (r) => formatDate(r.bill_date),
      },
      {
        key: "lines",
        header: "Lines",
        align: "right",
        cell: (r) => lines.filter((l) => l.ra_bill_id === r.id).length,
      },
      {
        key: "cut",
        header: "Adjusted",
        align: "right",
        cell: (r) => {
          const count = revisions.filter((v) => v.ra_bill_id === r.id).length;
          return count > 0 ? (
            <span className="text-warning">{count}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          );
        },
      },
      {
        key: "gross",
        header: "This bill",
        align: "right",
        money: true,
        cell: (r) => formatInr(r.gross_amount),
      },
      {
        key: "net",
        header: "Net payable",
        align: "right",
        money: true,
        cell: (r) => formatInr(r.net_payable_amount),
      },
      {
        key: "step",
        header: "Waiting on",
        cell: (r) => {
          const step = APPROVAL_CHAINS.ra_bill.find(
            (s) => s.sequence === r.current_sequence,
          ) as ApprovalStepSpec | undefined;
          if (!step) return <span className="text-muted-foreground">—</span>;
          return (
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
                step.cross_team
                  ? TEAM_STYLES.project_budget.tag
                  : TEAM_STYLES.billing_certification.tag,
              )}
            >
              <span className="font-mono">{step.step_code}</span>
              {ROLE_LABEL[step.required_role]}
            </span>
          );
        },
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
          <Button
            variant={actionable && access.canApprove ? "default" : "ghost"}
            size="xs"
            onClick={() => setSelected(r)}
          >
            {actionable && access.canApprove ? "Review" : "Open"}
          </Button>
        ),
      },
    ];
  }

  return (
    <div>
      <PageHeader
        resource="certification"
        title={access.meta.label}
        description="Verification then management approval: Project QS, Project Head, QS Head, HoD — in that order, and only one step at a time."
        team={access.ownerTeam}
        outsideNav={access.outsideNav}
        stepCodes={access.meta.step_codes}
        owned={access.owned}
      />
      <HydrationGate>
        <div className="space-y-8">
          <section>
            <SectionHeading
              title={`Waiting on you — ${ROLE_LABEL[role]}`}
              description={
                access.canApprove
                  ? "Approve, adjust a certified quantity with a comment, send back, or reject."
                  : "Your role holds no step in this chain."
              }
            />
            <DataTable
              columns={columns(true)}
              rows={mine}
              rowKey={(r) => r.id}
              showValues={access.showValues}
              emptyMessage={`Nothing is waiting on the ${ROLE_LABEL[role]}. Bills reach you once the step before yours has signed.`}
              caption={`${mine.length} pending.`}
            />
          </section>

          <section>
            <SectionHeading
              title="Elsewhere in the chain"
              description="Bills being handled by another step."
            />
            <ListPage
              columns={columns(false)}
              rows={others}
              rowKey={(r) => r.id}
              showValues={access.showValues}
              tabs={[{ key: "submitted", label: "Submitted", tone: "warning" as const }, { key: "in_certification", label: "In certification", tone: "info" as const }, { key: "certified", label: "Certified", tone: "success" as const }, { key: "handed_over", label: "With accounts", tone: "neutral" as const }]}
              tabOf={(r) => r.status}
              searchIn={(r) => [r.bill_number]}
              searchPlaceholder={"Bill number"}
              emptyMessage={"Every bill in the chain is on your own desk."}
            />
          </section>

          <section>
            <SectionHeading
              title="Out of the chain"
              description={`${done.filter((b) => b.status === "certified").length} certified · ${done.filter((b) => b.status === "handed_over").length} handed over · ${done.filter((b) => b.status === "draft").length} sent back.`}
            />
            <DataTable
              columns={columns(false)}
              rows={done}
              rowKey={(r) => r.id}
              showValues={access.showValues}
              emptyMessage="Nothing has left the chain yet."
              caption={`${formatNumber(done.length, 0)} bills.`}
            />
          </section>
        </div>

        <CertificationSheet
          bill={selected}
          open={selected !== null}
          onOpenChange={(v) => !v && setSelected(null)}
          projectId={projectId}
          showValues={access.showValues}
        />
      </HydrationGate>
    </div>
  );
}
