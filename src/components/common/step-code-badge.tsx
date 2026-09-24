import type { StepCode, Team } from "@/lib/domain";
import { STEP_LABELS } from "@/config/teams";
import { TEAM_STYLES } from "@/config/team-styles";
import { cn } from "cn";

/**
 * Renders the step codes exactly as they appear on the client-approved
 * workflow chart. Consecutive codes collapse to a range, e.g. "B3–B4".
 */
export function StepCodeBadge({
  codes,
  team,
  className,
}: {
  codes: StepCode[];
  team: Team;
  className?: string;
}) {
  if (codes.length === 0) return null;
  const label =
    codes.length > 1 ? `${codes[0]}–${codes[codes.length - 1]}` : codes[0];
  const title = codes.map((c) => `${c} · ${STEP_LABELS[c]}`).join("\n");
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 font-mono text-xs font-semibold tracking-wide",
        TEAM_STYLES[team].tag,
        className,
      )}
    >
      {label}
    </span>
  );
}
