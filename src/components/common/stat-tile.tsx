import type { ReactNode } from "react";
import Link from "next/link";
import type { Team } from "@/lib/domain";
import { TEAM_STYLES } from "@/config/team-styles";
import { cn } from "cn";

/** Coloured dashboard tile. Backgrounds stay light; the team colour is the tint. */
export function StatTile({
  label,
  value,
  hint,
  team,
  href,
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  team: Team;
  href?: string;
  icon?: ReactNode;
}) {
  const body = (
    <div
      className={cn(
        "flex h-full flex-col gap-3 rounded-xl border-l-[3px] bg-card p-5 shadow-card ring-1 ring-border transition-shadow",
        TEAM_STYLES[team].line,
        href && "hover:shadow-pop",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {label}
        </p>
        {icon ? <span className="text-muted-foreground">{icon}</span> : null}
      </div>
      <p className="num text-3xl leading-none font-semibold tracking-tight text-foreground">
        {value}
      </p>
      {hint ? (
        <p className="mt-auto text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );

  return href ? (
    <Link href={href} className="block h-full focus-visible:outline-none">
      {body}
    </Link>
  ) : (
    body
  );
}

/** Small label/value pair used in pinned headers. */
export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-sm font-semibold tabular-nums text-foreground">
        {value}
      </dd>
    </div>
  );
}
