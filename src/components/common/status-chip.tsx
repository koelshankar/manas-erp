import { cn } from "cn";
import {
  STATUS_MAP,
  TONE_CLASS,
  statusEntry,
  statusLabel,
  type Tone,
} from "@/config/status";

/*
 * The chips. The words and tones they render come from `@/config/status` —
 * see the note there on why the vocabulary is data and not markup. These are
 * re-exported so every existing call site keeps working.
 */
export { STATUS_MAP, statusEntry, statusLabel };
export type { Tone };

export function StatusChip({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const { label, tone } = statusEntry(status);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1",
        TONE_CLASS[tone],
        className,
      )}
    >
      {label}
    </span>
  );
}

/** A count chip for list tabs and nav badges. */
export function ToneChip({
  tone = "neutral",
  children,
  className,
}: {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "num inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-semibold ring-1",
        TONE_CLASS[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Where a record is, as one chip                                      */
/* ------------------------------------------------------------------ */

/**
 * The record's position in its chain — one chip instead of two.
 *
 * A list row used to carry a Status chip reading "Awaiting approval" and, two
 * columns later, an "A2 gate" chip reading "Pending": two chips, one fact,
 * stacked on top of each other on a phone (audit C8). This says where the
 * record actually is — "With Project Head" — and carries the step code as
 * small type inside the chip rather than as a column of its own.
 */
export function PositionChip({
  status,
  /** Who is holding it right now, when anyone is. */
  waitingOn,
  className,
}: {
  status: string;
  waitingOn?: string | null;
  className?: string;
}) {
  const base = statusEntry(status);
  const waiting = base.tone === "warning" && waitingOn;
  const label = waiting ? `With ${waitingOn}` : base.label;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1",
        TONE_CLASS[base.tone],
        className,
      )}
    >
      {label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* How long it has been sitting there                                  */
/* ------------------------------------------------------------------ */

/**
 * "raised 6 days ago", amber past 3 days and red past 7.
 *
 * Every queue row carries one: a list of things waiting on you is useless
 * without how long they have been waiting (audit H3). The thresholds are the
 * app's one ageing rule, shared with `ageBand` in the query layer.
 */
export function AgeChip({
  days,
  verb = "raised",
  className,
}: {
  days: number;
  /** "raised", "submitted", "sent" — what started the clock. */
  verb?: string;
  className?: string;
}) {
  const tone: Tone = days > 7 ? "destructive" : days > 3 ? "warning" : "neutral";
  const when = days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
  return (
    <span
      className={cn(
        "num whitespace-nowrap text-xs",
        tone === "destructive"
          ? "font-medium text-destructive"
          : tone === "warning"
            ? "font-medium text-warning"
            : "text-muted-foreground",
        className,
      )}
      title={`${verb} ${when}`}
    >
      {verb} {when}
    </span>
  );
}
