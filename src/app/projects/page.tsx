"use client";

import Link from "next/link";
import { ArrowRight, MapPin } from "lucide-react";
import type { Project } from "@/lib/domain";
import { useAccess, useDashboardScope } from "@/lib/hooks";
import { PageHeader, StatusPill, HydrationGate } from "@/components/common";
import { Card } from "@/components/ui/card";
import { formatDate, formatInrCompact } from "@/lib/format";
import { TEAM_STYLES } from "@/config/team-styles";
import { cn } from "cn";

export default function ProjectsPage() {
  const access = useAccess("projects");
  // Only the sites the user is posted to. `assigned_project_ids` is the posting;
  // a purchase or management role is posted to the whole portfolio anyway.
  const { assignedProjects } = useDashboardScope();
  const projects = assignedProjects as Project[];

  return (
    <div>
      <PageHeader
        title="Projects"
        description={
          projects.length === 1
            ? "The site you are posted to. Open it to reach its workspaces."
            : "The sites you are posted to. Open a project to reach its workspaces."
        }
        team={access.ownerTeam}
        outsideNav={access.outsideNav}
        owned={access.owned}
      />
      <HydrationGate rows={3}>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {projects.length === 0 ? (
            <Card className="px-6 py-10 text-center text-sm text-muted-foreground md:col-span-2 xl:col-span-3">
              You are not posted to a project yet.
            </Card>
          ) : null}
          {projects.map((p) => (
            <Link
              key={p.id}
              href={`/projects/${p.id}/overview`}
              className="group"
            >
              <Card className="h-full px-6 py-6 transition-shadow hover:shadow-pop">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="font-mono text-[11px] tracking-wide text-muted-foreground">
                        {p.code}
                      </span>
                      <StatusPill status={p.status} />
                    </div>
                    <h2 className="truncate text-lg leading-tight font-semibold tracking-tight">
                      {p.name}
                    </h2>
                    <p className="mt-1 flex items-center gap-1.5 truncate text-sm text-muted-foreground">
                      <MapPin className="size-3.5 shrink-0" />
                      {p.location}
                    </p>
                  </div>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </div>

                <dl className="mt-6 grid grid-cols-2 gap-4">
                  <div>
                    <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">
                      Budget
                    </dt>
                    <dd className="mt-0.5 text-sm font-semibold tabular-nums">
                      {formatInrCompact(p.budget_amount)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">
                      Spent
                    </dt>
                    <dd className="mt-0.5 text-sm font-semibold tabular-nums">
                      {formatInrCompact(p.spent_amount)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">
                      Started
                    </dt>
                    <dd className="mt-0.5 text-sm tabular-nums">
                      {formatDate(p.start_date)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">
                      Target
                    </dt>
                    <dd className="mt-0.5 text-sm tabular-nums">
                      {formatDate(p.target_completion_date)}
                    </dd>
                  </div>
                </dl>

                <div className="mt-6">
                  <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
                    <span>Progress</span>
                    <span className="tabular-nums">{p.percent_complete}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        TEAM_STYLES.project_budget.bar,
                      )}
                      style={{ width: `${p.percent_complete}%` }}
                    />
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </HydrationGate>
    </div>
  );
}
