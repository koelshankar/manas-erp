"use client";

import { WidgetCard, WidgetRow } from "../primitives";
import { TeamDot } from "@/components/common";
import type { ActivityEntry } from "@/lib/services/queries";

/**
 * What this user did lately — the fourth panel on My work.
 *
 * The other three are queues: things waiting on you. This is the way back to
 * something you filed and now want to correct, which otherwise means
 * remembering which list it landed in and going to find it.
 */
export function RecentActivityWidget({ rows }: { rows: ActivityEntry[] }) {
  return (
    <WidgetCard
      title="Your recent activity"
      subtitle="What you last recorded or decided."
      isEmpty={rows.length === 0}
      empty="Nothing recorded yet. Anything you raise, post or approve shows up here."
    >
      <ul className="divide-y divide-border/60">
        {rows.map((r) => (
          <li key={r.id}>
            <WidgetRow href={r.href} className="min-h-11">
              <TeamDot team={r.team} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{r.action}</span>
                <span className="block truncate text-sm text-muted-foreground">
                  <span className="font-mono text-xs">{r.document_number}</span>
                  {r.project_name ? <> · {r.project_name}</> : null}
                </span>
              </span>
              <span className="num shrink-0 text-sm text-muted-foreground">
                {sinceLabel(r.age_days)}
              </span>
            </WidgetRow>
          </li>
        ))}
      </ul>
    </WidgetCard>
  );
}

function sinceLabel(days: number): string {
  if (days <= 0) return "Today";
  if (days === 1) return "1d";
  return `${days}d`;
}
