"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/common";
import { NativeSelect } from "@/components/common";
import { WorkflowChart } from "@/components/project/workflow-chart";
import { Card } from "@/components/ui/card";
import { useDashboardScope, useIsHydrated } from "@/lib/hooks";

/**
 * The client-approved workflow chart, live, for one project at a time.
 *
 * It used to sit on every project's Overview, but it is a whole-process view
 * rather than a project summary — so it has its own page, with the project
 * chosen here instead of by the route.
 */
export default function WorkflowPage() {
  const hydrated = useIsHydrated();
  const { assignedProjects } = useDashboardScope();
  const [projectId, setProjectId] = useState<string | null>(null);

  // Settle on the first project the user is posted to, once the data is in.
  useEffect(() => {
    if (assignedProjects.length === 0) return;
    if (!projectId || !assignedProjects.some((p) => p.id === projectId)) {
      setProjectId(assignedProjects[0].id);
    }
  }, [assignedProjects, projectId]);

  return (
    <div>
      <PageHeader
        title="Workflow"
        description="The approved workflow, with live counts at every stage. Stages waiting on you are ringed; every box opens the page behind it."
        team="project_budget"
        actions={
          assignedProjects.length > 1 ? (
            <label className="block sm:w-64">
              <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Project
              </span>
              <NativeSelect
                value={projectId ?? ""}
                onChange={(e) => setProjectId(e.target.value)}
              >
                {assignedProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </NativeSelect>
            </label>
          ) : undefined
        }
      />

      {!hydrated ? (
        <Card className="h-96 animate-pulse bg-muted/40" aria-hidden />
      ) : projectId ? (
        <WorkflowChart projectId={projectId} />
      ) : (
        <Card className="px-5 py-10 text-center text-sm text-muted-foreground">
          You are not posted to a project yet, so there is no workflow to show.
        </Card>
      )}
    </div>
  );
}
