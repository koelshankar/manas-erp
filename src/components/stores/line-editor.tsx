"use client";

import { Plus, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

/**
 * The line block the three stores dialogs share.
 *
 * All three documents are a header plus a short list of materials, and a
 * storeman on a phone adds one or two lines, not twenty — so they are stacked
 * cards rather than a grid. A grid at 390px is the thing the density pass went
 * to some trouble to get rid of.
 *
 * The remove button is hidden on a single line: a document with no lines is
 * refused by the service anyway, and offering the control is an invitation to
 * an error message.
 */
export function LineEditor({
  label,
  hint,
  count,
  onAdd,
  addLabel = "Add a line",
  children,
}: {
  label: string;
  hint?: string;
  count: number;
  onAdd: () => void;
  addLabel?: string;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{label}</h3>
          {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onAdd}>
          <Plus className="size-3.5" /> {addLabel}
        </Button>
      </div>
      <div className="space-y-3">{children}</div>
      {count === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Nothing on this document yet. Add a line to carry on.
        </p>
      ) : null}
    </section>
  );
}

/** One line's card, with its own remove control. */
export function LineRow({
  index,
  onRemove,
  removable,
  children,
}: {
  index: number;
  onRemove: () => void;
  removable: boolean;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Line {index + 1}
        </span>
        {removable ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove line ${index + 1}`}
            onClick={onRemove}
          >
            <Trash2 className="size-3.5" />
          </Button>
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </div>
  );
}
