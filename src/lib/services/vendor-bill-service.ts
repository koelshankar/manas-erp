import { z } from "zod";
import { getRepositories } from "@/lib/data";
import {
  VENDOR_BILL_TRANSITIONS,
  nowIso,
  type VendorBill,
  type VendorBillLine,
} from "@/lib/domain";
import { assertCan, assertTransition, parseInput, qty, required, rupees } from "./guards";
import { nextDocumentNumber } from "./numbering";
import { ValidationError, WorkflowError, type ActingUser } from "./types";

/* ------------------------------------------------------------------ */
/* B7 — createVendorBill                                               */
/* ------------------------------------------------------------------ */

export const vendorBillLineInput = z.object({
  grn_line_id: z.string().min(1),
  billed_qty: z.number().positive("billed quantity must be greater than zero"),
  billed_rate: z.number().positive("billed rate must be greater than zero"),
  billed_gst_percent: z.number().min(0).max(28),
});

export const createVendorBillInput = z.object({
  project_id: z.string().min(1),
  supplier_id: z.string().min(1),
  bill_number: z.string().min(1, "the supplier's invoice number is required"),
  bill_date: z.string().min(1),
  received_date: z.string().min(1),
  remarks: z.string().default(""),
  lines: z.array(vendorBillLineInput).min(1, "a bill needs at least one line"),
});

export type CreateVendorBillInput = z.input<typeof createVendorBillInput>;

export type VendorBillResult = { bill: VendorBill; lines: VendorBillLine[] };

/** Two money figures agree if they are within a rupee. */
function moneyEq(a: number, b: number): boolean {
  return Math.abs(a - b) < 1;
}

/**
 * B7. Enters a supplier invoice against one or more GRNs and runs the
 * three-way match automatically:
 *
 *   billed quantity  vs  GRN accepted quantity
 *   billed rate      vs  PO rate
 *   billed GST       vs  PO GST
 *
 * Any difference flags the line and lands the bill in "mismatch". A mismatched
 * bill can still be verified later, but only with an override reason.
 */
export async function createVendorBill(
  input: CreateVendorBillInput,
  actor: ActingUser,
): Promise<VendorBillResult> {
  assertCan(actor, "create", "vendor_bills");
  const data = parseInput(createVendorBillInput, input);
  const repos = getRepositories();

  const project = required(await repos.projects.getById(data.project_id), "Project");
  const supplier = required(await repos.suppliers.getById(data.supplier_id), "Supplier");

  const grnLines = await repos.grns.listLinesByProject(project.id);
  const grnLineById = new Map(grnLines.map((l) => [l.id, l]));
  const grns = await repos.grns.listByProject(project.id);
  const grnById = new Map(grns.map((g) => [g.id, g]));
  const poLines = await repos.purchaseOrders.listLinesByProject(project.id);
  const poLineById = new Map(poLines.map((l) => [l.id, l]));

  const seen = new Set<string>();
  for (const [i, line] of data.lines.entries()) {
    const grnLine = grnLineById.get(line.grn_line_id);
    if (!grnLine) throw new ValidationError(`lines.${i}: not a GRN line on this project`);
    if (seen.has(line.grn_line_id)) {
      throw new ValidationError(`lines.${i}: the same GRN line appears twice`);
    }
    seen.add(line.grn_line_id);

    const grn = grnById.get(grnLine.grn_id);
    if (!grn || grn.supplier_id !== supplier.id) {
      throw new ValidationError(
        `lines.${i}: that GRN belongs to a different supplier — one bill covers one supplier`,
      );
    }
    const unbilled = qty(grnLine.accepted_qty - grnLine.billed_qty);
    if (unbilled <= 0) {
      throw new ValidationError(`lines.${i}: this GRN line has already been billed in full`);
    }
  }

  const at = nowIso();
  const reference_number = await nextDocumentNumber("VB", project, at);

  const draft = data.lines.map((line) => {
    const grnLine = grnLineById.get(line.grn_line_id)!;
    const poLine = required(poLineById.get(grnLine.po_line_id), "PO line");

    const billed_amount = rupees(line.billed_qty * line.billed_rate);
    const expected_amount = rupees(grnLine.accepted_qty * poLine.rate);
    const qty_matched = Math.abs(line.billed_qty - grnLine.accepted_qty) < 0.0005;
    const rate_matched = moneyEq(line.billed_rate, poLine.rate);
    const tax_matched = Math.abs(line.billed_gst_percent - poLine.gst_percent) < 0.0005;

    return {
      grnLine,
      poLine,
      row: {
        grn_id: grnLine.grn_id,
        grn_line_id: grnLine.id,
        po_line_id: poLine.id,
        material_id: grnLine.material_id,
        unit: grnLine.unit,
        billed_qty: qty(line.billed_qty),
        billed_rate: rupees(line.billed_rate),
        billed_gst_percent: line.billed_gst_percent,
        billed_amount,
        grn_accepted_qty: grnLine.accepted_qty,
        po_rate: poLine.rate,
        po_gst_percent: poLine.gst_percent,
        expected_amount,
        qty_matched,
        rate_matched,
        tax_matched,
        variance_amount: rupees(billed_amount - expected_amount),
      },
    };
  });

  const bill_basic_amount = rupees(draft.reduce((s, d) => s + d.row.billed_amount, 0));
  const bill_tax_amount = rupees(
    draft.reduce((s, d) => s + (d.row.billed_amount * d.row.billed_gst_percent) / 100, 0),
  );
  const expected_basic_amount = rupees(draft.reduce((s, d) => s + d.row.expected_amount, 0));
  const expected_tax_amount = rupees(
    draft.reduce((s, d) => s + (d.row.expected_amount * d.row.po_gst_percent) / 100, 0),
  );

  const is_quantity_matched = draft.every((d) => d.row.qty_matched);
  const is_rate_matched = draft.every((d) => d.row.rate_matched);
  const is_tax_matched = draft.every((d) => d.row.tax_matched);
  const matched = is_quantity_matched && is_rate_matched && is_tax_matched;

  const bill = await repos.vendorBills.create({
    project_id: project.id,
    bill_number: data.bill_number,
    reference_number,
    supplier_id: supplier.id,
    grn_ids: [...new Set(draft.map((d) => d.row.grn_id))],
    purchase_order_ids: [...new Set(draft.map((d) => d.grnLine.purchase_order_id))],
    bill_date: data.bill_date,
    received_date: data.received_date,
    status: matched ? "matched" : "mismatch",
    bill_basic_amount,
    bill_tax_amount,
    bill_total_amount: rupees(bill_basic_amount + bill_tax_amount),
    expected_basic_amount,
    expected_tax_amount,
    expected_total_amount: rupees(expected_basic_amount + expected_tax_amount),
    amount_variance: rupees(
      bill_basic_amount + bill_tax_amount - expected_basic_amount - expected_tax_amount,
    ),
    is_quantity_matched,
    is_rate_matched,
    is_tax_matched,
    entered_by_user_id: actor.user_id,
    verified_by_user_id: null,
    verified_at: null,
    override_reason: "",
    handed_over_at: null,
    remarks: data.remarks,
  });

  const lines: VendorBillLine[] = [];
  for (const d of draft) {
    lines.push(
      await repos.vendorBills.createLine({ project_id: project.id, vendor_bill_id: bill.id, ...d.row }),
    );
    await repos.grns.updateLine(d.grnLine.id, {
      billed_qty: qty(d.grnLine.billed_qty + d.row.billed_qty),
    });
  }

  return { bill, lines };
}

/* ------------------------------------------------------------------ */
/* B7 — verifyVendorBill                                               */
/* ------------------------------------------------------------------ */

export const verifyVendorBillInput = z.object({
  vendor_bill_id: z.string().min(1),
  override_reason: z.string().default(""),
});

export type VerifyVendorBillInput = z.input<typeof verifyVendorBillInput>;

/**
 * B7. Accepts the bill into the supplier account. A mismatched bill needs an
 * explicit override reason; a matched one does not.
 *
 * Verification is what credits the supplier ledger.
 */
export async function verifyVendorBill(
  input: VerifyVendorBillInput,
  actor: ActingUser,
): Promise<VendorBill> {
  assertCan(actor, "edit", "vendor_bills");
  const data = parseInput(verifyVendorBillInput, input);
  const repos = getRepositories();

  const bill = required(await repos.vendorBills.getById(data.vendor_bill_id), "Vendor bill");
  assertTransition("Vendor bill", VENDOR_BILL_TRANSITIONS, bill.status, "verified");

  if (bill.status === "mismatch" && data.override_reason.trim().length < 5) {
    throw new ValidationError(
      "override_reason: this bill failed the three-way match, so verifying it needs a reason",
    );
  }

  const at = nowIso();
  const verified = await repos.vendorBills.update(bill.id, {
    status: "verified",
    verified_by_user_id: actor.user_id,
    verified_at: at,
    override_reason: bill.status === "mismatch" ? data.override_reason : "",
  });

  await repos.supplierLedger.create({
    project_id: bill.project_id,
    supplier_id: bill.supplier_id,
    entry_date: bill.bill_date,
    entry_type: "bill",
    reference_type: "vendor_bill",
    reference_id: bill.id,
    reference_number: bill.bill_number,
    debit: 0,
    credit: bill.bill_total_amount,
    narration: `Invoice ${bill.bill_number} verified against ${bill.grn_ids.length} GRN(s)`,
  });

  return verified;
}

/* ------------------------------------------------------------------ */
/* B8 — handOverVendorBill                                             */
/* ------------------------------------------------------------------ */

/** B8. Releases the verified bill to Accounts. Nothing in this ERP edits it after. */
export async function handOverVendorBill(
  vendor_bill_id: string,
  actor: ActingUser,
): Promise<VendorBill> {
  assertCan(actor, "edit", "vendor_bills");
  const repos = getRepositories();

  const bill = required(await repos.vendorBills.getById(vendor_bill_id), "Vendor bill");
  assertTransition("Vendor bill", VENDOR_BILL_TRANSITIONS, bill.status, "handed_over");
  if (!bill.verified_by_user_id) {
    throw new WorkflowError("A bill must be verified before it goes to Accounts.");
  }

  return repos.vendorBills.update(bill.id, { status: "handed_over", handed_over_at: nowIso() });
}
