import type { DemoDatabase } from "../database";

/**
 * Puts one project's document numbers in date order.
 *
 * The threads are seeded scenario by scenario, not day by day, so the numbers
 * they hand out run backwards: the newest indent came out as 0001. Real
 * numbering follows the calendar — 0001 is the first document of the
 * financial year — so once everything is laid down, each kind is renumbered
 * by date within its year, and the ledger text that quotes a number follows.
 */
export function renumberByDate(db: DemoDatabase, project_id: string): void {
  const renamed = new Map<string, string>();

  const renumber = <T extends { id: string; project_id: string; created_at: string }>(
    rows: T[],
    get: (row: T) => string | null,
    set: (row: T, value: string) => void,
  ) => {
    const byYear = new Map<string, T[]>();
    rows
      .filter((r) => r.project_id === project_id && get(r))
      .forEach((r) => {
        // Everything but the sequence: MSP/IND/26-27/
        const prefix = get(r)!.replace(/\d+$/, "");
        byYear.set(prefix, [...(byYear.get(prefix) ?? []), r]);
      });
    byYear.forEach((group, prefix) => {
      group
        .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
        .forEach((row, i) => {
          const value = `${prefix}${String(i + 1).padStart(4, "0")}`;
          renamed.set(get(row)!, value);
          set(row, value);
        });
    });
  };

  renumber(db.indents, (r) => r.indent_number, (r, v) => (r.indent_number = v));
  renumber(db.comparatives, (r) => r.comparative_number, (r, v) => (r.comparative_number = v));
  renumber(db.purchase_orders, (r) => r.po_number, (r, v) => (r.po_number = v));
  renumber(db.grns, (r) => r.grn_number, (r, v) => (r.grn_number = v));
  renumber(db.material_issues, (r) => r.issue_number, (r, v) => (r.issue_number = v));
  renumber(db.returns, (r) => r.return_number, (r, v) => (r.return_number = v));
  renumber(db.returns, (r) => r.debit_note_number, (r, v) => (r.debit_note_number = v));
  renumber(db.vendor_bills, (r) => r.reference_number, (r, v) => (r.reference_number = v));
  renumber(
    db.joint_measurements,
    (r) => r.measurement_number,
    (r, v) => (r.measurement_number = v),
  );

  // One pass per string, so a number that was renamed onto another's old
  // value is not renamed twice.
  const pattern = /[A-Z]+\/[A-Z]+\/\d{2}-\d{2}\/\d{4}/g;
  const rewrite = (text: string) => text.replace(pattern, (n) => renamed.get(n) ?? n);
  db.stock_ledger_entries
    .filter((e) => e.project_id === project_id)
    .forEach((e) => (e.remarks = rewrite(e.remarks)));
  db.supplier_ledger_entries
    .filter((e) => e.project_id === project_id)
    .forEach((e) => {
      e.reference_number = rewrite(e.reference_number);
      e.narration = rewrite(e.narration);
    });
}
