"use client";

import Link from "next/link";
import {
  ResourcePage,
  DataTable,
  SectionHeading,
  type Column,
} from "@/components/common";
import { useAccess, useAllRows } from "@/lib/hooks";
import { formatInr, formatInrCompact, formatPercent } from "@/lib/format";
import type { BoqLine, Project } from "@/lib/domain";

type ProjectRow = {
  project: Project;
  budget: number;
  certified: number;
};

export default function BudgetVsActualReportPage() {
  const projects = useAllRows("projects") as Project[];
  const boq = useAllRows("boq_lines") as BoqLine[];
  const { showValues } = useAccess("reports");

  const rows: ProjectRow[] = projects.map((p) => {
    const lines = boq.filter((l) => l.project_id === p.id);
    return {
      project: p,
      budget: lines.reduce((s, l) => s + l.amount, 0),
      certified: lines.reduce((s, l) => s + l.certified_amount, 0),
    };
  });

  const columns: Array<Column<ProjectRow>> = [
    {
      key: "project",
      header: "Project",
      primary: true,
      cell: (r) => (
        <Link
          href={`/projects/${r.project.id}/budget/budget-vs-actual`}
          className="underline-offset-4 hover:underline"
        >
          {r.project.name}
        </Link>
      ),
    },
    {
      key: "location",
      header: "Location",
      secondary: true,
      cell: (r) => r.project.location,
    },
    {
      key: "budget",
      header: "BOQ budget",
      align: "right",
      money: true,
      cell: (r) => formatInr(r.budget),
    },
    {
      key: "certified",
      header: "Certified",
      align: "right",
      money: true,
      cell: (r) => formatInr(r.certified),
    },
    {
      key: "balance",
      header: "Balance",
      align: "right",
      money: true,
      cell: (r) => formatInr(r.budget - r.certified),
    },
    {
      key: "used",
      header: "% used",
      align: "right",
      money: true,
      cell: (r) =>
        formatPercent(r.budget > 0 ? (r.certified / r.budget) * 100 : 0, 1),
    },
    {
      key: "progress",
      header: "% complete",
      align: "right",
      cell: (r) => formatPercent(r.project.percent_complete),
    },
  ];

  return (
    <ResourcePage
      resource="reports"
      title="Budget vs Actual"
      description="Portfolio roll-up. Open a project to see the same comparison line by line."
    >
      <div className="space-y-6">
        <SectionHeading
          title="All projects"
          description={`Total budget ${formatInrCompact(rows.reduce((s, r) => s + r.budget, 0))}.`}
        />
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.project.id}
          showValues={showValues}
          emptyMessage="No projects to report on."
        />
      </div>
    </ResourcePage>
  );
}
