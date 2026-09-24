import { cn } from "cn";

/**
 * THE status mapping. Every status in the system gets a plain-English label
 * and one of five tones here, and nowhere else.
 *
 * Tone is state, never team and never seniority:
 *   neutral      nothing is happening yet, or the record is finished and filed
 *   info         in flight, moving as it should
 *   success      done, agreed, matched
 *   warning      waiting on a person
 *   destructive  refused, wrong, or stopped
 */
export type Tone = "neutral" | "info" | "success" | "warning" | "destructive";

const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground ring-border",
  info: "bg-info-soft text-info ring-info/30",
  success: "bg-success-soft text-success ring-success/30",
  warning: "bg-warning-soft text-warning ring-warning/30",
  destructive: "bg-danger-soft text-destructive ring-destructive/30",
};

type Entry = { label: string; tone: Tone };

/**
 * Keyed by the raw status value. Several entities share a value ("draft",
 * "approved") and mean the same thing by it, so one table covers them all.
 */
export const STATUS_MAP: Record<string, Entry> = {
  /* Project */
  planning: { label: "Planning", tone: "neutral" },
  in_progress: { label: "In progress", tone: "info" },
  on_hold: { label: "On hold", tone: "warning" },
  completed: { label: "Completed", tone: "success" },

  /* Site tasks */
  planned: { label: "Planned", tone: "neutral" },

  /* Indent (A2 -> B8) */
  submitted: { label: "Awaiting approval", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  partially_approved: { label: "Part approved", tone: "warning" },
  rejected: { label: "Rejected", tone: "destructive" },
  in_comparative: { label: "With purchase", tone: "info" },
  po_raised: { label: "PO raised", tone: "info" },
  partially_received: { label: "Part received", tone: "info" },
  received: { label: "Received", tone: "success" },
  closed: { label: "Closed", tone: "neutral" },

  /* Comparative (B1 -> B2) */
  draft: { label: "Draft", tone: "neutral" },
  pending_approval: { label: "Awaiting approval", tone: "warning" },
  sent_back: { label: "Sent back", tone: "destructive" },

  /* Purchase order (B3 -> B4) */
  sent: { label: "Sent to supplier", tone: "info" },

  /* GRN (B5 -> B6) */
  posted: { label: "Posted", tone: "success" },

  /* Joint measurement (C1) */
  signed: { label: "Signed", tone: "success" },
  billed: { label: "Billed", tone: "neutral" },

  /* RA bill (C2 -> C5) */
  in_certification: { label: "In certification", tone: "info" },
  certified: { label: "Certified", tone: "success" },
  handed_over: { label: "Handed to accounts", tone: "neutral" },

  /* Vendor bill (B7 -> B8) */
  matched: { label: "Matched", tone: "success" },
  mismatch: { label: "Mismatch", tone: "destructive" },
  verified: { label: "Verified", tone: "success" },

  /* Returns */
  raised: { label: "Raised", tone: "warning" },
  dispatched: { label: "Dispatched", tone: "info" },
  debit_note_issued: { label: "Debit note issued", tone: "success" },

  /* Approval rows */
  pending: { label: "Pending", tone: "warning" },

  /* Stock movements */
  receipt: { label: "Received", tone: "success" },
  issue: { label: "Issued", tone: "info" },
  return_to_supplier: { label: "Returned to supplier", tone: "neutral" },
  return_from_site: { label: "Returned from site", tone: "neutral" },
};

/** Last resort for a value the map has not been taught: never show snake_case. */
function fallback(status: string): Entry {
  const words = status.replace(/_/g, " ");
  return {
    label: words.charAt(0).toUpperCase() + words.slice(1),
    tone: "neutral",
  };
}

export function statusEntry(status: string): Entry {
  return STATUS_MAP[status] ?? fallback(status);
}

/** The plain label on its own, for a sentence or a filter tab. */
export function statusLabel(status: string): string {
  return statusEntry(status).label;
}

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
        "num inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold ring-1",
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
  stepCode,
  className,
}: {
  status: string;
  waitingOn?: string | null;
  stepCode?: string | null;
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
      {stepCode ? <span className="font-mono text-[10px] opacity-70">{stepCode}</span> : null}
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
