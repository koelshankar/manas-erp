import { beforeEach, describe, expect, it } from "vitest";
import { daysAheadDate, today } from "@/lib/clock";
import { buildSeed } from "@/lib/data/seed";
import { readDb, resetDemo } from "@/lib/data/local";
import * as D from "@/lib/domain";
import { createIndent } from "@/lib/services/indent-service";
import { boqLineByCode, materialByCode, project, reset, repos, SITE } from "./helpers";

beforeEach(reset);

const SCHEMAS: Record<string, { parse: (v: unknown) => unknown }> = {
  projects: D.projectSchema,
  users: D.userSchema,
  contractors: D.contractorSchema,
  materials: D.materialSchema,
  suppliers: D.supplierSchema,
  supplier_rates: D.supplierRateSchema,
  boq_lines: D.boqLineSchema,
  boq_material_budgets: D.boqMaterialBudgetSchema,
  work_orders: D.workOrderSchema,
  work_order_lines: D.workOrderLineSchema,
  site_tasks: D.siteTaskSchema,
  indents: D.indentSchema,
  indent_lines: D.indentLineSchema,
  comparatives: D.comparativeSchema,
  comparative_lines: D.comparativeLineSchema,
  quotes: D.quoteSchema,
  purchase_orders: D.purchaseOrderSchema,
  po_lines: D.poLineSchema,
  grns: D.grnSchema,
  grn_lines: D.grnLineSchema,
  stock_ledger_entries: D.stockLedgerEntrySchema,
  material_issues: D.materialIssueSchema,
  dprs: D.dprSchema,
  dpr_progress_entries: D.dprProgressEntrySchema,
  dpr_labour_entries: D.dprLabourEntrySchema,
  work_progress: D.workProgressSchema,
  joint_measurements: D.jointMeasurementSchema,
  joint_measurement_lines: D.jointMeasurementLineSchema,
  ra_bills: D.raBillSchema,
  ra_bill_lines: D.raBillLineSchema,
  ra_bill_revisions: D.raBillRevisionSchema,
  vendor_bills: D.vendorBillSchema,
  vendor_bill_lines: D.vendorBillLineSchema,
  returns: D.returnSchema,
  supplier_ledger_entries: D.supplierLedgerEntrySchema,
  approvals: D.approvalSchema,
  attachments: D.attachmentSchema,
};

describe("the seed", () => {
  it("validates against every domain schema", () => {
    const db = buildSeed();
    for (const [table, rows] of Object.entries(db)) {
      const schema = SCHEMAS[table];
      expect(schema, `no schema registered for ${table}`).toBeDefined();
      for (const row of rows) expect(() => schema.parse(row)).not.toThrow();
    }
  });

  it("issues no duplicate ids", () => {
    const db = buildSeed();
    const ids = Object.values(db).flatMap((rows) => rows.map((r) => r.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("is byte-for-byte deterministic", () => {
    expect(JSON.stringify(buildSeed())).toBe(JSON.stringify(buildSeed()));
  });

  it("keeps billed quantity inside measured, and measured inside what was done", () => {
    const db = buildSeed();
    const excessLines = new Set(
      db.joint_measurement_lines.filter((l) => l.is_excess).map((l) => l.work_order_line_id),
    );
    db.work_order_lines.forEach((line) => {
      expect(line.billed_qty).toBeLessThanOrEqual(line.measured_qty + 0.001);
      // Measuring past what was reported done is only legal on an excess line.
      if (!excessLines.has(line.id)) {
        expect(line.measured_qty).toBeLessThanOrEqual(line.done_qty + 0.001);
      }
    });
  });

  it("derives done_qty from the DPR progress entries and nothing else", () => {
    const db = buildSeed();
    const fromReports = new Map<string, number>();
    db.dpr_progress_entries.forEach((e) => {
      fromReports.set(
        e.work_order_line_id,
        (fromReports.get(e.work_order_line_id) ?? 0) + e.qty_done_today,
      );
    });
    db.work_order_lines.forEach((line) => {
      expect(line.done_qty).toBeCloseTo(fromReports.get(line.id) ?? 0, 2);
    });
  });

  it("keeps every RA bill's totals in step with its lines", () => {
    const db = buildSeed();
    db.ra_bills.forEach((bill) => {
      const lines = db.ra_bill_lines.filter((l) => l.ra_bill_id === bill.id);
      expect(lines.length).toBeGreaterThan(0);
      const gross = lines.reduce((s, l) => s + l.certified_qty * l.rate, 0);
      expect(bill.gross_amount).toBeCloseTo(gross, 1);
      expect(bill.retention_amount).toBeCloseTo((gross * bill.retention_percent) / 100, 1);
      expect(bill.tds_amount).toBeCloseTo((gross * bill.tds_percent) / 100, 1);
      expect(bill.net_payable_amount).toBeCloseTo(bill.gross_amount - bill.total_deductions, 1);
      lines.forEach((l) => expect(l.certified_qty).toBeLessThanOrEqual(l.claimed_qty + 0.001));
    });
  });

  it("gives every in-flight bill exactly one actionable chain step", () => {
    const db = buildSeed();
    db.ra_bills
      .filter((b) => b.status === "in_certification")
      .forEach((bill) => {
        const rows = db.approvals.filter(
          (a) => a.entity_type === "ra_bill" && a.entity_id === bill.id,
        );
        const pending = rows.filter((a) => a.status === "pending").sort((a, b) => a.sequence - b.sequence);
        expect(pending.length).toBeGreaterThan(0);
        expect(pending[0].sequence).toBe(bill.current_sequence);
        expect(pending[0].step_code).toBe(bill.current_step_code);
      });
  });

  it("numbers every document as <project>/<kind>/<FY>/<seq>", () => {
    const db = buildSeed();
    const pattern = /^(MSP|MGR|MHT)\/(IND|CMP|PO|GRN|ISS|RTN|DN|VB|JM)\/\d{2}-\d{2}\/\d{4}$/;
    db.indents.forEach((r) => expect(r.indent_number).toMatch(pattern));
    db.comparatives.forEach((r) => expect(r.comparative_number).toMatch(pattern));
    db.purchase_orders.forEach((r) => expect(r.po_number).toMatch(pattern));
    db.grns.forEach((r) => expect(r.grn_number).toMatch(pattern));
    db.material_issues.forEach((r) => expect(r.issue_number).toMatch(pattern));
    db.returns.forEach((r) => {
      expect(r.return_number).toMatch(pattern);
      if (r.debit_note_number) expect(r.debit_note_number).toMatch(pattern);
    });
    db.vendor_bills.forEach((r) => expect(r.reference_number).toMatch(pattern));
    db.joint_measurements.forEach((r) => expect(r.measurement_number).toMatch(pattern));
    // RA bills are numbered inside their work order instead.
    db.ra_bills.forEach((r) =>
      expect(r.bill_number).toMatch(/^(MSP|MGR|MHT)\/RA\/WO-\d+\/RA-\d{2}$/),
    );
  });

  it("keeps the stock ledger balance consistent with its movements", () => {
    const db = buildSeed();
    const running = new Map<string, number>();
    db.stock_ledger_entries.forEach((e) => {
      const key = `${e.project_id}:${e.material_id}`;
      const next = (running.get(key) ?? 0) + e.quantity_in - e.quantity_out;
      running.set(key, next);
      expect(e.balance_quantity).toBeCloseTo(next, 3);
    });
  });

  it("never lets a GRN accept more than its PO line ordered", () => {
    const db = buildSeed();
    const byPoLine = new Map<string, number>();
    db.grn_lines.forEach((l) => {
      byPoLine.set(l.po_line_id, (byPoLine.get(l.po_line_id) ?? 0) + l.received_qty);
    });
    db.po_lines.forEach((l) => {
      expect(byPoLine.get(l.id) ?? 0).toBeLessThanOrEqual(l.ordered_qty + 0.0005);
    });
  });

  it("only has people act on the projects they are posted to", () => {
    const db = buildSeed();
    const users = new Map(db.users.map((u) => [u.id, u]));
    const acts: Array<[string, string | null]> = [
      ...db.indents.map((r) => [r.project_id, r.raised_by_user_id] as [string, string]),
      ...db.approvals.map((r) => [r.project_id, r.actor_user_id] as [string, string | null]),
      ...db.dprs.map((r) => [r.project_id, r.prepared_by_user_id] as [string, string]),
      ...db.grns.map((r) => [r.project_id, r.received_by_user_id] as [string, string]),
      ...db.joint_measurements.map((r) => [r.project_id, r.measured_by_user_id] as [string, string]),
      ...db.attachments.map((r) => [r.project_id, r.uploaded_by_user_id] as [string, string]),
    ];
    acts.forEach(([project_id, user_id]) => {
      if (user_id) expect(users.get(user_id)?.assigned_project_ids).toContain(project_id);
    });
  });

  it("counts flats in whole numbers", () => {
    const db = buildSeed();
    const whole = (n: number) => expect(Number.isInteger(n)).toBe(true);
    db.work_order_lines
      .filter((l) => l.unit === "nos")
      .forEach((l) => [l.done_qty, l.measured_qty, l.billed_qty, l.ready_qty].forEach(whole));
    db.joint_measurement_lines.filter((l) => l.unit === "nos").forEach((l) => whole(l.measured_qty));
    db.ra_bill_lines
      .filter((l) => l.unit === "nos")
      .forEach((l) => [l.claimed_qty, l.certified_qty].forEach(whole));
  });

  it("numbers documents in date order within each financial year", () => {
    const db = buildSeed();
    const tables = [db.indents, db.purchase_orders, db.grns, db.material_issues, db.joint_measurements];
    tables.forEach((rows) => {
      const numbered = rows
        .map((r) => ({
          n: "indent_number" in r ? r.indent_number
            : "po_number" in r ? r.po_number
            : "grn_number" in r ? r.grn_number
            : "issue_number" in r ? r.issue_number
            : r.measurement_number,
          at: r.created_at,
        }))
        .sort((a, b) => a.n.localeCompare(b.n));
      for (let i = 1; i < numbered.length; i += 1) {
        const [prev, cur] = [numbered[i - 1], numbered[i]];
        if (prev.n.replace(/\d+$/, "") === cur.n.replace(/\d+$/, "")) {
          expect(cur.at >= prev.at).toBe(true);
        }
      }
    });
  });

  it("dates nothing before its project started", () => {
    const db = buildSeed();
    const start = new Map(db.projects.map((p) => [p.id, p.start_date]));
    [...db.purchase_orders, ...db.grns, ...db.material_issues, ...db.joint_measurements].forEach(
      (r) => expect(r.created_at.slice(0, 10) >= start.get(r.project_id)!).toBe(true),
    );
  });

  it("reads each task's state and progress off the work done", () => {
    const db = buildSeed();
    const lines = new Map(db.work_order_lines.map((l) => [l.id, l]));
    db.site_tasks.forEach((t) => {
      const line = lines.get(t.work_order_line_id!)!;
      expect(t.progress_percent).toBe(Math.min(100, Math.round((line.done_qty / line.quantity) * 100)));
      if (t.status === "completed") expect(t.planned_end <= today()).toBe(true);
      if (t.status === "planned") expect(line.done_qty).toBe(0);
    });
  });
});

describe("resetDemo", () => {
  it("restores the seed exactly, discarding anything the demo user did", async () => {
    const before = JSON.stringify(readDb());

    const p = await project();
    const boq = await boqLineByCode(p.id, "BOQ-07");
    const cement = await materialByCode("MAT-001");
    await createIndent(
      {
        project_id: p.id,
        lines: [
          {
            boq_line_id: boq.id,
            material_id: cement.id,
            requested_qty: 25,
            required_by: daysAheadDate(9),
            remarks: "",
          },
        ],
      },
      await SITE(),
    );
    expect(JSON.stringify(readDb())).not.toBe(before);

    resetDemo();
    expect(JSON.stringify(readDb())).toBe(before);
    expect((await repos().indents.list()).length).toBe(buildSeed().indents.length);
  });
});

describe("the certification chain in the seed", () => {
  it("opens all four rows on every bill that reached the chain", () => {
    const db = buildSeed();
    db.ra_bills
      .filter((b) => b.status !== "draft")
      .forEach((bill) => {
        const rows = db.approvals.filter(
          (a) => a.entity_type === "ra_bill" && a.entity_id === bill.id,
        );
        expect(rows).toHaveLength(4);
        expect(rows.map((r) => r.sequence).sort()).toEqual([1, 2, 3, 4]);
      });
  });

  it("leaves later steps pending behind the current one", () => {
    const db = buildSeed();
    const bill = db.ra_bills.find((b) => b.current_sequence === 1)!;
    const rows = db.approvals
      .filter((a) => a.entity_type === "ra_bill" && a.entity_id === bill.id)
      .sort((a, b) => a.sequence - b.sequence);
    expect(rows.every((r) => r.status === "pending")).toBe(true);
  });

  it("marks the step that sent a bill back, and stops the bill there", () => {
    const db = buildSeed();
    const sentBack = db.ra_bills.find((b) => b.status === "draft" && b.decision_comment)!;
    const rows = db.approvals.filter(
      (a) => a.entity_type === "ra_bill" && a.entity_id === sentBack.id,
    );
    expect(rows.some((r) => r.status === "sent_back" && r.comment.length > 0)).toBe(true);
    expect(sentBack.current_sequence).toBeNull();
  });
});
