"use client";

import { useMemo, useState } from "react";
import { CalendarRange, LayoutList, Upload } from "lucide-react";
import { cn } from "cn";
import { PageHeader, HydrationGate } from "@/components/common";
import { GanttChart, ProgrammeImportDialog, ProgrammeList } from "@/components/programme";
import { useAccess, useProjectId, useProjectRows } from "@/lib/hooks";
import { Button } from "@/components/ui/button";

type View = "gantt" | "list";

/** A1/A4's dated programme — the bar chart every site task and work order runs against. */
export default function ProgrammePage() {
  const projectId = useProjectId();
  const access = useAccess("programme");
  const tasks = useProjectRows("programme_tasks", projectId);
  const [collapsedIds, setCollapsedIds] = useState<ReadonlySet<string>>(new Set());
  const [view, setView] = useState<View>("gantt");
  const [importOpen, setImportOpen] = useState(false);

  const sortedTasks = useMemo(
    () => [...tasks].sort((a, b) => a.sequence - b.sequence),
    [tasks],
  );

  function toggleCollapse(id: string) {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div>
      <PageHeader
        resource="programme"
        title={access.meta.label}
        description="The dated programme every site task and work order runs against."
        team={access.ownerTeam}
        outsideNav={access.outsideNav}
        owned={access.owned}
        actions={
          access.canCreate ? (
            <Button onClick={() => setImportOpen(true)}>
              <Upload className="size-4" /> Import programme
            </Button>
          ) : undefined
        }
      />

      <HydrationGate>
        {sortedTasks.length === 0 ? (
          <EmptyProgramme onImport={access.canCreate ? () => setImportOpen(true) : undefined} />
        ) : (
          <>
            {/* View toggle — only above the breakpoint where a Gantt means anything. */}
            <div className="mb-3 hidden items-center justify-end gap-1 md:flex">
              <Button
                type="button"
                size="sm"
                variant={view === "gantt" ? "default" : "outline"}
                onClick={() => setView("gantt")}
              >
                <CalendarRange className="size-3.5" /> Timeline
              </Button>
              <Button
                type="button"
                size="sm"
                variant={view === "list" ? "default" : "outline"}
                onClick={() => setView("list")}
              >
                <LayoutList className="size-3.5" /> List
              </Button>
            </div>

            {/* Below md, the timeline is always unusable — the list renders regardless of `view`. */}
            <div className="md:hidden">
              <ProgrammeList
                tasks={sortedTasks}
                collapsedIds={collapsedIds}
                onToggleCollapse={toggleCollapse}
              />
            </div>
            <div className={cn("hidden", "md:block")}>
              {view === "list" ? (
                <ProgrammeList
                  tasks={sortedTasks}
                  collapsedIds={collapsedIds}
                  onToggleCollapse={toggleCollapse}
                />
              ) : (
                <GanttChart
                  projectId={projectId ?? ""}
                  tasks={sortedTasks}
                  collapsedIds={collapsedIds}
                  onToggleCollapse={toggleCollapse}
                />
              )}
            </div>
          </>
        )}
      </HydrationGate>

      {projectId ? (
        <ProgrammeImportDialog projectId={projectId} open={importOpen} onOpenChange={setImportOpen} />
      ) : null}
    </div>
  );
}

function EmptyProgramme({ onImport }: { onImport?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-muted/20 px-6 py-12 text-center">
      <CalendarRange className="size-8 text-muted-foreground" />
      <p className="max-w-sm text-sm text-muted-foreground">
        Nothing is programmed yet. Import the construction programme, or set planned start and
        finish dates on the work-order activities in Site tasks, and the bars appear here.
      </p>
      {onImport ? (
        <Button onClick={onImport}>
          <Upload className="size-4" /> Import programme
        </Button>
      ) : null}
    </div>
  );
}
