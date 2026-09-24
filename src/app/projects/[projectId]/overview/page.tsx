"use client";

import { useMemo } from "react";
import { projectOverviewLayoutFor, ROLE_LABEL } from "@/config/permissions";
import { TEAM_META } from "@/config/teams";
import { TEAM_STYLES } from "@/config/team-styles";
import { SectionHeading } from "@/components/common";
import { WidgetGrid } from "@/components/dashboard/dashboard";
import { useDashboardData } from "@/components/dashboard/use-dashboard-data";
import { ProjectAlerts } from "@/components/project/project-alerts";
import { Card } from "@/components/ui/card";
import { useAllRows, useIsHydrated, useProjectId } from "@/lib/hooks";
import { scopeFor } from "@/lib/services/queries";
import { useSession } from "@/lib/session";
import type { Material } from "@/lib/domain";
import { cn } from "cn";

/**
 * Where this project stands, from where the current role sits.
 *
 * It runs the same widgets and the same query services as the role dashboard,
 * with the scope narrowed to this one project — so a Site Engineer sees today's
 * tasks and deliveries here, and the HoD sees bills and budget, without either
 * screen knowing anything the other does not.
 */
export default function ProjectOverviewPage() {
  const projectId = useProjectId();
  const hydrated = useIsHydrated();
  const { role, team, user } = useSession();

  const layout = projectOverviewLayoutFor(role);
  // Narrowed to this project. `scopeFor` will not widen past the user's posting.
  const scope = useMemo(
    () => (user ? scopeFor(user, projectId) : null),
    [user, projectId],
  );
  const { data } = useDashboardData(scope, layout);

  const materials = useAllRows("materials") as Material[];
  const materialName = useMemo(() => {
    const byId = new Map(materials.map((m) => [m.id, m.name]));
    return (id: string) => byId.get(id) ?? "";
  }, [materials]);

  return (
    <div>
      <header className="mb-8">
        <p className="mb-2 flex flex-wrap items-center gap-2 text-sm">
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
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          This project as your role sees it — the same figures as your
          dashboard, narrowed to this site.
        </p>
      </header>

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

      <div className="mt-10">
        <SectionHeading
          title="Key alerts"
          description="What somebody should look at on this project today."
        />
        <ProjectAlerts />
      </div>
    </div>
  );
}
