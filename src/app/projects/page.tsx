"use client";

import Link from "next/link";
import { ChevronRight, MapPin } from "lucide-react";
import type { Project } from "@/lib/domain";
import { useAccess, useDashboardScope, useRepositoryQuery } from "@/lib/hooks";
import { getProjectCards, scopeFor, type ProjectCard } from "@/lib/services/queries";
import { PageHeader, StatusPill, HydrationGate, EmptyState } from "@/components/common";
import { Card } from "@/components/ui/card";
import { formatInrCompact } from "@/lib/format";
import { ageInDays } from "@/lib/clock";
import { cn } from "cn";

/**
 * The real landing page.
 *
 * Navigation is spatial: you get to a screen by picking the site it belongs
 * to, not by switching to the role that owns it. So this card has to answer
 * "which project needs me?" on its own — what it is, how far along, how much
 * of the budget is gone, what is queued, and whether it has gone quiet.
 *
 * Built at 390px first: one column of cards on a phone, two from `md`, three
 * from `xl`. A value-blind role's payload has no budget in it at all (the
 * query strips it), so those cards simply carry one figure fewer.
 */
export default function ProjectsPage() {
  const access = useAccess("projects");
  // Only the sites the user is posted to. `assigned_project_ids` is the posting;
  // a purchase or management role is posted to the whole portfolio anyway.
  const { assignedProjects, user } = useDashboardScope();
  const projects = assignedProjects as Project[];

  // Budget and actual come from the same roll-up as the dashboard, over the
  // whole posting: this page is where a project is picked, so the top-bar
  // filter does not narrow it. A value-blind role gets the cards without them.
  const { data: cards } = useRepositoryQuery<ProjectCard[]>(
    async () => (user ? getProjectCards(scopeFor(user)) : []),
    [user],
  );
  const figures = new Map((cards ?? []).map((c) => [c.project_id, c]));

  return (
    <div>
      <PageHeader
        title="Projects"
        description={
          projects.length === 1
            ? "The site you are posted to. Open it to reach its workspace."
            : "The sites you are posted to. Open a project to reach its workspace."
        }
        team={access.ownerTeam}
        outsideNav={access.outsideNav}
        owned={access.owned}
      />
      <HydrationGate rows={3}>
        {projects.length === 0 ? (
          <EmptyState message="You are not posted to a project yet. A project appears here once you are assigned to it in Masters." />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {projects.map((p) => (
              <ProjectRow key={p.id} project={p} card={figures.get(p.id)} />
            ))}
          </div>
        )}
      </HydrationGate>
    </div>
  );
}

function ProjectRow({ project: p, card }: { project: Project; card?: ProjectCard }) {
  const showsMoney = card?.budget !== undefined;

  return (
    <Link
      href={`/projects/${p.id}/overview`}
      className="group rounded-xl focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <Card className="flex h-full flex-col px-5 py-5 transition-shadow hover:shadow-pop">
        {/* Identity */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs tracking-wide text-muted-foreground">
                {p.code}
              </span>
              <StatusPill status={p.status} />
            </div>
            <h2 className="truncate text-lg leading-tight font-semibold tracking-tight">
              {p.name}
            </h2>
            <p className="mt-1 truncate text-sm text-muted-foreground">
              {card?.client_name ?? p.client_name}
            </p>
            <p className="mt-0.5 flex items-center gap-1.5 truncate text-sm text-muted-foreground">
              <MapPin className="size-3.5 shrink-0" />
              {p.location}
            </p>
          </div>
          <ChevronRight className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </div>

        {/* Progress, against spend where the reader may see it. Showing the two
            together is the point: 62% built on 78% of the budget is the thing
            a manager is scanning this page for. */}
        <div className="mt-5">
          <div className="mb-1.5 flex items-baseline justify-between text-sm">
            <span className="text-muted-foreground">Progress</span>
            <span className="num font-semibold">{p.percent_complete}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-foreground/70"
              style={{ width: `${p.percent_complete}%` }}
            />
          </div>
          {showsMoney ? (
            <p className="mt-2 text-sm text-muted-foreground">
              <span className="num font-medium text-foreground">
                {formatInrCompact(card.total_actual)}
              </span>{" "}
              of <span className="num">{formatInrCompact(card.budget)}</span> spent
              <span
                className={cn(
                  "num ml-1.5 font-medium",
                  card.spent_percent > 100
                    ? "text-destructive"
                    : card.spent_percent > p.percent_complete + 15
                      ? "text-warning"
                      : "text-muted-foreground",
                )}
              >
                ({card.spent_percent}%)
              </span>
            </p>
          ) : null}
        </div>

        {/* What is queued, and whether the site has gone quiet. */}
        <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-border pt-4 text-sm">
          <Figure label="Open indents" value={card?.open_indents ?? 0} />
          <Figure
            label="Pending approvals"
            value={card?.pending_approvals ?? 0}
            tone={(card?.pending_approvals ?? 0) > 0 ? "warning" : undefined}
          />
          <div className="min-w-0">
            <dt className="truncate text-muted-foreground">Last activity</dt>
            <dd className="num mt-0.5 font-semibold">{sinceLabel(card?.last_activity)}</dd>
          </div>
        </dl>
      </Card>
    </Link>
  );
}

function Figure({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "warning";
}) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "num mt-0.5 font-semibold",
          // Zero is never a warning here — nothing queued is the good outcome.
          tone === "warning" && "text-warning",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/** "Today", "3d ago", "—" — enough to tell a live site from a stalled one. */
function sinceLabel(stamp: string | null | undefined): string {
  if (!stamp) return "—";
  const days = ageInDays(stamp);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days}d ago`;
}
