"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { TEAM_STYLES } from "@/config/team-styles";
import { useRepositoryQuery } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import { formatDate, formatInrCompact } from "@/lib/format";
import {
  getRecordTrail,
  type RecordTrail as Trail,
  type TrailEntityType,
  type TrailNode,
} from "@/lib/services/queries";
import { cn } from "cn";
import { statusLabel } from "./status-chip";

/**
 * The chain of records this one belongs to, upstream and down.
 *
 * Each chip is a link, coloured by the team that owns that step. Where a
 * position holds several records the chips collapse into one with a count and a
 * popover. Values are already blanked by the query for a role that may not see
 * them, so nothing has to be hidden here.
 */
export function RecordTrail({
  entityType,
  entityId,
  className,
}: {
  entityType: TrailEntityType;
  entityId: string;
  className?: string;
}) {
  const { role } = useSession();
  const { data } = useRepositoryQuery<Trail | null>(
    async () => (entityId ? getRecordTrail(entityType, entityId, role) : null),
    [entityType, entityId, role],
  );

  const steps = data?.steps ?? [];
  if (steps.length <= 1) return null;

  return (
    <nav
      aria-label="Record trail"
      className={cn(
        "flex flex-wrap items-center gap-x-1 gap-y-2 rounded-xl bg-muted/40 px-3 py-2.5",
        className,
      )}
    >
      {steps.map((step, i) => (
        <span key={step.key} className="flex items-center gap-1">
          {i > 0 ? (
            <ChevronRight
              className="size-3.5 shrink-0 text-muted-foreground/60"
              aria-hidden
            />
          ) : null}
          {step.nodes.length === 1 ? (
            <Chip
              node={step.nodes[0]}
              current={step.nodes[0].id === entityId}
            />
          ) : (
            <GroupChip
              label={step.label}
              nodes={step.nodes}
              current={step.nodes.some((n) => n.id === entityId)}
              currentId={entityId}
            />
          )}
        </span>
      ))}
    </nav>
  );
}

function chipClasses(node: TrailNode, current: boolean): string {
  return cn(
    "inline-flex max-w-[15rem] items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-shadow",
    TEAM_STYLES[node.team].tag,
    current ? "ring-2 shadow-sm" : "hover:shadow-sm",
  );
}

function Chip({ node, current }: { node: TrailNode; current: boolean }) {
  const body = (
    <>
      {node.step_code ? (
        <span className="font-mono text-[10px] opacity-80">
          {node.step_code}
        </span>
      ) : null}
      <span className="truncate">{node.number}</span>
      <span className="text-[10px] opacity-75">{statusLabel(node.status)}</span>
    </>
  );

  if (!node.href) {
    return (
      <span className={chipClasses(node, current)} title={node.context}>
        {body}
      </span>
    );
  }
  return (
    <Link
      href={node.href}
      className={chipClasses(node, current)}
      title={`${node.number} · ${statusLabel(node.status)}${node.context ? ` · ${node.context}` : ""}`}
      aria-current={current ? "page" : undefined}
    >
      {body}
    </Link>
  );
}

/** Several records at one position in the chain. */
function GroupChip({
  label,
  nodes,
  current,
  currentId,
}: {
  label: string;
  nodes: TrailNode[];
  current: boolean;
  currentId: string;
}) {
  const node = nodes[0];
  return (
    <Popover>
      <PopoverTrigger
        className={cn(chipClasses(node, current), "cursor-pointer")}
        aria-label={`${nodes.length} ${label}`}
      >
        {node.step_code ? (
          <span className="font-mono text-[10px] opacity-80">
            {node.step_code}
          </span>
        ) : null}
        <span className="truncate">{label}</span>
        <span className="rounded-full bg-background/70 px-1.5 text-[10px] font-semibold tabular-nums">
          {nodes.length}
        </span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-1">
        <p className="px-2 py-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          {label}
        </p>
        <ul className="max-h-64 overflow-y-auto">
          {nodes.map((n) => (
            <li key={n.id}>
              <Link
                href={n.href ?? "#"}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-muted",
                  n.id === currentId && "bg-muted font-medium",
                )}
              >
                <span className="font-mono">{n.number}</span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                  {n.context || statusLabel(n.status)}
                </span>
                {n.value !== undefined ? (
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {formatInrCompact(n.value)}
                  </span>
                ) : (
                  <span className="shrink-0 text-muted-foreground">
                    {formatDate(n.date)}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
