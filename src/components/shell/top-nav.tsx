"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { ChevronDown, Menu, X } from "lucide-react";
import { cn } from "cn";
import { topNavFor, type TopNavItem } from "@/config/permissions";
import { useActiveProject } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import { GlobalSearch } from "./global-search";
import { NewMenu } from "./new-menu";
import { NotificationBell } from "./notification-bell";
import { ProjectSwitcher } from "./project-switcher";
import { RoleSwitcher } from "./role-switcher";
import { UserMenu } from "./user-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

type Resolved = {
  label: string;
  href: string;
  children?: Array<{ label: string; href: string }>;
};

/** Turns a project-scoped nav entry into a real route for the active project. */
function resolve(item: TopNavItem, projectId: string): Resolved {
  const href = item.project_segment
    ? projectId
      ? `/projects/${projectId}/${item.project_segment}`
      : "/projects"
    : (item.href ?? "/");
  return {
    label: item.label,
    href: item.children?.length
      ? resolve(item.children[0], projectId).href
      : href,
    children: item.children?.map((c) => resolve(c, projectId)),
  };
}

function isActive(pathname: string, item: Resolved): boolean {
  const hrefs = item.children?.map((c) => c.href) ?? [item.href];
  return hrefs.some((href) => {
    if (href === "/") return pathname === "/";
    // Project routes differ only past the id, so compare the tail.
    const tail = href.replace(/^\/projects\/[^/]+/, "");
    if (tail !== href && tail) return pathname.endsWith(tail);
    return pathname === href || pathname.startsWith(`${href}/`);
  });
}

const LINK_BASE =
  "flex h-14 shrink-0 items-center gap-1 border-b-2 px-2.5 text-sm font-medium whitespace-nowrap transition-colors xl:px-3";
const LINK_ACTIVE = "border-primary text-primary";
const LINK_IDLE =
  "border-transparent text-muted-foreground hover:text-foreground";

/**
 * The top bar. Horizontal, Salesforce-Lightning style: brand left, the role's
 * own items across the middle, and identity on the right.
 *
 * Every role gets its own set of items from `TOP_NAV` in permissions.ts — a
 * Site Engineer's bar is not the Project Head's bar with things removed. The
 * active item is primary text under a 2px primary rule; team colour never
 * appears in the menu.
 */
export function TopNav() {
  const pathname = usePathname() ?? "";
  const [mobileOpen, setMobileOpen] = useState(false);
  const { role } = useSession();
  const { projectId } = useActiveProject();

  const items = useMemo(
    () => topNavFor(role).map((item) => resolve(item, projectId)),
    [role, projectId],
  );

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur supports-backdrop-filter:bg-card/80">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-3 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <span className="flex size-7 items-center justify-center rounded-lg bg-foreground text-[11px] font-bold text-background">
            M
          </span>
          <span className="hidden text-sm leading-tight font-semibold tracking-tight sm:block">
            Manas Developers
            <span className="block text-[11px] font-normal text-muted-foreground">
              Developer ERP
            </span>
          </span>
        </Link>

        {/* min-w-0 + nowrap: a seven-item bar (the Purchase Officer's) must
            scroll rather than wrap its labels into the row height. */}
        <nav className="ml-3 hidden min-w-0 flex-1 items-center gap-0.5 overflow-x-auto lg:flex [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {items.map((item) =>
            item.children ? (
              <DropdownMenu key={item.label}>
                <DropdownMenuTrigger
                  className={cn(
                    LINK_BASE,
                    isActive(pathname, item) ? LINK_ACTIVE : LINK_IDLE,
                  )}
                >
                  {item.label}
                  <ChevronDown className="size-3.5" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  {item.children.map((child) => (
                    <DropdownMenuItem
                      key={child.href}
                      render={<Link href={child.href} />}
                    >
                      {child.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  LINK_BASE,
                  isActive(pathname, item) ? LINK_ACTIVE : LINK_IDLE,
                )}
              >
                {item.label}
              </Link>
            ),
          )}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <ProjectSwitcher />
          <NewMenu />
          <GlobalSearch />
          <NotificationBell />
          <RoleSwitcher />
          <UserMenu />
          <Button
            variant="ghost"
            size="icon-sm"
            className="lg:hidden"
            aria-label="Menu"
            onClick={() => setMobileOpen((v) => !v)}
          >
            {mobileOpen ? (
              <X className="size-4" />
            ) : (
              <Menu className="size-4" />
            )}
          </Button>
        </div>
      </div>

      {mobileOpen ? (
        <nav className="border-t border-border bg-card px-4 pb-3 lg:hidden">
          {items.map((item) => (
            <div
              key={item.label}
              className="border-b border-border/50 last:border-0"
            >
              <Link
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex items-center py-3 text-sm font-medium",
                  isActive(pathname, item)
                    ? "text-primary"
                    : "text-muted-foreground",
                )}
              >
                {item.label}
              </Link>
              {item.children ? (
                <div className="pb-2 pl-3">
                  {item.children.map((child) => (
                    <Link
                      key={child.href}
                      href={child.href}
                      onClick={() => setMobileOpen(false)}
                      className="block py-2 text-sm text-muted-foreground"
                    >
                      {child.label}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </nav>
      ) : null}
    </header>
  );
}
