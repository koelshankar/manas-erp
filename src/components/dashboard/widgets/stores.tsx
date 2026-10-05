"use client";

import { ArrowLeftRight, DoorOpen } from "lucide-react";
import { WidgetCard, WidgetRow } from "../primitives";
import { AgeChip } from "@/components/common";
import { formatDate } from "@/lib/format";
import type { StoresOutstandingRow } from "@/lib/services/queries";
import { cn } from "cn";

/*
 * Stores widgets. Nothing here shows a rupee figure — the queries behind them
 * do not return one, so there is nothing for the screen to leak.
 */

/**
 * What has left the store and not been squared off.
 *
 * Both halves of a transfer are in it, and every returnable gate pass rather
 * than only the overdue ones: the storeman is the person who has to go and ask,
 * and a pass due back tomorrow is already his problem. The overdue ones carry
 * the one red mark on the panel.
 */
export function StoresOutstandingWidget({ rows }: { rows: StoresOutstandingRow[] }) {
  const overdue = rows.filter((r) => r.overdue).length;

  return (
    <WidgetCard
      title="Still out of the store"
      subtitle={
        overdue > 0
          ? `${overdue} past the date it was due back`
          : "Material out on a gate pass, and transfers in transit"
      }
      isEmpty={rows.length === 0}
      empty="Nothing is out of the store and unaccounted for."
    >
      <ul className="space-y-1">
        {rows.map((row) => (
          <li key={row.id}>
            <WidgetRow href={row.href}>
              {row.entity_type === "gate_pass" ? (
                <DoorOpen
                  className={cn(
                    "size-3.5 shrink-0",
                    row.overdue ? "text-destructive" : "text-muted-foreground",
                  )}
                  aria-hidden
                />
              ) : (
                <ArrowLeftRight
                  className="size-3.5 shrink-0 text-muted-foreground"
                  aria-hidden
                />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono text-xs">
                  {row.document_number}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {row.context}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {row.stage} · {formatDate(row.since)}
                </span>
              </span>
              <AgeChip days={row.age_days} />
            </WidgetRow>
          </li>
        ))}
      </ul>
    </WidgetCard>
  );
}
