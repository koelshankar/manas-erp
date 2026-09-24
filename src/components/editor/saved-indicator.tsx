"use client";

import { Check, Loader2 } from "lucide-react";
import { format, parseISO } from "date-fns";

/** "Saved 12:04" — how much typing is safe, not whether a request is in flight. */
export function SavedIndicator({
  savedAt,
  saving,
}: {
  savedAt?: string | null;
  saving?: boolean;
}) {
  if (saving) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        Saving draft…
      </span>
    );
  }
  if (!savedAt) {
    return (
      <span className="shrink-0 text-xs text-muted-foreground">
        Drafts save automatically every 20 seconds.
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
      <Check className="size-3.5 text-success" />
      Saved {safeTime(savedAt)}
    </span>
  );
}

function safeTime(iso: string): string {
  try {
    return format(parseISO(iso), "HH:mm");
  } catch {
    return "just now";
  }
}
