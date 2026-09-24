"use client";

import Link from "next/link";
import {
  CircleAlert,
  PackageX,
  ReceiptText,
  TriangleAlert,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { useProjectId, useRepositoryQuery } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import { getProjectAlerts, type ProjectAlert } from "@/lib/services/queries";
import { cn } from "cn";

const ICON = {
  budget: TriangleAlert,
  stock: PackageX,
  billing: ReceiptText,
  reporting: CircleAlert,
} as const;

/** The few things on this project worth looking at today. */
export function ProjectAlerts() {
  const projectId = useProjectId();
  const { role } = useSession();
  const { data } = useRepositoryQuery<ProjectAlert[]>(
    async () => (projectId ? getProjectAlerts(projectId, role) : []),
    [projectId, role],
  );

  const alerts = data ?? [];
  if (alerts.length === 0) {
    return (
      <Card className="px-5 py-4">
        <p className="text-sm text-muted-foreground">
          No alerts on this project — nothing over budget, no low stock, no bill
          stuck in the chain, and the daily reports are up to date.
        </p>
      </Card>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {alerts.map((alert) => {
        const Icon = ICON[alert.kind];
        return (
          <Link
            key={alert.key}
            href={alert.href}
            className="group block min-w-0"
          >
            <Card
              className={cn(
                "h-full px-4 py-3.5 transition-shadow group-hover:shadow-md",
                alert.severity === "bad"
                  ? "bg-danger-soft ring-destructive/30"
                  : "bg-warning-soft ring-warning/30",
              )}
            >
              <div className="flex items-start gap-2.5">
                <Icon
                  className={cn(
                    "mt-0.5 size-4 shrink-0",
                    alert.severity === "bad"
                      ? "text-destructive"
                      : "text-warning",
                  )}
                />
                <div className="min-w-0">
                  <p
                    className={cn(
                      "text-sm font-medium",
                      alert.severity === "bad"
                        ? "text-destructive"
                        : "text-warning",
                    )}
                  >
                    {alert.title}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {alert.detail}
                  </p>
                </div>
              </div>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
