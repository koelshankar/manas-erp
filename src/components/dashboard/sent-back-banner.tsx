"use client";

import Link from "next/link";
import { ArrowRight, Undo2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { AgeChip, StepCodeBadge } from "@/components/common";
import { getMyRequests, scopeFor, type MyRequest } from "@/lib/services/queries";
import { useRepositoryQuery } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import { countOf } from "@/lib/format";
import { cn } from "cn";

/**
 * Work that has come back, at the top of the dashboard.
 *
 * A sent-back indent is the only thing on a Site Engineer's screen that has
 * already cost somebody a round trip, and the reason it came back is the one
 * fact they need. It used to live only in My Requests, one click away, with
 * the comment hidden behind opening the record (audit, group 12). Now it is
 * the first thing on the dashboard, the bell and the list, with the comment
 * readable in all three.
 */
export function SentBackBanner() {
  const { user } = useSession();

  const { data } = useRepositoryQuery<MyRequest[]>(
    async () => {
      if (!user) return [];
      const mine = await getMyRequests(scopeFor(user));
      return mine.filter((m) => m.attention !== null);
    },
    [user?.id, user?.role],
  );

  const rows = data ?? [];
  if (rows.length === 0) return null;

  const rejected = rows.filter((r) => r.attention === "rejected").length;

  return (
    <Card className="mb-6 border-l-[3px] border-l-destructive px-5 py-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-center gap-2">
          <Undo2 className="size-4 text-destructive" />
          <h2 className="text-base font-semibold text-foreground">
            {countOf(rows.length, "item")} came back to you
          </h2>
        </div>
        <p className="text-sm text-muted-foreground">
          {rejected > 0
            ? `${countOf(rejected, "was", "were")} rejected outright.`
            : "Fix what is noted and resubmit."}
        </p>
      </div>

      <ul className="divide-y divide-border/60">
        {rows.slice(0, 5).map((r) => (
          <li key={r.id}>
            <Link
              href={r.href}
              className="-mx-2 block rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/50"
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <StepCodeBadge codes={r.step_code ? [r.step_code] : []} team={r.team} />
                <span className="font-mono text-xs">{r.document_number}</span>
                <span
                  className={cn(
                    "text-sm font-medium",
                    r.attention === "rejected" ? "text-destructive" : "text-warning",
                  )}
                >
                  {r.attention === "rejected" ? "Rejected" : "Sent back"}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                  {r.context} · {r.project_name}
                </span>
                <AgeChip days={r.age_days} verb="waiting" />
                <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
              </div>
              {/* The reason, without having to open the record. */}
              {r.comment ? (
                <p className="mt-1 text-sm leading-snug text-muted-foreground italic">
                  “{r.comment}”
                </p>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>

      {rows.length > 5 ? (
        <Link
          href="/my-requests"
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          {countOf(rows.length - 5, "more item")} in My Requests
          <ArrowRight className="size-3" />
        </Link>
      ) : null}
    </Card>
  );
}
