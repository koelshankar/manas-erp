"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { StepCode, Team } from "@/lib/domain";
import { StatusChip } from "@/components/common/status-chip";
import { StepCodeBadge } from "@/components/common/step-code-badge";
import { OwnerTag } from "@/components/common/team-tag";
import { Breadcrumbish } from "./breadcrumbish";
import { SavedIndicator } from "./saved-indicator";
import { cn } from "cn";

/**
 * The shell for the three documents that are too long for a dialog.
 *
 * Comparative, Joint Measurement and RA Bill each carry a line grid, running
 * totals and several minutes of typing; a modal capped at 90vh put the grid
 * inside a box inside a page (audit C6). This gives them the full width, a
 * compact header that does not scroll away, and a sticky action bar with the
 * totals on the left and the actions on the right — so the number that decides
 * whether to submit is always in view.
 */
export function FullPageEditor({
  backHref,
  backLabel = "Back",
  crumbs,
  documentNumber,
  title,
  party,
  status,
  team,
  stepCodes = [],
  savedAt,
  saving,
  totals,
  actions,
  children,
}: {
  backHref: string;
  backLabel?: string;
  crumbs: Array<{ label: string; href?: string }>;
  /** "New" until the document has one. */
  documentNumber: string;
  title: string;
  /** The contractor or supplier this document is with. */
  party?: string;
  status?: string;
  team: Team;
  stepCodes?: StepCode[];
  savedAt?: string | null;
  saving?: boolean;
  /** The running figures, left of the action bar. */
  totals: ReactNode;
  actions: ReactNode;
  children: ReactNode;
}) {
  return (
    // pb leaves room for the sticky bar so the last grid row is never under it.
    <div className="-mt-2 pb-24">
      <header className="mb-4">
        <Breadcrumbish crumbs={crumbs} />
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <Link
                href={backHref}
                className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="size-3.5" />
                {backLabel}
              </Link>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
              {/* Mono for a document number; a draft's "New RA bill" is words. */}
              <h1
                className={cn(
                  "text-xl leading-tight font-semibold tracking-tight",
                  documentNumber.includes("/") && "font-mono",
                )}
              >
                {documentNumber}
              </h1>
              <StepCodeBadge codes={stepCodes} team={team} />
              <OwnerTag team={team} />
              {status ? <StatusChip status={status} /> : null}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {title}
              {party ? (
                <>
                  {" · "}
                  <span className="font-medium text-foreground">{party}</span>
                </>
              ) : null}
            </p>
          </div>
          <SavedIndicator savedAt={savedAt} saving={saving} />
        </div>
      </header>

      {children}

      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur",
          "supports-backdrop-filter:bg-card/85",
        )}
      >
        <div className="mx-auto flex max-w-[1600px] flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1">{totals}</div>
          <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>
        </div>
      </div>
    </div>
  );
}

/** One figure in the action bar. */
export function EditorTotal({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: ReactNode;
  emphasis?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] tracking-wide text-muted-foreground uppercase">{label}</p>
      <p
        className={cn(
          "num leading-tight font-semibold",
          emphasis ? "text-base text-foreground" : "text-sm text-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}
