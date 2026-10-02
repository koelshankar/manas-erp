"use client";

import { usePathname } from "next/navigation";
import { Building2, Check, ChevronDown } from "lucide-react";
import { cn } from "cn";
import { useActiveProject } from "@/lib/hooks";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * The project switcher pinned inside the workspace header.
 *
 * It is here, rather than only in the top bar, because moving between sites is
 * something you do *from* a project rather than after going back out to the
 * list. It is on every one of the eight tabs, and switching keeps the tab you
 * are standing on: `setProjectId` rewrites the project id in the current path
 * and leaves the rest of it alone, so Procurement in one project opens
 * Procurement in the next.
 *
 * A role posted to a single site has nothing to choose, so it renders the name
 * as plain text rather than a dropdown that cannot go anywhere.
 */
export function WorkspaceProjectSwitcher({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const pathname = usePathname();
  const { options, projectId, setProjectId } = useActiveProject();

  if (options.length < 2) {
    return (
      <span className={cn("inline-flex items-center gap-1.5", className)}>
        <Building2 className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{name}</span>
      </span>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Switch project"
        className={cn(
          "inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 -ml-2 text-left transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none md:min-h-9",
          className,
        )}
      >
        <Building2 className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{name}</span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {options.map((p) => (
          <DropdownMenuItem
            key={p.id}
            // Keep the tab: only the project id in the path changes.
            onClick={() => setProjectId(p.id)}
            className="min-h-11 md:min-h-9"
          >
            <span className="flex-1 truncate">{p.name}</span>
            {p.id === projectId ? <Check className="size-4" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
