/**
 * THE status vocabulary. Every status in the system gets a plain-English
 * label and one of five tones here, and nowhere else.
 *
 * It lives in config rather than beside the chip that renders it because it
 * is data, not a component: the tests read it directly, and a label is a
 * decision about the product, not about markup.
 *
 * Tone is state, never team and never seniority:
 *   neutral      nothing is happening yet, or the record is finished and filed
 *   info         in flight, moving as it should
 *   success      done, agreed, matched
 *   warning      waiting on a person
 *   destructive  refused, wrong, or stopped
 */
export type Tone = "neutral" | "info" | "success" | "warning" | "destructive";

export const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground ring-border",
  info: "bg-info-soft text-info ring-info/30",
  success: "bg-success-soft text-success ring-success/30",
  warning: "bg-warning-soft text-warning ring-warning/30",
  destructive: "bg-danger-soft text-destructive ring-destructive/30",
};

type Entry = { label: string; tone: Tone };

/**
 * ONE status vocabulary, across every module.
 *
 * An indent said "Awaiting approval", a comparative said "Awaiting approval",
 * and an approval row said "Pending" — three modules, one state, two words
 * for it. Someone who learns the system on indents should not have to learn
 * it again on bills.
 *
 * So the shared states are named once, here, and the map below is built from
 * these constants rather than from string literals typed out per entity.
 * Two entities that mean the same thing are now the same string *by
 * construction*; they cannot drift apart in a later edit, because there is
 * only one place the word lives.
 *
 * What is deliberately *not* collapsed is states that differ in substance.
 * "Part received" is not "In progress": a storeman needs to know half the
 * load is still on the road. Unifying the vocabulary means one name per
 * state, not one name for every state.
 */
const SAY = {
  /** Not submitted. Belongs to whoever is writing it. */
  draft: "Draft",
  /** On someone's desk, waiting for a decision. */
  awaiting: "Awaiting approval",
  /** Passed its gate. */
  approved: "Approved",
  /** Some of it passed. */
  partApproved: "Part approved",
  /** Returned for correction — it will come back. */
  sentBack: "Sent back",
  /** Refused. It will not come back. */
  rejected: "Rejected",
  /** Everything arrived or was completed. */
  received: "Received",
  /** Some arrived; the rest is still coming. */
  partReceived: "Part received",
  /** Finished and filed. Nothing further is expected. */
  closed: "Closed",
} as const;

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

  /* --- The gate states. Shared by every module that has a gate. --- */
  draft: { label: SAY.draft, tone: "neutral" },
  submitted: { label: SAY.awaiting, tone: "warning" },
  pending_approval: { label: SAY.awaiting, tone: "warning" },
  pending: { label: SAY.awaiting, tone: "warning" },
  approved: { label: SAY.approved, tone: "success" },
  partially_approved: { label: SAY.partApproved, tone: "warning" },
  sent_back: { label: SAY.sentBack, tone: "destructive" },
  rejected: { label: SAY.rejected, tone: "destructive" },

  /* --- Delivery, shared by the indent, the PO and the GRN. --- */
  partially_received: { label: SAY.partReceived, tone: "info" },
  received: { label: SAY.received, tone: "success" },
  /* A GRN has one state and it means the goods are in. */
  posted: { label: SAY.received, tone: "success" },
  closed: { label: SAY.closed, tone: "neutral" },

  /* Indent, in the middle of the material thread */
  in_comparative: { label: "With purchase", tone: "info" },
  po_raised: { label: "PO raised", tone: "info" },

  /* Purchase order (B3 -> B4). "Issued" is their word for it, and it is the
     verb on the button that gets a PO here, so the chip says the same thing. */
  sent: { label: "Issued to supplier", tone: "info" },

  /* Joint measurement (C1) */
  signed: { label: "Signed", tone: "success" },
  billed: { label: "Billed", tone: "neutral" },

  /* RA bill (C2 -> C5) */
  in_certification: { label: "In certification", tone: "info" },
  certified: { label: "Certified", tone: "success" },
  handed_over: { label: "Handed to accounts", tone: "neutral" },

  /* Vendor bill (B7 -> B8). The three-way match is a check, not a sign-off,
     so these are its own words and not the gate vocabulary above. */
  matched: { label: "Matched", tone: "success" },
  mismatch: { label: "Mismatch", tone: "destructive" },
  verified: { label: "Verified", tone: "success" },

  /* Returns */
  raised: { label: "Raised", tone: "warning" },
  dispatched: { label: "Dispatched", tone: "info" },
  debit_note_issued: { label: "Debit note issued", tone: "success" },

  /* Stock movements */
  receipt: { label: SAY.received, tone: "success" },
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

