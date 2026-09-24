"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMoneyLeakCheck } from "@/lib/hooks";
import { useRepositoryQuery, useSession } from "@/lib/hooks-session";
import { getProjectHeaderStats, scopeFor, type ProjectHeaderStats } from "@/lib/services/queries";
import { ProjectHeader } from "./project-header";
import { WorkspaceNav } from "./workspace-nav";
import { Card } from "@/components/ui/card";

/**
 * Pinned header + the workspace tabs, wrapped around every project page.
 *
 * The full header scrolls away and is replaced by a 48px sticky bar carrying
 * the name, the status and one figure — the chrome above a table was six rows
 * deep and pushed the first datum below the fold (audit C3). The tabs come with
 * it, so navigation is never further than the top of the viewport.
 */
export function ProjectWorkspace({
  projectId,
  children,
}: {
  projectId: string;
  children: ReactNode;
}) {
  const { user, ready } = useSession();
  const sentinel = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);

  const { data: stats } = useRepositoryQuery<ProjectHeaderStats | null>(
    async () => (user ? getProjectHeaderStats(scopeFor(user), projectId) : null),
    [user?.id, user?.role, projectId],
  );

  // The header card was the leak the audit found; this is the tripwire on it.
  useMoneyLeakCheck("project header", stats);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setCollapsed(!entry.isIntersecting),
      // The top bar is 56px; collapse as the header passes under it.
      { rootMargin: "-56px 0px 0px 0px", threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [stats]);

  if (!ready || stats === undefined) {
    return (
      <div>
        <Card className="mb-5 h-28 animate-pulse bg-muted/50" aria-hidden />
        <div className="mb-5 h-10 animate-pulse rounded-lg bg-muted/50" aria-hidden />
      </div>
    );
  }

  if (!stats) {
    return (
      <Card className="px-6 py-10 text-center">
        <p className="text-sm text-muted-foreground">
          No project with id <span className="font-mono">{projectId}</span>. It may have been
          reset.
        </p>
      </Card>
    );
  }

  return (
    <div>
      <ProjectHeader stats={stats} />
      <div ref={sentinel} aria-hidden />
      {/* -mx to bleed the sticky strip to the page gutters, so the blur covers
          the full width as rows scroll under it. */}
      <div className="sticky top-14 z-30 -mx-4 bg-background/95 px-4 backdrop-blur sm:-mx-6 sm:px-6">
        {collapsed ? (
          <div className="border-b border-border/60">
            <ProjectHeader stats={stats} compact />
          </div>
        ) : null}
        <WorkspaceNav projectId={projectId} />
      </div>
      {children}
    </div>
  );
}
