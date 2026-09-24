"use client";

import type { ReactNode } from "react";
import { useIsHydrated } from "@/lib/hooks";
import { Card } from "@/components/ui/card";

/**
 * Renders children only once the persisted store has been read back, so the
 * server markup and the first client render can never disagree.
 */
export function HydrationGate({
  children,
  rows = 4,
}: {
  children: ReactNode;
  rows?: number;
}) {
  const hydrated = useIsHydrated();
  if (!hydrated) return <TableSkeleton rows={rows} />;
  return <>{children}</>;
}

export function TableSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <Card className="overflow-hidden py-0" aria-hidden>
      <div className="h-11 border-b border-border/70 bg-muted/40" />
      <div className="divide-y divide-border/50">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3.5">
            <div className="h-3 w-1/4 animate-pulse rounded bg-muted" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
            <div className="ml-auto h-3 w-16 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    </Card>
  );
}
