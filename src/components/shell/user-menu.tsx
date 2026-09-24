"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, GitBranch, Moon, RotateCcw, Sun } from "lucide-react";
import { toast } from "sonner";
import { ROLE_LABEL, ROLE_TEAM } from "@/config/permissions";
import { TEAM_STYLES } from "@/config/team-styles";
import { resetDemo } from "@/lib/data";
import { DEFAULT_ROLE, useSession } from "@/lib/session";
import { useTheme } from "@/lib/hooks";
import { ConfirmDialog } from "@/components/ui-app";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "cn";
import type { Role } from "@/lib/domain";

function initials(name: string | undefined, role: Role): string {
  if (!name) return role.slice(0, 2).toUpperCase();
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** Who you are, and the three things that are about the app rather than the work. */
export function UserMenu() {
  const { user, role, setRole } = useSession();
  const { theme, toggle } = useTheme();
  const [confirmReset, setConfirmReset] = useState(false);
  const style = TEAM_STYLES[ROLE_TEAM[role]];

  function onReset() {
    resetDemo();
    setRole(DEFAULT_ROLE);
    setConfirmReset(false);
    toast.success("Demo reset", {
      description:
        "Every record is back to how it starts, and you are Project Head again.",
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-2 rounded-full py-1 pr-1.5 pl-1 transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none">
          <span
            className={cn(
              "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
              style.tag,
            )}
          >
            {initials(user?.full_name, role)}
          </span>
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuGroup>
            <div className="px-2 py-1.5">
              <p className="truncate text-sm font-medium text-foreground">
                {user?.full_name ?? "Demo user"}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {ROLE_LABEL[role]}
              </p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={(event) => {
                // A setting, not navigation: keep the menu where it is.
                event.preventDefault();
                toggle();
              }}
            >
              {theme === "dark" ? (
                <Sun className="size-4" />
              ) : (
                <Moon className="size-4" />
              )}
              <span className="flex-1">
                {theme === "dark" ? "Light theme" : "Dark theme"}
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link href="/workflow" />}>
              <GitBranch className="size-4" />
              <span className="flex-1">Workflow map</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setConfirmReset(true)}>
              <RotateCcw className="size-4" />
              <span className="flex-1">Reset demo</span>
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Reset the demo?"
        consequence="Every indent, purchase order, delivery and bill you have raised in this browser is discarded, and the demo goes back to the records it ships with. This cannot be undone."
        confirmLabel="Reset demo data"
        tone="destructive"
        onConfirm={onReset}
      />
    </>
  );
}
