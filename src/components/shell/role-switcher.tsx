"use client";

import { Check, ChevronDown } from "lucide-react";
import { ALL_ROLES, ROLE_LABEL, ROLE_TEAM } from "@/config/permissions";
import { TEAM_META } from "@/config/teams";
import { TEAM_STYLES } from "@/config/team-styles";
import { useSession } from "@/lib/session";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "cn";
import type { Role } from "@/lib/domain";

/**
 * Demo affordance: look at the app as another role.
 *
 * Replaced by Supabase auth later, when it becomes dev-only; the session shape
 * does not change. The person and the app settings live in the user menu — this
 * is only the role.
 */
export function RoleSwitcher() {
  const { role, setRole } = useSession();
  const team = ROLE_TEAM[role];
  const style = TEAM_STYLES[team];

  const byTeam = ALL_ROLES.reduce<Record<string, Role[]>>((acc, r) => {
    const t = ROLE_TEAM[r];
    (acc[t] ??= []).push(r);
    return acc;
  }, {});

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "hidden h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-sm font-medium transition-colors md:flex",
          "hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
        )}
      >
        <span className={cn("size-1.5 shrink-0 rounded-full", style.dot)} />
        <span className="truncate">{ROLE_LABEL[role]}</span>
        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>

      {/*
        Every label lives inside its own DropdownMenuGroup — Base UI's
        GroupLabel throws without a Menu.Group ancestor.
      */}
      <DropdownMenuContent align="end" className="w-64">
        {Object.entries(byTeam).map(([teamKey, roles], i) => (
          <DropdownMenuGroup key={teamKey}>
            {i > 0 ? <DropdownMenuSeparator /> : null}
            <DropdownMenuLabel className="flex items-center gap-2">
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  TEAM_STYLES[teamKey as keyof typeof TEAM_STYLES].dot,
                )}
              />
              <span className="tracking-wide uppercase">
                {TEAM_META[teamKey as keyof typeof TEAM_META].label}
              </span>
            </DropdownMenuLabel>
            {roles.map((r) => (
              <DropdownMenuItem
                key={r}
                onClick={() => setRole(r)}
                className="pl-6"
              >
                <span className="flex-1">{ROLE_LABEL[r]}</span>
                {r === role ? <Check className="size-4" /> : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
