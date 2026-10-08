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

/** 21 Sep 2026, 07 Oct 2026 — two-digit day, always. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return format(parseISO(value), "dd MMM yyyy");
  } catch {
    return "—";
  }
}

/**
 * A requirement that is one day or a delivery window: "21 Sep 2026" or
 * "21 Sep – 30 Sep 2026" (the year is said once when both ends share it).
 */
export function formatRequiredBy(
  from: string | null | undefined,
  to?: string | null,
): string {
  if (!to || to === from) return formatDate(from);
  if (!from) return formatDate(to);
  try {
    const a = parseISO(from);
    const b = parseISO(to);
    return a.getFullYear() === b.getFullYear()
      ? `${format(a, "dd MMM")} – ${format(b, "dd MMM yyyy")}`
      : `${formatDate(from)} – ${formatDate(to)}`;
  } catch {
    return formatDate(from);
  }
}

/** 07 Oct 2026, 3:30 pm */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return format(parseISO(value), "dd MMM yyyy, h:mm a");
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

/**
 * An amount in words, Indian system — the line their purchase orders print
 * under the grand total.
 *
 * Lakh and crore, not million: "Rupees Twelve Lakh Forty Five Thousand Only".
 * Paise are rounded away, because every amount in the build is whole rupees and
 * a PO that says "and fifty paise" invites a question nobody wants.
 */
export function rupeesInWords(value: number | null | undefined): string {
  const amount = Math.round(Math.abs(value ?? 0));
  if (amount === 0) return "Rupees Zero Only";
  const sign = (value ?? 0) < 0 ? "Minus " : "";
  return `${sign}Rupees ${indianWords(amount)} Only`;
}

const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

/** Nought to 99, which is the largest group the Indian system ever needs. */
function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  const tens = TENS[Math.floor(n / 10)];
  const ones = ONES[n % 10];
  return ones ? `${tens} ${ones}` : tens;
}

function indianWords(n: number): string {
  /* Groups run 2-2-2-3 upwards from the hundreds: crore, lakh, thousand, hundred. */
  const parts: string[] = [];
  const crore = Math.floor(n / 10_000_000);
  const lakh = Math.floor((n % 10_000_000) / 100_000);
  const thousand = Math.floor((n % 100_000) / 1_000);
  const hundred = Math.floor((n % 1_000) / 100);
  const rest = n % 100;

  if (crore > 0) parts.push(`${indianWords(crore)} Crore`);
  if (lakh > 0) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand > 0) parts.push(`${twoDigits(thousand)} Thousand`);
  if (hundred > 0) parts.push(`${ONES[hundred]} Hundred`);
  if (rest > 0) parts.push(twoDigits(rest));
  return parts.join(" ");
}
