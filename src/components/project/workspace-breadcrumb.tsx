"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { useSession } from "@/lib/session";
import { useWorkspaceTabs } from "@/lib/hooks";

/**
 * `Projects / <project name> / <tab>` on every workspace page.
 *
 * The project header and the tab strip say where you are, but neither says how
 * you got here or offers the way back out — a reader two projects deep had no
 * anchor. The last crumb is the tab, not the page: the sub-nav directly below
 * already names the page, and repeating it reads as a stutter.
 */
export function WorkspaceBreadcrumb({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const pathname = usePathname() ?? "";
  const { role } = useSession();
  const tabs = useWorkspaceTabs(role);

  const base = `/projects/${projectId}`;
  const tab = tabs.find((t) => pathname.startsWith(`${base}/${t.segment}`));

  return (
    <nav
      aria-label="Breadcrumb"
      className="mb-1.5 flex items-center gap-1 text-xs text-muted-foreground"
    >
      <Link
        href="/projects"
        className="rounded transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        Projects
      </Link>
      <ChevronRight className="size-3 shrink-0" aria-hidden />
      <Link
        href={`${base}/overview`}
        className="max-w-[16ch] truncate rounded transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none sm:max-w-none"
      >
        {projectName}
      </Link>
      {tab ? (
        <>
          <ChevronRight className="size-3 shrink-0" aria-hidden />
          <span className="font-medium text-foreground">{tab.label}</span>
        </>
      ) : null}
    </nav>
  );
}
