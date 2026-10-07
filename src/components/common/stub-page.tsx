"use client";

import type { LucideIcon } from "lucide-react";
import { PageHeader } from "./page-header";
import { EmptyState } from "./empty-state";
import { useAccess } from "@/lib/hooks";
import type { Resource } from "@/config/permissions";

/**
 * A page that exists in the structure but has no records behind it yet.
 *
 * It is a real page shell — breadcrumb, title, description, owner tag, the
 * workspace tabs above it — with an empty state that says what will put
 * something here. Deliberately not a 404 and deliberately not a "coming soon"
 * banner: the reader is standing in the right place, there is simply nothing
 * filed under it, and the sentence tells them what would be.
 */
export function StubPage({
  resource,
  description,
  message,
  icon,
}: {
  resource: Resource;
  description: string;
  /** What would put a record here, in one sentence. */
  message: string;
  icon?: LucideIcon;
}) {
  const access = useAccess(resource);

  return (
    <div>
      <PageHeader
        resource={resource}
        title={access.meta.label}
        description={description}
        team={access.ownerTeam}
        outsideNav={access.outsideNav}
        owned={access.owned}
      />
      <EmptyState icon={icon} message={message} />
    </div>
  );
}
