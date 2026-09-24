"use client";

import Link from "next/link";
import {
  ResourcePage,
  DataTable,
  SectionHeading,
  type Column,
} from "@/components/common";
import { useAccess, useDashboardScope, useRepositoryQuery } from "@/lib/hooks";
import { getProjectCards, type ProjectCard } from "@/lib/services/queries";
import { formatInr, formatInrCompact, formatPercent } from "@/lib/format";
import { cn } from "cn";

/**
 * Budget against actual, one row per project in view.
 *
 * Same query and same scope as the dashboard's KPIs and project cards, so the
 * totals here are the figures on the card that links here. The top-bar project
 * switcher narrows it exactly as it narrows the dashboard.
 */
export default function BudgetVsActualReportPage() {
  const { showValues } = useAccess("reports");
  const { scope, assignedProjects, selectedProjectId } = useDashboardScope();

  const { data } = useRepositoryQuery<ProjectCard[]>(
    async () => (scope ? getProjectCards(scope) : []),
    [scope],
  );
  const rows = data ?? [];

  const budget = rows.reduce((s, r) => s + r.budget, 0);
  const actual = rows.reduce((s, r) => s + r.total_actual, 0);
  const spent = budget > 0 ? Math.round((actual / budget) * 100) : 0;

  const columns: Array<Column<ProjectCard>> = [
    {
      key: "project",
      header: "Project",
      primary: true,
      cell: (r) => (
        <Link href={r.href} className="underline-offset-4 hover:underline">
          {r.name}
        </Link>
      ),
    },
    {
      key: "budget",
      header: "Budget",
      align: "right",
      money: true,
      cell: (r) => formatInr(r.budget),
    },
    {
      key: "material",
      header: "Material issued",
      align: "right",
      money: true,
      cell: (r) => formatInr(r.material_actual),
    },
    {
      key: "certified",
      header: "Contractor certified",
      align: "right",
      money: true,
      cell: (r) => formatInr(r.certified_actual),
    },
    {
      key: "actual",
      header: "Actual",
      align: "right",
      money: true,
      cell: (r) => <span className="font-medium">{formatInr(r.total_actual)}</span>,
    },
    {
      key: "balance",
      header: "Balance",
      align: "right",
      money: true,
      cell: (r) => formatInr(r.variance),
    },
    {
      key: "spent",
      header: "% spent",
      align: "right",
      money: true,
      cell: (r) => (
        <span
          className={cn(
            r.spent_percent > 100
              ? "text-destructive"
              : r.spent_percent - r.percent_complete > 5 && "text-warning",
          )}
        >
          {formatPercent(r.spent_percent)}
        </span>
      ),
    },
    {
      key: "progress",
      header: "% complete",
      align: "right",
      cell: (r) => formatPercent(r.percent_complete),
    },
  ];

  const inView =
    selectedProjectId !== null
      ? (rows[0]?.name ?? "")
      : assignedProjects.length === 1
        ? assignedProjects[0].name
        : `All my projects (${rows.length})`;

  return (
    <ResourcePage
      resource="reports"
      title="Budget vs Actual"
      description="Budget is material allowance plus contractor work orders; actual is material issued plus contractor work certified. Open a project for the line-by-line view."
    >
      <div className="space-y-6">
        <SectionHeading
          title={inView}
          description={
            showValues && rows.length > 0
              ? `Budget ${formatInrCompact(budget)} · actual ${formatInrCompact(actual)} · ${spent}% spent`
              : undefined
          }
        />
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.project_id}
          showValues={showValues}
          emptyMessage="You are not posted to a project yet."
          caption={
            showValues
              ? "% spent turns amber when spending runs more than 5 points ahead of the work, red over budget."
              : undefined
          }
        />
      </div>
    </ResourcePage>
  );
}
