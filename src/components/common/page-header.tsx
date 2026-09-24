"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight, MoreHorizontal } from "lucide-react";
import type { StepCode, Team } from "@/lib/domain";
import { RESOURCE_META, type Resource } from "@/config/permissions";
import { TEAM_META } from "@/config/teams";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { OwnerTag } from "./team-tag";
import { StepCodeBadge } from "./step-code-badge";
import { TEAM_STYLES } from "@/config/team-styles";
import { cn } from "cn";

export type Crumb = { label: string; href?: string };

/**
 * Every page starts the same way: where you are, what this page is for, and
 * the one thing you most likely came to do.
 *
 * The description is not decoration — it is the answer to "what is this
 * screen?", which an ERP page title alone never gives.
 */
export function PageHeader({
  resource,
  title,
  description,
  team,
  stepCodes = [],
  owned = false,
  outsideNav = false,
  breadcrumb,
  actions,
  menu,
}: {
  /** Drives the breadcrumb when no explicit one is given. */
  resource?: Resource;
  title: string;
  description?: string;
  team: Team;
  stepCodes?: StepCode[];
  owned?: boolean;
  /**
   * True when this page is outside the role's own workspace — opened from a
   * record trail, an approval or a dashboard link. See PROJECT_NAV.
   */
  outsideNav?: boolean;
  breadcrumb?: Crumb[];
  /** The primary action. Callers only pass it when `can()` says so. */
  actions?: ReactNode;
  /** Secondary actions, folded into an overflow menu. */
  menu?: ReactNode;
}) {
  /*
   * A project page already says where it is three times over — project header,
   * workspace tab, page tab — so a breadcrumb repeating all three is pure
   * height (audit C3). It is kept only where there is no tab strip above:
   * masters, ledgers, inboxes, and the full-page editors and record pages that
   * pass a breadcrumb explicitly.
   */
  const crumbs = useBreadcrumb(resource, title, breadcrumb);

  return (
    <header className="mb-5">
      {crumbs ? <Breadcrumb crumbs={crumbs} /> : null}
      {/* One row: rule, title, step code, owner team. The description is helper
          text directly under the title rather than a block of its own. */}
      <div
        className={cn(
          "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between",
          crumbs && "mt-2",
        )}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span
              className={cn("h-5 w-1 shrink-0 rounded-full", TEAM_STYLES[team].bar)}
              aria-hidden
            />
            <h1 className="min-w-0">{title}</h1>
            <StepCodeBadge codes={stepCodes} team={team} />
            <OwnerTag team={team} owned={owned} />
          </div>
          {description ? (
            <p className="mt-1 max-w-3xl text-sm leading-snug text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {actions || menu ? (
          <div className="flex shrink-0 items-center gap-2">
            {actions}
            {menu ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="outline"
                      size="icon-sm"
                      aria-label="More actions"
                    >
                      <MoreHorizontal className="size-4" />
                    </Button>
                  }
                />
                <DropdownMenuContent align="end" className="w-56">
                  {menu}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        ) : null}
      </div>
      {outsideNav ? (
        <p className="mt-2 text-xs text-muted-foreground">
          This is a {TEAM_META[team].short} page. You can read it, but it is not
          part of your own work.
        </p>
      ) : null}
    </header>
  );
}

/**
 * Home › Team › Page — built from the resource, not hand-typed.
 *
 * Returns null for a page inside the project workspace: the workspace already
 * carries the project name and both tab strips, and repeating them is the
 * fourth row of chrome above the table.
 */
function useBreadcrumb(
  resource: Resource | undefined,
  title: string,
  explicit: Crumb[] | undefined,
): Crumb[] | null {
  if (explicit) return explicit;
  if (!resource) return null;

  const meta = RESOURCE_META[resource];
  if (meta.project_scoped) return null;

  return [
    { label: "Home", href: "/" },
    { label: TEAM_META[meta.owner_team].short },
    { label: meta.label },
  ];
}

function Breadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="flex flex-wrap items-center gap-1 text-xs"
    >
      {crumbs.map((c, i) => (
        <span key={`${c.label}-${i}`} className="flex items-center gap-1">
          {i > 0 ? (
            <ChevronRight
              className="size-3 text-muted-foreground/60"
              aria-hidden
            />
          ) : null}
          {c.href && i < crumbs.length - 1 ? (
            <Link
              href={c.href}
              className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              {c.label}
            </Link>
          ) : (
            <span
              className={cn(
                i === crumbs.length - 1
                  ? "font-medium text-foreground"
                  : "text-muted-foreground",
              )}
              aria-current={i === crumbs.length - 1 ? "page" : undefined}
            >
              {c.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}

/** Section heading, one step below the page title in the hierarchy. */
export function SectionHeading({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 className="text-base font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        {description ? (
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions}
    </div>
  );
}
