"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, Check, Clock, X } from "lucide-react";
import type { StepCode, Team } from "@/lib/domain";
import { StatusChip } from "@/components/common/status-chip";
import { StepCodeBadge } from "@/components/common/step-code-badge";
import { OwnerTag } from "@/components/common/team-tag";
import { RecordTrail } from "@/components/common/record-trail";
import type { TrailEntityType } from "@/lib/services/queries";
import { formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { cn } from "cn";
import {
  AppDialog,
  AppDialogBody,
  AppDialogFooter,
  AppDialogHeader,
} from "./app-dialog";

/** One thing that happened to a record, oldest first. */
export type ActivityEvent = {
  id: string;
  state: "done" | "waiting" | "failed";
  /** Chart step code, where the chart gives one. */
  code?: StepCode | string;
  title: string;
  who?: string;
  when?: string;
  note?: string;
};

/**
 * The quick view of any record, opened by clicking its row.
 *
 * Always the same six things in the same order — who this is, where it sits in
 * the chain, its key fields, its lines, what has happened to it, and what this
 * role may do about it — so the reader learns one screen, not twenty.
 */
export function RecordDialog({
  open,
  onOpenChange,
  documentNumber,
  title,
  status,
  team,
  stepCodes = [],
  entityType,
  entityId,
  fields,
  lines,
  activity,
  actions,
  fullPageHref,
  fullPageLabel = "Open full page",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** The number the reader recognises. Rendered mono. */
  documentNumber: string;
  /** One line of context under the number. */
  title?: React.ReactNode;
  status?: string;
  team: Team;
  stepCodes?: StepCode[];
  /** Drives the record trail, when the record is part of a chain. */
  entityType?: TrailEntityType;
  entityId?: string;
  fields?: React.ReactNode;
  lines?: React.ReactNode;
  activity?: ActivityEvent[];
  /** Only what `can()` allows — the caller decides. */
  actions?: React.ReactNode;
  fullPageHref?: string;
  fullPageLabel?: string;
}) {
  return (
    <AppDialog open={open} onOpenChange={onOpenChange} size="xl">
      <AppDialogHeader
        title={<span className="font-mono">{documentNumber}</span>}
        context={title}
        right={
          <div className="flex flex-wrap items-center gap-2">
            <StepCodeBadge codes={stepCodes} team={team} />
            <OwnerTag team={team} />
            {status ? <StatusChip status={status} /> : null}
          </div>
        }
      />
      <AppDialogBody className="space-y-6">
        {entityType && entityId ? (
          <RecordTrail entityType={entityType} entityId={entityId} />
        ) : null}
        {fields ? (
          <RecordDialogSection title="Details">{fields}</RecordDialogSection>
        ) : null}
        {lines ? (
          <RecordDialogSection title="Lines">{lines}</RecordDialogSection>
        ) : null}
        {activity && activity.length > 0 ? (
          <RecordDialogSection title="Activity">
            <ActivityTimeline events={activity} />
          </RecordDialogSection>
        ) : null}
      </AppDialogBody>
      <AppDialogFooter
        info={
          fullPageHref ? (
            <Link
              href={fullPageHref}
              className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
            >
              {fullPageLabel}
              <ArrowUpRight className="size-3.5" />
            </Link>
          ) : null
        }
      >
        <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
          Close
        </Button>
        {actions}
      </AppDialogFooter>
    </AppDialog>
  );
}

export function RecordDialogSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <h3 className="text-[0.9375rem] font-semibold text-foreground">
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function ActivityTimeline({ events }: { events: ActivityEvent[] }) {
  return (
    <ol className="space-y-3">
      {events.map((e) => {
        const Icon =
          e.state === "done" ? Check : e.state === "failed" ? X : Clock;
        return (
          <li key={e.id} className="flex gap-3">
            <span
              className={cn(
                "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full ring-1",
                e.state === "done" &&
                  "bg-success-soft text-success ring-success/30",
                e.state === "waiting" &&
                  "bg-muted text-muted-foreground ring-border",
                e.state === "failed" &&
                  "bg-danger-soft text-destructive ring-destructive/30",
              )}
            >
              <Icon className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">
                {e.code ? (
                  <span className="mr-2 font-mono text-xs text-muted-foreground">
                    {e.code}
                  </span>
                ) : null}
                {e.title}
              </p>
              {e.who || e.when ? (
                <p className="text-xs text-muted-foreground">
                  {[e.who, e.when ? formatDate(e.when) : null]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              ) : null}
              {e.note ? (
                <p className="mt-0.5 text-xs text-muted-foreground italic">
                  “{e.note}”
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
