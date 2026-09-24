"use client";

import { useMemo } from "react";
import {
  dashboardLayoutFor,
  ROLE_LABEL,
  type DashboardSlot,
  type WidgetSize,
} from "@/config/permissions";
import { TEAM_META } from "@/config/teams";
import { TEAM_STYLES } from "@/config/team-styles";
import { useAllRows, useDashboardScope, useIsHydrated } from "@/lib/hooks";
import type { QueryScope } from "@/lib/services/queries";
import { useSession } from "@/lib/session";
import { Card } from "@/components/ui/card";
import { useDashboardData, type DashboardData } from "./use-dashboard-data";
import { SentBackBanner } from "./sent-back-banner";
import { WIDGET_REGISTRY } from "./widgets/registry";
import type { Material, Project, Team } from "@/lib/domain";
import { cn } from "cn";

/** Four columns from `lg`, two at `md`, one on a phone. */
const SPAN: Record<WidgetSize, string> = {
  sm: "md:col-span-1",
  md: "md:col-span-2 lg:col-span-2",
  lg: "md:col-span-2 lg:col-span-3",
  full: "md:col-span-2 lg:col-span-4",
};

/**
 * The role dashboard.
 *
 * The layout comes from permissions.ts, the components from the registry, and
 * every figure from a query service — this file only arranges them.
 */
export function Dashboard() {
  const { role, team, user } = useSession();
  const hydrated = useIsHydrated();
  const { scope, assignedProjects, selectedProjectId } = useDashboardScope();
  const { data } = useDashboardData(scope);
  const materials = useAllRows("materials") as Material[];

  const materialName = useMemo(() => {
    const byId = new Map(materials.map((m) => [m.id, m.name]));
    return (id: string) => byId.get(id) ?? "";
  }, [materials]);

  const layout = dashboardLayoutFor(role);

  return (
    <div>
      <header className="mb-8">
        <p className="mb-1 flex flex-wrap items-center gap-2 text-sm">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
              TEAM_STYLES[team].tag,
            )}
          >
            <span
              className={cn("size-1.5 rounded-full", TEAM_STYLES[team].dot)}
            />
            {TEAM_META[team].label}
          </span>
          <span className="text-muted-foreground">{ROLE_LABEL[role]}</span>
        </p>
        <h1 className="text-2xl leading-tight font-semibold tracking-tight sm:text-3xl">
          {hydrated
            ? `Good day, ${firstName(user?.full_name)}`
            : "Loading your day…"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {assignedProjects.length === 0
            ? "You are not posted to a project yet."
            : assignedProjects.length === 1
              ? `Posted to ${assignedProjects[0].name}`
              : postingLine(assignedProjects, selectedProjectId)}
        </p>
      </header>

      {/* Work that has come back outranks everything else on the page. */}
      <SentBackBanner />

      {!hydrated || !scope ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card
              key={i}
              className="h-28 animate-pulse bg-muted/50"
              aria-hidden
            />
          ))}
        </div>
      ) : (
        <WidgetGrid
          layout={layout}
          data={data}
          team={team}
          scope={scope}
          materialName={materialName}
        />
      )}
    </div>
  );
}

/**
 * The four-column widget grid. The role dashboard and the project Overview
 * both render through this, so a widget looks the same wherever it appears.
 */
export function WidgetGrid({
  layout,
  data,
  team,
  scope,
  materialName,
}: {
  layout: DashboardSlot[];
  data: DashboardData;
  team: Team;
  scope: QueryScope;
  materialName: (id: string) => string;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      {layout.map((slot) => {
        const Widget = WIDGET_REGISTRY[slot.widget_id];
        if (!Widget) return null;
        return (
          <div key={slot.widget_id} className={cn("min-w-0", SPAN[slot.size])}>
            {Widget({
              data,
              team,
              scope,
              emphasis: slot.emphasis,
              materialName,
            })}
          </div>
        );
      })}
    </div>
  );
}

/** The project switcher lives in the top bar; this line says what it holds. */
function postingLine(projects: Project[], selectedId: string | null): string {
  const selected = selectedId ? projects.find((p) => p.id === selectedId) : null;
  return selected
    ? `Showing ${selected.name} · posted to ${projects.length} projects`
    : `Showing all ${projects.length} of your projects`;
}

function firstName(full?: string | null): string {
  return (full ?? "there").split(" ")[0];
}
