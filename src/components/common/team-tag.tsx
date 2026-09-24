import type { Team } from "@/lib/domain";
import { TEAM_META } from "@/config/teams";
import { TEAM_STYLES } from "@/config/team-styles";
import { cn } from "cn";

/** "Owned by Purchase & Stores" — printed on every page another team owns. */
export function OwnerTag({
  team,
  owned = false,
  className,
}: {
  team: Team;
  /** True when the current role belongs to this team (no "Owned by" prefix). */
  owned?: boolean;
  className?: string;
}) {
  const meta = TEAM_META[team];
  const style = TEAM_STYLES[team];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        style.tag,
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", style.dot)} aria-hidden />
      {owned ? meta.short : `Owned by ${meta.short}`}
    </span>
  );
}

export function TeamDot({
  team,
  className,
}: {
  team: Team;
  className?: string;
}) {
  return (
    <span
      className={cn("size-2 rounded-full", TEAM_STYLES[team].dot, className)}
      aria-hidden
    />
  );
}
