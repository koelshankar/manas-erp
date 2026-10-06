import type { DocumentKind, Project } from "@/lib/domain";
import { getRepositories } from "@/lib/data";
import {
  defaultSeriesShape,
  documentNumberPrefix,
  financialYear,
  formatDocumentNumber,
  type SeriesShape,
} from "./document-number";

/**
 * Document numbering, in one place.
 *
 * Format: <PROJECT_SHORT>/<KIND>/<FY>/<SEQ>
 * e.g.    MSP/IND/26-27/0014
 *
 * The sequence is derived by counting existing documents of the same kind for
 * the same project and financial year, so it needs no counter table and stays
 * correct after resetDemo(). When this moves to Postgres, replace the count
 * with a sequence or an `ON CONFLICT` retry — the format stays identical.
 */
export {
  defaultSeriesShape,
  documentNumberPrefix,
  financialYear,
  formatDocumentNumber,
  seedDocumentNumber,
  raBillNumber,
} from "./document-number";
export type { SeriesShape } from "./document-number";

/** Every document number already issued, keyed by the kind that owns it. */
async function existingNumbers(kind: DocumentKind, project_id: string): Promise<string[]> {
  const repos = getRepositories();
  switch (kind) {
    case "IND":
      return (await repos.indents.listByProject(project_id)).map((r) => r.indent_number);
    case "CMP":
      return (await repos.comparatives.listByProject(project_id)).map((r) => r.comparative_number);
    case "PO":
      return (await repos.purchaseOrders.listByProject(project_id)).map((r) => r.po_number);
    case "GRN":
      return (await repos.grns.listByProject(project_id)).map((r) => r.grn_number);
    case "ISS":
      return (await repos.stock.listIssuesByProject(project_id)).map((r) => r.issue_number);
    case "RTN":
      return (await repos.returns.listByProject(project_id)).map((r) => r.return_number);
    case "DN":
      return (await repos.returns.listByProject(project_id))
        .map((r) => r.debit_note_number)
        .filter((n): n is string => Boolean(n));
    case "VB":
      return (await repos.vendorBills.listByProject(project_id)).map((r) => r.reference_number);
    case "JM":
      return (await repos.measurements.listByProject(project_id)).map((r) => r.measurement_number);
    case "GP":
      return (await repos.gatePasses.listByProject(project_id)).map((r) => r.gate_pass_number);
    case "MTO":
      return (await repos.materialTransfers.listByProject(project_id)).map(
        (r) => r.transfer_number,
      );
    case "DT":
      return (await repos.transmittals.listByProject(project_id)).map(
        (r) => r.transmittal_number,
      );
  }
}

/**
 * The series settings for a kind, from Masters, falling back to the shape the
 * build has always used when no row exists.
 */
async function seriesShapeFor(kind: DocumentKind): Promise<SeriesShape> {
  const row = await getRepositories().documentSeries.getByKind(kind);
  if (!row) return defaultSeriesShape(kind);
  return {
    prefix: row.prefix,
    serial_width: row.serial_width,
    include_project_code: row.include_project_code,
    include_financial_year: row.include_financial_year,
    separator: row.separator,
  };
}

/**
 * Next number for a document kind on a project.
 * `onDate` decides the financial year; defaults to today.
 *
 * The prefix, the padding and whether the project code and financial year
 * appear at all come from the editable series in Masters — Manas have not
 * confirmed their own series yet, and renumbering a demo by hand is not a
 * conversation worth having on the day. Numbers already issued are never
 * rewritten: only what the *next* document takes changes.
 */
export async function nextDocumentNumber(
  kind: DocumentKind,
  project: Pick<Project, "id" | "short_code">,
  onDate: string,
): Promise<string> {
  const fy = financialYear(onDate);
  const shape = await seriesShapeFor(kind);
  const prefix = documentNumberPrefix(project.short_code, kind, fy, shape);
  const used = await existingNumbers(kind, project.id);
  const highest = used
    .filter((n) => n.startsWith(prefix))
    .map((n) => Number.parseInt(n.slice(prefix.length), 10))
    .filter((n) => Number.isFinite(n))
    .reduce((max, n) => Math.max(max, n), 0);
  const series = await getRepositories().documentSeries.getByKind(kind);
  const next = highest > 0 ? highest + 1 : (series?.start_serial ?? 1);
  return formatDocumentNumber(project.short_code, kind, fy, next, shape);
}
