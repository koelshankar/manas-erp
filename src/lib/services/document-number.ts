import type { DocumentKind } from "@/lib/domain";
import { ISSUING_COMPANY } from "@/config/po-document";

/**
 * Document number formatting, with no data-layer imports so the deterministic
 * seed can use it without pulling the store into a cycle. `ISSUING_COMPANY`
 * is a plain config constant, not a data-layer import, so it is safe to pull
 * in here.
 *
 * Format: <PROJECT_SHORT>/<KIND>/<FY>/<SEQ>   e.g. MSP/IND/26-27/0014
 *
 * The purchase order is the one exception: Manas's own orders number
 * Pur/<company code>/<project>/<FY>/<serial> — the prefix and a fixed company
 * segment lead, ahead of the project code, rather than trailing it. The
 * `SeriesShape` fields still mean exactly what they always have — `prefix`,
 * `include_project_code`, `include_financial_year`, `serial_width` and
 * `separator` all still apply, and still come from the editable series in
 * Masters — only their *order* differs for this one kind, and the company
 * segment is fixed (not configurable; no `SeriesShape` field for it, so no
 * schema change).
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

/**
 * How a series is built. Mirrors the editable `DocumentSeries` row, with the
 * defaults the build has always used — so leaving the settings alone produces
 * exactly the numbers it produced before.
 */
export type SeriesShape = {
  prefix: string;
  serial_width: number;
  include_project_code: boolean;
  include_financial_year: boolean;
  separator: string;
};

export function defaultSeriesShape(kind: DocumentKind): SeriesShape {
  return {
    prefix: kind === "PO" ? "Pur" : kind,
    serial_width: 4,
    include_project_code: true,
    include_financial_year: true,
    separator: "/",
  };
}

/** Every segment before the serial, in the order this kind prints them. */
function numberSegments(
  short_code: string,
  kind: DocumentKind,
  fy: string,
  shape: SeriesShape,
): string[] {
  const project = shape.include_project_code ? [short_code] : [];
  const year = shape.include_financial_year ? [fy] : [];
  if (kind === "PO") {
    // Pur/<company>/<project?>/<FY?> — prefix and company lead.
    return [shape.prefix, ISSUING_COMPANY.code, ...project, ...year];
  }
  return [...project, shape.prefix, ...year];
}

export function formatDocumentNumber(
  short_code: string,
  kind: DocumentKind,
  fy: string,
  sequence: number,
  shape: SeriesShape = defaultSeriesShape(kind),
): string {
  const serial = String(sequence).padStart(shape.serial_width, "0");
  return [...numberSegments(short_code, kind, fy, shape), serial].join(shape.separator);
}

/** The fixed part of a series, used to find the numbers already issued under it. */
export function documentNumberPrefix(
  short_code: string,
  kind: DocumentKind,
  fy: string,
  shape: SeriesShape = defaultSeriesShape(kind),
): string {
  return `${numberSegments(short_code, kind, fy, shape).join(shape.separator)}${shape.separator}`;
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
