"use client";

import { Check, Clock, Minus, X } from "lucide-react";
import {
  APPROVAL_CHAINS,
  ROLE_LABEL,
  type ApprovalStepSpec,
} from "@/config/permissions";
import { TEAM_STYLES } from "@/config/team-styles";
import { useLookups } from "@/lib/hooks";
import { formatDateTime } from "@/lib/format";
import type { Approval } from "@/lib/domain";
import { cn } from "cn";

/**
 * The C3–C4 chain across the top of a bill: who has acted, when, and what they
 * said. The Project Head's step is marked as the cross-team one and carries the
 * Project & Budget purple, because that is the only step another team holds.
 */
export function ChainTracker({ approvals }: { approvals: Approval[] }) {
  const lookup = useLookups();
  const bySequence = new Map(approvals.map((a) => [a.sequence, a]));
  const firstPending = [...approvals]
    .filter((a) => a.status === "pending")
    .sort((a, b) => a.sequence - b.sequence)[0];

  return (
    <ol className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
      {(APPROVAL_CHAINS.ra_bill as readonly ApprovalStepSpec[]).map(
        (step, i) => {
          const row = bySequence.get(step.sequence);
          const state = !row
            ? "not_started"
            : row.status === "approved"
              ? "done"
              : row.status === "rejected"
                ? "stopped"
                : firstPending?.sequence === step.sequence
                  ? "current"
                  : "waiting";
          const Icon =
            state === "done"
              ? Check
              : state === "stopped"
                ? X
                : state === "current"
                  ? Clock
                  : Minus;

          return (
            <li key={step.sequence} className="min-w-0 flex-1">
              <div
                className={cn(
                  "h-full rounded-xl px-3.5 py-3 ring-1",
                  state === "done" &&
                    "bg-success-soft text-success ring-success/30",
                  state === "current" &&
                    "bg-warning-soft text-warning ring-warning/30",
                  state === "stopped" &&
                    "bg-danger-soft text-destructive ring-destructive/30",
                  (state === "waiting" || state === "not_started") &&
                    "bg-muted/50 text-muted-foreground ring-border",
                )}
              >
                <div className="mb-1 flex items-center gap-1.5">
                  <Icon className="size-3.5 shrink-0" />
                  <span className="font-mono text-[11px] font-semibold">
                    {step.step_code}
                  </span>
                  <span className="text-[11px] opacity-70">Step {i + 1}</span>
                </div>
                <p className="text-sm font-medium">
                  {ROLE_LABEL[step.required_role]}
                </p>
                {step.cross_team ? (
                  <p
                    className={cn(
                      "mt-1 inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                      TEAM_STYLES.project_budget.tag,
                    )}
                  >
                    Cross-team verification — Project &amp; Budget
                  </p>
                ) : null}
                {row?.acted_at ? (
                  <p className="mt-1 text-[11px] opacity-80">
                    {lookup.user(row.actor_user_id)} ·{" "}
                    {formatDateTime(row.acted_at)}
                  </p>
                ) : state === "current" ? (
                  <p className="mt-1 text-[11px] opacity-80">
                    Waiting on this step
                  </p>
                ) : null}
                {row?.comment ? (
                  <p className="mt-1 text-[11px] italic opacity-80">
                    “{row.comment}”
                  </p>
                ) : null}
              </div>
            </li>
          );
        },
      )}
    </ol>
  );
}
