"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { TEAM_META } from "@/config/teams";
import { TEAM_STYLES } from "@/config/team-styles";
import { useRepositoryQuery } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import {
  getFlowCounts,
  type FlowCount,
  type FlowCounts,
} from "@/lib/services/queries";
import type { Team } from "@/lib/domain";
import {
  CHART_EDGES,
  CHART_HEIGHT,
  CHART_NODES,
  CHART_WIDTH,
  MOBILE_GROUPS,
  NODE_H,
  NODE_W,
  type ChartEdge,
} from "./workflow-chart-layout";
import { cn } from "cn";

/**
 * Team accent per node. Boxes sit on the card ground with a neutral border;
 * the team shows only as the 3px rule down the left edge and on the step badge.
 */
const TEAM_ACCENT: Record<Team, string> = {
  project_budget: "var(--team-budget)",
  site_execution: "var(--team-site)",
  purchase_stores: "var(--team-purchase)",
  billing_certification: "var(--team-billing)",
  accounts: "var(--team-accounts)",
};

/** Width of that rule, in chart units. */
const ACCENT_W = 7;

const NODE_POS = new Map(CHART_NODES.map((n) => [n.id, n]));

/** Where an edge leaves one box and enters the next, given the waypoints. */
function edgePath(edge: ChartEdge): string {
  const from = NODE_POS.get(edge.from)!;
  const to = NODE_POS.get(edge.to)!;
  const fw = (from.w ?? NODE_W) / 2;
  const tw = (to.w ?? NODE_W) / 2;
  const h = NODE_H / 2;

  const points: Array<[number, number]> = [];
  const first = edge.via?.[0] ?? [to.x, to.y];

  // Leave the source box on whichever side the first waypoint lies.
  if (Math.abs(first[0] - from.x) > fw) {
    points.push([from.x + (first[0] > from.x ? fw : -fw), from.y]);
  } else {
    points.push([from.x, from.y + (first[1] > from.y ? h : -h)]);
  }

  (edge.via ?? []).forEach((p) => points.push(p));

  // Enter the target box from whichever side the last waypoint lies.
  const last = points[points.length - 1];
  if (Math.abs(last[0] - to.x) > tw) {
    points.push([to.x + (last[0] > to.x ? tw : -tw), to.y]);
  } else {
    points.push([to.x, to.y + (last[1] > to.y ? h : -h)]);
  }

  return points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p[0]} ${p[1]}`)
    .join(" ");
}

/** The left rule, with its top and bottom corners following the node radius. */
function accentPath(x: number, y: number): string {
  const r = 14;
  const h = NODE_H;
  return [
    `M ${x + r} ${y}`,
    `A ${r} ${r} 0 0 0 ${x} ${y + r}`,
    `L ${x} ${y + h - r}`,
    `A ${r} ${r} 0 0 0 ${x + r} ${y + h}`,
    `L ${x + ACCENT_W} ${y + h}`,
    `L ${x + ACCENT_W} ${y}`,
    "Z",
  ].join(" ");
}

function labelPoint(edge: ChartEdge): [number, number] {
  if (edge.labelAt) return edge.labelAt;
  const from = NODE_POS.get(edge.from)!;
  const to = NODE_POS.get(edge.to)!;
  return [(from.x + to.x) / 2, (from.y + to.y) / 2 - 10];
}

/**
 * The client-approved workflow chart, live.
 *
 * Same boxes, arrows and labels as the PDF, each carrying the number of records
 * sitting at that stage on this project. Nodes the current role can act on are
 * ringed; clicking any node opens the page behind it.
 */
export function WorkflowChart({ projectId }: { projectId: string }) {
  const { role } = useSession();
  const router = useRouter();

  const { data } = useRepositoryQuery<FlowCounts | null>(
    async () => (projectId ? getFlowCounts(projectId, role) : null),
    [projectId, role],
  );

  const nodes = data?.nodes;
  const actionable = data?.total_actionable ?? 0;

  const legend = useMemo(
    () =>
      (Object.keys(TEAM_META) as Team[]).map((team) => ({
        team,
        label: TEAM_META[team].label,
      })),
    [],
  );

  if (!nodes) {
    return <Card className="h-64 animate-pulse bg-muted/40" aria-hidden />;
  }

  return (
    <Card className="px-5 py-5">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Workflow</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {actionable > 0
              ? `${actionable} record${actionable === 1 ? " on this project is" : "s on this project are"} waiting on you — those stages are ringed.`
              : "Live counts at every stage of the approved workflow. Nothing on this project is waiting on you."}
          </p>
        </div>
        <ul className="flex flex-wrap gap-x-3 gap-y-1">
          {legend.map((l) => (
            <li
              key={l.team}
              className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"
            >
              <span
                className={cn("size-2 rounded-full", TEAM_STYLES[l.team].dot)}
              />
              {l.label}
            </li>
          ))}
        </ul>
      </header>

      {/* Diagram, from md up */}
      <div className="hidden overflow-x-auto md:block">
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          className="h-auto w-full min-w-[900px]"
          role="img"
          aria-label="Live workflow chart"
        >
          <defs>
            <marker
              id="wf-arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-border)" />
            </marker>
          </defs>

          {CHART_EDGES.map((edge) => {
            const [lx, ly] = labelPoint(edge);
            return (
              <g key={`${edge.from}-${edge.to}`}>
                <path
                  d={edgePath(edge)}
                  fill="none"
                  stroke="var(--color-border)"
                  strokeWidth={3}
                  strokeOpacity={edge.dashed ? 0.8 : 1}
                  strokeDasharray={edge.dashed ? "10 8" : undefined}
                  markerEnd="url(#wf-arrow)"
                />
                {edge.label ? (
                  <text
                    x={lx}
                    y={ly}
                    textAnchor={edge.labelAnchor ?? "middle"}
                    className="fill-foreground text-[20px] font-semibold"
                  >
                    {edge.label.split(" ").length > 4 ? (
                      <>
                        <tspan x={lx} dy="0">
                          {edge.label.split(" ").slice(0, 3).join(" ")}
                        </tspan>
                        <tspan x={lx} dy="24">
                          {edge.label.split(" ").slice(3).join(" ")}
                        </tspan>
                      </>
                    ) : (
                      edge.label
                    )}
                  </text>
                ) : null}
              </g>
            );
          })}

          {CHART_NODES.map((pos) => {
            const node = nodes[pos.id];
            const w = pos.w ?? NODE_W;
            const accent = TEAM_ACCENT[node.team];
            const isActive = node.actionable > 0;
            return (
              <g
                key={pos.id}
                onClick={() => router.push(node.href)}
                className="cursor-pointer"
                role="link"
                aria-label={`${node.label} — ${node.count_label}`}
              >
                {isActive ? (
                  <rect
                    x={pos.x - w / 2 - 7}
                    y={pos.y - NODE_H / 2 - 7}
                    width={w + 14}
                    height={NODE_H + 14}
                    rx={20}
                    fill="none"
                    stroke="var(--color-primary)"
                    strokeWidth={4}
                    strokeOpacity={0.5}
                  />
                ) : null}
                <rect
                  x={pos.x - w / 2}
                  y={pos.y - NODE_H / 2}
                  width={w}
                  height={NODE_H}
                  rx={14}
                  fill="var(--color-card)"
                  stroke={
                    isActive ? "var(--color-primary)" : "var(--color-border)"
                  }
                  strokeWidth={isActive ? 3 : 2}
                  className="transition-[stroke-width]"
                />
                {/* The team accent: a 3px rule down the left edge, clipped to the corner radius. */}
                <path
                  d={accentPath(pos.x - w / 2, pos.y - NODE_H / 2)}
                  fill={accent}
                />
                <text
                  // Shifted left of centre when a step badge sits top-right,
                  // so a long title never runs into it.
                  x={
                    pos.x + ACCENT_W / 2 - (node.step_codes.length > 0 ? 16 : 0)
                  }
                  y={pos.y - 6}
                  textAnchor="middle"
                  className="text-[23px] font-semibold"
                  fill="var(--color-foreground)"
                >
                  {node.label}
                </text>
                <text
                  x={pos.x + ACCENT_W / 2}
                  y={pos.y + 22}
                  textAnchor="middle"
                  className="text-[18px]"
                  fill="var(--color-muted-foreground)"
                >
                  {node.count_label}
                  {node.value_label ? ` · ${node.value_label}` : ""}
                </text>
                {node.step_codes.length > 0 ? (
                  <text
                    x={pos.x + w / 2 - 10}
                    y={pos.y - NODE_H / 2 + 20}
                    textAnchor="end"
                    className="text-[15px] font-bold"
                    fill={accent}
                  >
                    {node.step_codes.length > 1
                      ? `${node.step_codes[0]}–${node.step_codes[node.step_codes.length - 1]}`
                      : node.step_codes[0]}
                  </text>
                ) : null}
                {isActive ? (
                  <>
                    <circle
                      cx={pos.x - w / 2 + 4}
                      cy={pos.y - NODE_H / 2 + 4}
                      r={17}
                      fill="var(--color-primary)"
                    />
                    <text
                      x={pos.x - w / 2 + 4}
                      y={pos.y - NODE_H / 2 + 11}
                      textAnchor="middle"
                      className="text-[19px] font-bold"
                      fill="var(--color-primary-foreground)"
                    >
                      {node.actionable}
                    </text>
                  </>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Below md: the same stages as a list, grouped by team */}
      <div className="space-y-5 md:hidden">
        {MOBILE_GROUPS.map((group) => (
          <section key={group.label}>
            <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              <span
                className={cn(
                  "size-2 rounded-full",
                  TEAM_STYLES[nodes[group.ids[0]].team].dot,
                )}
              />
              {group.label}
            </h3>
            <ul className="space-y-1.5">
              {group.ids.map((id) => (
                <li key={id}>
                  <FlowListRow node={nodes[id]} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Card>
  );
}

function FlowListRow({ node }: { node: FlowCount }) {
  const style = TEAM_STYLES[node.team];
  return (
    <Link
      href={node.href}
      className={cn(
        "flex items-center gap-3 rounded-xl border-l-[3px] bg-card px-3 py-2.5 ring-1 ring-border transition-shadow hover:shadow-card",
        style.line,
        node.actionable > 0 && "ring-primary/50",
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">
          {node.label}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {node.count_label}
          {node.value_label ? ` · ${node.value_label}` : ""}
        </span>
      </span>
      {node.step_codes.length > 0 ? (
        <span className={cn("font-mono text-[10px] font-semibold", style.text)}>
          {node.step_codes.length > 1
            ? `${node.step_codes[0]}–${node.step_codes[node.step_codes.length - 1]}`
            : node.step_codes[0]}
        </span>
      ) : null}
      {node.actionable > 0 ? (
        <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-warning px-1.5 text-[11px] font-semibold text-warning-foreground tabular-nums">
          {node.actionable}
        </span>
      ) : null}
    </Link>
  );
}
