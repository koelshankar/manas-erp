"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { TEAM_STYLES } from "@/config/team-styles";
import type { Team } from "@/lib/domain";
import type { Kpi } from "@/lib/services/queries";
import { cn } from "cn";

const TONE: Record<NonNullable<Kpi["tone"]>, string> = {
  neutral: "text-muted-foreground",
  good: "text-success",
  warn: "text-warning",
  bad: "text-destructive",
};

/**
 * Zero is never good news.
 *
 * "Certified this month: 0" rendered in success green because the query set
 * `tone: "good"` on a count that happened to be a count of nothing (audit C4).
 * A success tone now requires a positive figure; warning and destructive keep
 * their thresholds, because zero *is* the good outcome for those.
 */
function toneFor(kpi: Kpi): NonNullable<Kpi["tone"]> {
  const tone = kpi.tone ?? "neutral";
  if (tone !== "good") return tone;
  return isPositive(kpi.display) ? "good" : "neutral";
}

/** True when the pre-formatted display string carries a figure above zero. */
function isPositive(display: string): boolean {
  const digits = display.replace(/[^\d.]/g, "");
  return digits !== "" && Number(digits) > 0;
}

/** The KPI row. Each card links to where the number comes from. */
export function KpiRow({ kpis, team }: { kpis: Kpi[]; team: Team }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {kpis.map((kpi) => {
        const body = (
          <Card
            className={cn(
              "h-full border-l-[3px] px-5 py-5 transition-shadow",
              // The team shows as a 3px rule. The card itself stays neutral.
              TEAM_STYLES[team].line,
              kpi.href && "hover:shadow-pop",
            )}
          >
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {kpi.label}
            </p>
            <p
              className={cn(
                "num mt-3 text-3xl leading-none font-semibold tracking-tight",
                TONE[toneFor(kpi)] || "text-foreground",
              )}
            >
              {kpi.display}
            </p>
            {kpi.hint ? (
              <p className="mt-2 text-xs text-muted-foreground">{kpi.hint}</p>
            ) : null}
          </Card>
        );
        return kpi.href ? (
          <Link
            key={kpi.key}
            href={kpi.href}
            className="block focus-visible:outline-none"
          >
            {body}
          </Link>
        ) : (
          <div key={kpi.key}>{body}</div>
        );
      })}
    </div>
  );
}
