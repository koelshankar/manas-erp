"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import {
  getActionItems,
  getMyRequests,
  scopeFor,
  type ActionItem,
  type MyRequest,
} from "@/lib/services/queries";
import { useRepositoryQuery } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { StepCodeBadge } from "@/components/common/step-code-badge";
import { formatDate } from "@/lib/format";
import { cn } from "cn";

type Notice = {
  id: string;
  title: string;
  context: string;
  since: string;
  href: string;
  tone: "warning" | "destructive";
  step: ActionItem["step_code"];
  team: ActionItem["team"];
};

/**
 * Two things wake a person up: work that is waiting on them, and their own
 * work that has come back. The bell pools both, newest trouble first, and
 * every line is a link to the record.
 */
export function NotificationBell() {
  const { user } = useSession();

  const { data } = useRepositoryQuery<Notice[]>(async () => {
    if (!user) return [];
    const scope = scopeFor(user);
    const [actions, mine] = await Promise.all([
      getActionItems(scope),
      getMyRequests(scope),
    ]);

    const actionable: Notice[] = (actions as ActionItem[])
      .filter((a) => !a.read_only)
      .map((a) => ({
        id: `a:${a.id}`,
        title: a.label,
        context: `${a.document_number} · ${a.project_name}`,
        since: a.since,
        href: a.href,
        tone: "warning" as const,
        step: a.step_code,
        team: a.team,
      }));

    const sentBack: Notice[] = (mine as MyRequest[])
      .filter((m) => m.attention !== null)
      .map((m) => ({
        id: `m:${m.id}`,
        title:
          m.attention === "rejected"
            ? "Rejected — needs rework"
            : "Sent back to you",
        context: `${m.document_number} · ${m.project_name}`,
        since: m.since,
        href: m.href,
        tone: "destructive" as const,
        step: m.step_code,
        team: m.team,
      }));

    // What came back first: it has already cost someone a round trip.
    return [...sentBack, ...actionable];
  }, [user?.id]);

  const notices = data ?? [];

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Notifications"
            className="relative"
          >
            <Bell className="size-4" />
            {notices.length > 0 ? (
              <span
                className={cn(
                  "num absolute -top-0.5 -right-0.5 inline-flex min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold",
                  notices.some((n) => n.tone === "destructive")
                    ? "bg-destructive text-destructive-foreground"
                    : "bg-warning text-warning-foreground",
                )}
              >
                {notices.length > 99 ? "99+" : notices.length}
              </span>
            ) : null}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-[22rem] p-0">
        <div className="border-b border-border px-4 py-2.5">
          <p className="text-sm font-semibold">Needs your attention</p>
        </div>
        {notices.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            Nothing is waiting on you. Anything sent back to you will show up
            here.
          </p>
        ) : (
          <ul className="max-h-[22rem] overflow-y-auto">
            {notices.slice(0, 20).map((n) => (
              <li
                key={n.id}
                className="border-b border-border/60 last:border-0"
              >
                <Link
                  href={n.href}
                  className="block px-4 py-2.5 transition-colors hover:bg-muted"
                >
                  <div className="flex items-baseline gap-2">
                    <StepCodeBadge
                      codes={n.step ? [n.step] : []}
                      team={n.team}
                    />
                    <span
                      className={cn(
                        "flex-1 text-sm font-medium",
                        n.tone === "destructive"
                          ? "text-destructive"
                          : "text-foreground",
                      )}
                    >
                      {n.title}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {n.context} · since {formatDate(n.since)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
