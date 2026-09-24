"use client";

import type { ReactNode } from "react";
import type { Resource } from "@/config/permissions";
import { useAccess } from "@/lib/hooks";
import { PageHeader } from "./page-header";
import { HydrationGate } from "./hydration-gate";

/**
 * The standard page frame: header (title, step codes, owner tag, primary
 * action) over hydration-gated content.
 *
 * Pages another team owns look identical minus any create/edit/approve
 * buttons — navigation is never disabled.
 */
export function ResourcePage({
  resource,
  title,
  description,
  children,
  actions,
  menu,
}: {
  resource: Resource;
  title?: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
  menu?: ReactNode;
}) {
  const access = useAccess(resource);

  return (
    <div>
      <PageHeader
        resource={resource}
        title={title ?? access.meta.label}
        description={description}
        team={access.ownerTeam}
        stepCodes={access.meta.step_codes}
        owned={access.owned}
        outsideNav={access.outsideNav}
        actions={access.readOnly ? null : actions}
        menu={menu}
      />
      <div className="space-y-6">
        <HydrationGate>{children}</HydrationGate>
      </div>
    </div>
  );
}
