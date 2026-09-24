"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { cn } from "cn";
import { TEAM_STYLES } from "@/config/team-styles";
import { projectNavFor } from "@/config/permissions";
import { useSession } from "@/lib/session";
import { WORKSPACE_TABS } from "@/components/shell/nav-config";
import { ScrollStrip } from "@/components/common/scroll-strip";

/**
 * The project workspace navigation, cut down to the pages that are relevant to
 * the role — see PROJECT_NAV in permissions.ts.
 *
 * A tab appears when the role carries at least one of its pages, and shows only
 * those pages. Pages left out are not blocked: a link from the record trail, the
 * Approvals inbox or a dashboard still opens them, marked as another team's
 * record.
 */
export function WorkspaceNav({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const { role } = useSession();
  const base = `/projects/${projectId}`;

  const tabs = useMemo(() => {
    const visible = projectNavFor(role);
    return WORKSPACE_TABS.map((tab) => ({
      ...tab,
      pages: tab.pages.filter((page) => visible.includes(page.resource)),
    })).filter((tab) => tab.key === "overview" || tab.pages.length > 0);
  }, [role]);

  const activeTab =
    tabs.find((t) => pathname.startsWith(`${base}/${t.segment}`)) ?? tabs[0];

  return (
    <div className="mb-5">
      <ScrollStrip className="gap-1 border-b border-border">
        <nav className="flex flex-nowrap gap-1">
          {tabs.map((tab) => {
            const isActive = tab.key === activeTab?.key;
            const style = TEAM_STYLES[tab.team];
            return (
              <Link
                key={tab.key}
                data-active={isActive}
                href={`${base}/${tab.pages[0]?.segment ?? tab.segment}`}
                className={cn(
                  "flex min-h-11 items-center rounded-t-lg border-b-2 px-4 text-sm font-medium whitespace-nowrap transition-colors md:min-h-0 md:py-2.5",
                  isActive ? style.tabActive : style.tabIdle,
                )}
              >
                <span
                  className={cn(
                    "mr-2 inline-block size-1.5 rounded-full align-middle",
                    style.dot,
                  )}
                />
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </ScrollStrip>

      {activeTab && activeTab.pages.length > 0 ? (
        <ScrollStrip className="mt-2.5 gap-1">
          <div className="flex flex-nowrap gap-1">
            {activeTab.pages.map((page) => {
              const href = `${base}/${page.segment}`;
              const isActive = pathname === href;
              return (
                <Link
                  key={page.segment}
                  data-active={isActive}
                  href={href}
                  className={cn(
                    // 44px minimum tap target on a phone (audit S-mobile).
                    "flex min-h-11 items-center rounded-full px-3 text-sm font-medium whitespace-nowrap transition-colors md:min-h-0 md:py-1.5",
                    isActive
                      ? TEAM_STYLES[activeTab.team].subNavActive
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {page.label}
                </Link>
              );
            })}
          </div>
        </ScrollStrip>
      ) : null}
    </div>
  );
}
