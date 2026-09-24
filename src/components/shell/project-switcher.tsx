"use client";

import { Building2, Check, ChevronDown } from "lucide-react";
import { cn } from "cn";
import { ALL_PROJECTS, useActiveProject } from "@/lib/hooks";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Which site the bar's project pages point at, or all of them.
 *
 * Only shown to a role posted to more than one project; Site Engineer and
 * Project QS sit on one site and never see it. "All my projects" is the
 * default, and it widens every list rather than narrowing it.
 */
export function ProjectSwitcher() {
  const { project, options, selection, setProjectId, isAll } = useActiveProject();
  if (options.length < 2) return null;

  const label = isAll ? "All my projects" : (project?.name ?? "Select project");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="hidden h-8 max-w-[160px] items-center md:flex xl:max-w-[200px] gap-1.5 rounded-lg border border-border px-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none">
        <Building2 className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">{label}</span>
        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {/* The default. It filters the lists rather than restricting them, so a
            portfolio role is never silently shown one site (audit QH3). */}
        <DropdownMenuItem onClick={() => setProjectId(ALL_PROJECTS)}>
          <span className="flex-1 truncate">All my projects</span>
          {selection === ALL_PROJECTS ? <Check className="size-4" /> : null}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {options.map((p) => (
          <DropdownMenuItem key={p.id} onClick={() => setProjectId(p.id)}>
            <span className="flex-1 truncate">{p.name}</span>
            {selection === p.id ? <Check className="size-4" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The same choice for the phone menu, where the bar has no room for the
 * dropdown. Hidden from `md` up, where the dropdown takes over.
 */
export function ProjectSwitcherList({ onPick }: { onPick?: () => void }) {
  const { options, selection, setProjectId } = useActiveProject();
  if (options.length < 2) return null;

  const choices = [
    { id: ALL_PROJECTS, name: "All my projects" },
    ...options.map((p) => ({ id: p.id, name: p.name })),
  ];

  return (
    <div className="border-b border-border/50 py-2 md:hidden">
      <p className="py-1 text-xs font-medium text-muted-foreground">Project</p>
      {choices.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => {
            setProjectId(c.id);
            onPick?.();
          }}
          className={cn(
            "flex w-full items-center py-2 text-left text-sm",
            selection === c.id ? "font-medium text-primary" : "text-muted-foreground",
          )}
        >
          <span className="flex-1 truncate">{c.name}</span>
          {selection === c.id ? <Check className="size-4" /> : null}
        </button>
      ))}
    </div>
  );
}
