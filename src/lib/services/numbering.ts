import type { DocumentKind, Project } from "@/lib/domain";
import { getRepositories } from "@/lib/data";
import { financialYear, formatDocumentNumber } from "./document-number";

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
  financialYear,
  formatDocumentNumber,
  seedDocumentNumber,
  raBillNumber,
} from "./document-number";

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
  }
}

/**
 * Next number for a document kind on a project.
 * `onDate` decides the financial year; defaults to today.
 */
export async function nextDocumentNumber(
  kind: DocumentKind,
  project: Pick<Project, "id" | "short_code">,
  onDate: string,
): Promise<string> {
  const fy = financialYear(onDate);
  const prefix = `${project.short_code}/${kind}/${fy}/`;
  const used = await existingNumbers(kind, project.id);
  const highest = used
    .filter((n) => n.startsWith(prefix))
    .map((n) => Number.parseInt(n.slice(prefix.length), 10))
    .filter((n) => Number.isFinite(n))
    .reduce((max, n) => Math.max(max, n), 0);
  return formatDocumentNumber(project.short_code, kind, fy, highest + 1);
}
