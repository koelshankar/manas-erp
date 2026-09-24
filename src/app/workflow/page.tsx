"use client";

import { PageHeader } from "@/components/common";
import { NativeSelect } from "@/components/common";
import { WorkflowChart } from "@/components/project/workflow-chart";
import { Card } from "@/components/ui/card";
import { useActiveProject, useIsHydrated } from "@/lib/hooks";

/**
 * The client-approved workflow chart, live, for one project at a time.
 *
 * It used to sit on every project's Overview, but it is a whole-process view
 * rather than a project summary — so it has its own page, with the project
 * chosen here instead of by the route.
 *
 * The chart is one project at a time, so "All my projects" in the top bar
 * cannot apply; it falls back to the first project in the posting. The
 * picker here writes the same choice as the top bar, so the two always agree.
 */
export default function WorkflowPage() {
  const hydrated = useIsHydrated();
  const { projectId, options, setProjectId } = useActiveProject();

  return (
    <div>
      <PageHeader
        title="Workflow"
        description="The approved workflow, with live counts at every stage. Stages waiting on you are ringed; every box opens the page behind it."
        team="project_budget"
        actions={
          options.length > 1 ? (
            <label className="block sm:w-64">
              <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Project
              </span>
              <NativeSelect
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
              >
                {options.map((p) => (
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
