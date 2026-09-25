"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ArrowRight, CircleAlert, MessageSquare } from "lucide-react";
import { PageHeader, SectionHeading, StepCodeBadge } from "@/components/common";
import { Card } from "@/components/ui/card";
import { TEAM_STYLES } from "@/config/team-styles";
import { useRepositoryQuery } from "@/lib/hooks";
import { countOf, formatDate, formatInr } from "@/lib/format";
import {
  ageBand,
  getMyRequests,
  scopeFor,
  type MyRequest,
} from "@/lib/services/queries";
import { useSession } from "@/lib/session";
import { cn } from "cn";

/**
 * The inbox for the roles that raise work rather than approve it.
 *
 * A Site Engineer's indents and GRNs, a Purchase Officer's comparatives: what
 * stage each has reached, whose desk it is on and how long it has been there.
 * Anything sent back or rejected is pinned at the top with its comment, because
 * that is the only part of this list anybody has to do something about.
 */
export default function MyRequestsPage() {
  const { user, team } = useSession();

  const { data, loading } = useRepositoryQuery<MyRequest[]>(
    async () => (user ? getMyRequests(scopeFor(user)) : []),
    [user?.id],
  );
  const rows = useMemo(() => data ?? [], [data]);

  const attention = rows.filter((r) => r.attention !== null);
  const open = rows.filter((r) => r.attention === null && !r.settled);
  // History, so newest first, and only the latest few — the rest is in the
  // registers.
  const settledAll = rows
    .filter((r) => r.attention === null && r.settled)
    .sort((a, b) => b.since.localeCompare(a.since));
  const settled = settledAll.slice(0, SETTLED_SHOWN);

  return (
    <div>
      <PageHeader
        title="My requests"
        description="Everything you have put into the system, and who it is waiting on."
        team={team}
        owned
      />

      {loading ? (
        <Card className="h-40 animate-pulse bg-muted/40" aria-hidden />
      ) : rows.length === 0 ? (
        <Card className="px-6 py-10 text-center text-sm text-muted-foreground">
          You have not raised anything yet.
        </Card>
      ) : (
        <div className="space-y-10">
          {attention.length > 0 ? (
            <section>
              <SectionHeading
                title="Needs your attention"
                description="Sent back or rejected — these are waiting on you, not on anybody else."
              />
              <ul className="space-y-3">
                {attention.map((r) => (
                  <li key={r.id}>
                    <RequestRow request={r} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {open.length > 0 ? (
            <section>
              <SectionHeading
                title="In progress"
                description="Moving through the workflow. Oldest first."
              />
              <ul className="space-y-3">
                {open.map((r) => (
                  <li key={r.id}>
                    <RequestRow request={r} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {settled.length > 0 ? (
            <section>
              <SectionHeading
                title="Settled"
                description={
                  settledAll.length > settled.length
                    ? `Nothing further is expected. The latest ${settled.length} of ${settledAll.length}.`
                    : "Nothing further is expected."
                }
              />
              <ul className="space-y-3">
                {settled.map((r) => (
                  <li key={r.id}>
                    <RequestRow request={r} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}

const SETTLED_SHOWN = 6;

const AGE_TONE = {
  fresh: "text-muted-foreground",
  warn: "text-warning",
  late: "text-destructive",
} as const;

function RequestRow({ request }: { request: MyRequest }) {
  const style = TEAM_STYLES[request.team];
  // A settled request is history, not a wait; its age is never a warning.
  const band = request.settled ? "fresh" : ageBand(request.age_days);

  return (
    <Link href={request.href} className="group block">
      <Card
        className={cn(
          "flex flex-row flex-wrap items-center gap-x-4 gap-y-2 border-l-[3px] px-5 py-4 transition-shadow hover:shadow-pop",
          style.line,
          request.attention && "ring-1 ring-destructive/30",
        )}
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <StepCodeBadge
            codes={request.step_code ? [request.step_code] : []}
            team={request.team}
          />
          <div className="min-w-0">
            <p className="truncate font-mono text-sm font-medium">
              {request.document_number}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {[request.context, request.project_name]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </div>

        <div className="min-w-0">
          <p className="text-sm font-medium">{request.stage}</p>
          <p className="text-xs text-muted-foreground">
            {request.waiting_on
              ? `With ${request.waiting_on}`
              : "Nothing pending"}
          </p>
        </div>

        {request.value !== undefined ? (
          <p className="num text-sm font-medium">{formatInr(request.value)}</p>
        ) : null}

        <div className="text-right">
          <p className={cn("num text-sm font-medium", AGE_TONE[band])}>
            {request.age_days === 0 ? "today" : countOf(request.age_days, "day")}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatDate(request.since)}
          </p>
        </div>

        <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />

        {request.comment ? (
          <p className="flex w-full items-start gap-2 border-t border-border pt-3 text-xs text-muted-foreground italic">
            {request.attention ? (
              <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-destructive" />
            ) : (
              <MessageSquare className="mt-0.5 size-3.5 shrink-0" />
            )}
            “{request.comment}”
          </p>
        ) : null}
      </Card>
    </Link>
  );
}
