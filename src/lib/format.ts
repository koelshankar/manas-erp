import { format, parseISO } from "date-fns";

/** ₹12,45,000 — Indian digit grouping, no decimals. */
export function formatInr(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

/** ₹1.25 Cr / ₹12.45 L / ₹45,000 — for tiles where the full figure is too wide. */
export function formatInrCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1e7) return `₹${(value / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `₹${(value / 1e5).toFixed(2)} L`;
  return formatInr(value);
}

/** 12,45,000 — number only, Indian grouping. */
export function formatNumber(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  }).format(value);
}

export function formatQuantity(value: number | null | undefined, unit?: string): string {
  const n = formatNumber(value, 2);
  return unit ? `${n} ${unit}` : n;
}

/** 21 Sep 2026 */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return format(parseISO(value), "d MMM yyyy");
  } catch {
    return "—";
  }
}

/** 21 Sep 2026, 3:30 pm */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return format(parseISO(value), "d MMM yyyy, h:mm a");
  } catch {
    return "—";
  }
}

export function formatPercent(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

/** pending_approval -> Pending approval */
export function humanise(value: string | null | undefined): string {
  if (!value) return "—";
  const s = value.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * "1 bill" / "3 bills" — one helper so no caption ever reads "1 bills".
 *
 * Pass an irregular plural where English refuses to co-operate
 * (`countOf(n, "entry", "entries")`).
 */
export function countOf(n: number, singular: string, plural?: string): string {
  return `${formatNumber(n)} ${n === 1 ? singular : (plural ?? `${singular}s`)}`;
}

/** "1 bill fails" / "3 bills fail" — agreement on the verb as well. */
export function countVerb(
  n: number,
  singular: string,
  verbSingular: string,
  verbPlural: string,
  plural?: string,
): string {
  return `${countOf(n, singular, plural)} ${n === 1 ? verbSingular : verbPlural}`;
}
