"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { createActionsFor } from "@/config/permissions";
import { useActiveProject } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Start anything, from anywhere.
 *
 * The list is derived from GRANTS, so a role never sees an action `can()`
 * would refuse. Each item lands on the page that owns the record with `?new=1`,
 * which is what opens that page's create dialog — the form and the list it
 * writes into stay in one place.
 */
export function NewMenu() {
  const { role } = useSession();
  const { projectId } = useActiveProject();
  const actions = createActionsFor(role);
  if (actions.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button size="sm" aria-label="New">
            <Plus className="size-3.5" />
            <span className="hidden sm:inline">New</span>
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-60">
        {actions.map((a) => {
          const href = a.href ?? `/projects/${projectId}/${a.project_segment}`;
          // A full-page editor is its own route; the rest answer ?new=1.
          return (
            <DropdownMenuItem
              key={a.resource}
              disabled={Boolean(a.project_segment) && !projectId}
              render={<Link href={a.full_page ? href : `${href}?new=1`} />}
            >
              {a.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
