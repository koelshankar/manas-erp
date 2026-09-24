import type { DocumentKind } from "@/lib/domain";

/**
 * Document number formatting, with no data-layer imports so the deterministic
 * seed can use it without pulling the store into a cycle.
 *
 * Format: <PROJECT_SHORT>/<KIND>/<FY>/<SEQ>   e.g. MSP/IND/26-27/0014
 */

/** Indian financial year label for a date: 1 Apr – 31 Mar. */
export function financialYear(isoDate: string): string {
  const d = new Date(isoDate);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth(); // 0 = Jan
  const startYear = month >= 3 ? year : year - 1;
  const short = (n: number) => String(n % 100).padStart(2, "0");
  return `${short(startYear)}-${short(startYear + 1)}`;
}

export function formatDocumentNumber(
  short_code: string,
  kind: DocumentKind,
  fy: string,
  sequence: number,
): string {
  return `${short_code}/${kind}/${fy}/${String(sequence).padStart(4, "0")}`;
}

/** Synchronous variant used by the deterministic seed, which knows its counts. */
export function seedDocumentNumber(
  short_code: string,
  kind: DocumentKind,
  onDate: string,
  sequence: number,
): string {
  return formatDocumentNumber(short_code, kind, financialYear(onDate), sequence);
}

/**
 * RA bills are numbered within their work order, not the project year:
 * MSP/RA/WO-001/RA-03. The work-order suffix is the last segment of its number.
 */
export function raBillNumber(short_code: string, wo_number: string, sequence: number): string {
  const suffix = wo_number.split("/").pop() ?? wo_number;
  return `${short_code}/RA/WO-${suffix}/RA-${String(sequence).padStart(2, "0")}`;
}
