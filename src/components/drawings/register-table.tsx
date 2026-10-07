"use client";

import { Fragment, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Attachments, EmptyRows } from "@/components/common";
import { useFlashed } from "@/lib/hooks/use-flash";
import { AddRevisionDialog } from "./add-revision-dialog";
import { drawingDisciplineLabel } from "@/config/labels";
import { formatDate } from "@/lib/format";
import { cn } from "cn";
import type { Drawing, DrawingRevision } from "@/lib/domain";

/** Ref callback: brings a just-written row into view the moment it mounts. */
function scrollIntoViewOnce(el: HTMLElement | null) {
  el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

/**
 * The register's own table, not the shared `<DataTable>`.
 *
 * `<DataTable>` only folds columns past ten, which would leave most of a
 * drawing's revision history sitting on the row. The register needs the
 * opposite: a fixed six-column default view (acceptance criteria 1 and 2),
 * with the *entire* revision history — not merely the overflow — behind one
 * expander per row. That is a deliberate, narrower rule than the generic
 * table enforces, so it gets its own small table rather than fighting the
 * shared one's column count.
 */
export function RegisterTable({
  drawings,
  revisionsOf,
  today,
  canEdit,
  emptyMessage,
}: {
  drawings: Drawing[];
  revisionsOf: (drawing: Drawing) => DrawingRevision[];
  today: string;
  canEdit: boolean;
  emptyMessage: string;
}) {
  const flashed = useFlashed();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (drawings.length === 0) {
    return (
      <Card className="overflow-hidden">
        <EmptyRows message={emptyMessage} />
      </Card>
    );
  }

  return (
    <>
      {/* Desktop / tablet: a real table, revision history behind the expander. */}
      <Card className="hidden overflow-hidden py-0 md:block">
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full caption-bottom text-sm">
            <thead>
              <tr className="border-b border-border/70">
                <th data-chrome scope="col" className="sticky top-0 z-10 w-0 bg-muted px-2" />
                {HEADERS.map((h) => (
                  <th
                    key={h}
                    scope="col"
                    className="sticky top-0 z-10 bg-muted px-4 py-3 text-left text-xs font-medium tracking-wide whitespace-nowrap text-muted-foreground uppercase"
                  >
                    {h}
                  </th>
                ))}
                {canEdit ? (
                  <th data-chrome scope="col" className="sticky top-0 z-10 w-0 bg-muted px-4" />
                ) : null}
              </tr>
            </thead>
            <tbody>
              {drawings.map((d) => {
                const isOpen = expanded.has(d.id);
                const revisions = revisionsOf(d);
                return (
                  <Fragment key={d.id}>
                    <tr
                      ref={flashed.ids.has(d.id) ? scrollIntoViewOnce : undefined}
                      className={cn(
                        "group/row h-12 border-b border-border/50 transition-colors last:border-0 hover:bg-muted/40",
                        flashed.ids.has(d.id) && "row-flash",
                      )}
                    >
                      <td className="w-0 px-2">
                        <button
                          type="button"
                          aria-expanded={isOpen}
                          aria-label={isOpen ? "Hide revision history" : "Show revision history"}
                          onClick={() => toggle(d.id)}
                          className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                        >
                          <ChevronDown
                            className={cn("size-4 transition-transform", isOpen && "rotate-180")}
                          />
                        </button>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{d.drawing_no}</td>
                      <td className="px-4 py-3">{d.title}</td>
                      <td className="px-4 py-3">{drawingDisciplineLabel(d.discipline)}</td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {d.current_revision_code ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        {d.current_revision_date ? formatDate(d.current_revision_date) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm">{d.current_status || "—"}</span>
                      </td>
                      {canEdit ? (
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <AddRevisionDialog drawing={d} today={today} />
                        </td>
                      ) : null}
                    </tr>
                    {isOpen ? (
                      <tr className="border-b border-border/50 bg-muted/20">
                        <td colSpan={HEADERS.length + 1 + (canEdit ? 1 : 0)} className="px-4 py-3">
                          <RevisionHistory revisions={revisions} />
                          <Attachments
                            entityType="drawing"
                            entityId={d.id}
                            projectId={d.project_id}
                            canEdit={canEdit}
                            className="mt-4"
                          />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Phone: a stacked card per drawing, revision history inline — there is
          no room on a phone for a second tap, and the history is short. */}
      <div className="space-y-3 md:hidden">
        {drawings.map((d) => (
          <Card key={d.id} className="p-4">
            <div className="min-w-0">
              <p className="font-mono text-xs text-muted-foreground">{d.drawing_no}</p>
              <p className="font-medium">{d.title}</p>
              <p className="text-xs text-muted-foreground">
                {drawingDisciplineLabel(d.discipline)}
              </p>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <div>
                <dt className="text-muted-foreground">Current revision</dt>
                <dd className="font-mono">{d.current_revision_code ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Revision date</dt>
                <dd>{d.current_revision_date ? formatDate(d.current_revision_date) : "—"}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-muted-foreground">Status</dt>
                <dd>{d.current_status || "—"}</dd>
              </div>
            </dl>
            <RevisionHistory revisions={revisionsOf(d)} className="mt-3" />
            <Attachments
              entityType="drawing"
              entityId={d.id}
              projectId={d.project_id}
              canEdit={canEdit}
              className="mt-4"
            />
            {canEdit ? (
              <div className="mt-3">
                <AddRevisionDialog drawing={d} today={today} />
              </div>
            ) : null}
          </Card>
        ))}
      </div>
    </>
  );
}

const HEADERS = ["Drawing no.", "Title", "Discipline", "Revision", "Revision date", "Status"];

/** The full revision history, R0 first. Drawings with fewer than five show no empty columns. */
function RevisionHistory({
  revisions,
  className,
}: {
  revisions: DrawingRevision[];
  className?: string;
}) {
  const sorted = [...revisions].sort((a, b) => a.revision_code.localeCompare(b.revision_code));
  return (
    <div className={className}>
      <p className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Revision history
      </p>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="py-1 pr-3 font-medium">Rev.</th>
            <th className="py-1 pr-3 font-medium">Date</th>
            <th className="py-1 pr-3 font-medium">Copies</th>
            <th className="py-1 font-medium">Remarks</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.id} className="border-t border-border/60">
              <td className="py-1.5 pr-3 font-mono">{r.revision_code}</td>
              <td className="py-1.5 pr-3">{formatDate(r.revision_date)}</td>
              <td className="py-1.5 pr-3">{r.copies_received}</td>
              <td className="py-1.5">{r.remarks || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
