import type {
  Approval,
  BoqLine,
  BoqMaterialBudget,
  Comparative,
  ComparativeLine,
  ComparativeStatus,
  Grn,
  GrnLine,
  Indent,
  IndentLine,
  IndentStatus,
  MaterialIssue,
  PoLine,
  PoStatus,
  Project,
  PurchaseOrder,
  Quote,
  Return,
  ReturnStatus,
  StockLedgerEntry,
  Supplier,
  VendorBill,
  VendorBillLine,
  WorkOrder,
} from "@/lib/domain";
import { landedCost, splitTax } from "@/lib/services/pricing";
import { APPROVAL_CHAINS } from "@/config/permissions";
import type { DemoDatabase } from "../database";
import type { ProjectPlan } from "./catalog";
import { baseRateOf, materialByCode, suppliersForCategory, userByRole, type Masters } from "./masters";
import { daysAgoDate, daysAgoIso, daysAheadDate, jitter, rupees, sid } from "./ids";
import { seedDocumentNumber } from "@/lib/services/document-number";
import type { Counters } from "./project-seed";

/**
 * The A2 -> B8 material thread, seeded so that every queue in the workflow has
 * something realistic sitting in it on every project:
 *
 *   IND-1  submitted, within the BOQ material balance   -> PH approval queue
 *   IND-2  submitted, EXCEEDING the BOQ balance         -> PH approval queue
 *   IND-3  partially approved (one line reduced)        -> ready to quote
 *   IND-4  in comparative, selection is NOT L1          -> B2 queue
 *   IND-5  released again after its comparative was sent back
 *   IND-6  PO raised and sent, awaiting delivery
 *   IND-7  PO partially received; vendor bill has a RATE MISMATCH
 *   IND-8  PO received with a rejection -> return -> debit note;
 *          vendor bill matched, verified and handed over to Accounts
 *
 * Everything is derived, never hand-typed, and uses the same landedCost() and
 * splitTax() the services use, so the seed can never contradict the rules.
 */

type Ctx = {
  db: DemoDatabase;
  plan: ProjectPlan;
  index: number;
  masters: Masters;
  counters: Counters;
  project: Project;
  boqLines: BoqLine[];
  materialBudgets: BoqMaterialBudget[];
  workOrders: WorkOrder[];
};

function next(c: Counters, key: string): number {
  c[key] = (c[key] ?? 0) + 1;
  return c[key];
}

/** Per-project document sequence, so numbers read 0001, 0002, … per kind. */
function docSeq(c: Counters, project_code: string, kind: string): number {
  return next(c, `doc:${project_code}:${kind}`);
}

/**
 * Lays down the material thread, and hands back the consumption history for
 * the caller to run once the billing thread has decided how far each line has
 * got — history follows progress, so it cannot be written before progress is.
 */
export function seedMaterialThread(ctx: Ctx): (lineShare: Map<string, number>) => void {
  const { db, plan, masters, counters, project, boqLines, materialBudgets } = ctx;
  const se = userByRole(masters.users, "site_engineer");
  const ph = userByRole(masters.users, "project_head");
  const po_user = userByRole(masters.users, "purchase_officer");
  const pur_head = userByRole(masters.users, "purchase_head");

  const boqByCode = new Map(boqLines.map((b) => [b.item_code, b]));
  const budgetFor = (item_code: string, material_code: string) => {
    const boq = boqByCode.get(item_code)!;
    const material = materialByCode(masters.materials, material_code);
    const budget = materialBudgets.find(
      (b) => b.boq_line_id === boq.id && b.material_id === material.id,
    );
    return { boq, material, budget };
  };

  /* ================================================================== */
  /* Builders                                                           */
  /* ================================================================== */

  type LineSpec = {
    item_code: string;
    material_code: string;
    /** Fraction of the remaining BOQ material balance to ask for. */
    share: number;
    /** Overrides `share` with an absolute quantity. */
    absolute?: number;
    /** null = not yet decided, otherwise the approved quantity. */
    approved?: number | null;
    rejection_reason?: string;
  };

  function makeIndent(opts: {
    seq: number;
    days_ago: number;
    status: IndentStatus;
    lines: LineSpec[];
    remarks: string;
    approval: "pending" | "approved" | "rejected";
  }): { indent: Indent; lines: IndentLine[] } {
    const raisedIso = daysAgoIso(opts.days_ago);
    const indent_id = sid("indent", next(counters, "indent"));
    const decidedIso = daysAgoIso(Math.max(0, opts.days_ago - 1));
    const decided = opts.approval !== "pending";

    const lines: IndentLine[] = opts.lines.map((spec, li) => {
      const { boq, material, budget } = budgetFor(spec.item_code, spec.material_code);
      const requested_qty =
        spec.absolute ??
        Math.round((budget?.budget_qty ?? 100) * spec.share * (0.9 + jitter(li + opts.seq) * 0.2));
      const approved_qty =
        opts.approval === "pending"
          ? null
          : spec.approved === undefined
            ? requested_qty
            : spec.approved;
      return {
        id: sid("indent_line", next(counters, "indent_line")),
        project_id: project.id,
        created_at: raisedIso,
        updated_at: decided ? decidedIso : raisedIso,
        indent_id,
        boq_line_id: boq.id,
        material_id: material.id,
        unit: material.unit,
        requested_qty,
        approved_qty,
        rejection_reason: approved_qty === 0 ? (spec.rejection_reason ?? "Not required this cycle") : "",
        ordered_qty: 0,
        received_qty: 0,
        required_by: daysAheadDate(Math.max(2, 18 - opts.days_ago)),
        remarks: "",
      };
    });

    const indent: Indent = {
      id: indent_id,
      project_id: project.id,
      created_at: raisedIso,
      updated_at: decided ? decidedIso : raisedIso,
      indent_number: seedDocumentNumber(plan.short_code, "IND", raisedIso, docSeq(counters, plan.code, "IND")),
      site_task_id: null,
      work_order_id: ctx.workOrders[opts.seq % Math.max(ctx.workOrders.length, 1)]?.id ?? null,
      raised_by_user_id: se.id,
      raised_date: daysAgoDate(opts.days_ago),
      required_by_date: lines.map((l) => l.required_by).sort()[0],
      status: opts.status,
      remarks: opts.remarks,
      approved_by_user_id: decided ? ph.id : null,
      approved_at: decided ? decidedIso : null,
      approval_comment: decided ? "Checked against the BOQ material budget and the work order." : "",
    };

    db.indents.push(indent);
    db.indent_lines.push(...lines);

    const step = APPROVAL_CHAINS.indent[0];
    const approval: Approval = {
      id: sid("approval", next(counters, "approval")),
      created_at: raisedIso,
      updated_at: decided ? decidedIso : raisedIso,
      project_id: project.id,
      entity_type: "indent",
      entity_id: indent_id,
      step_code: step.step_code,
      sequence: step.sequence,
      required_role: step.required_role,
      status: opts.approval,
      actor_user_id: decided ? ph.id : null,
      comment: decided ? indent.approval_comment : "",
      acted_at: decided ? decidedIso : null,
    };
    db.approvals.push(approval);

    return { indent, lines };
  }

  /** Three quotes per line, priced off the supplier rate card with a spread. */
  function makeComparative(opts: {
    days_ago: number;
    status: ComparativeStatus;
    indents: Array<{ indent: Indent; lines: IndentLine[] }>;
    /** Pick the second-cheapest supplier instead of L1, with a justification. */
    pick_non_l1?: boolean;
    justification?: string;
    decision_comment?: string;
    approval: "pending" | "approved" | "rejected" | null;
  }): { comparative: Comparative; lines: ComparativeLine[] } {
    const preparedIso = daysAgoIso(opts.days_ago);
    const comparative_id = sid("comparative", next(counters, "comparative"));
    const decided = opts.status === "approved" || opts.status === "sent_back";
    const decidedIso = daysAgoIso(Math.max(0, opts.days_ago - 2));

    const lines: ComparativeLine[] = [];
    let total = 0;

    opts.indents.forEach(({ indent, lines: indentLines }) => {
      indentLines
        .filter((l) => (l.approved_qty ?? 0) > 0)
        .forEach((indentLine, li) => {
          const material = masters.materials.find((m) => m.id === indentLine.material_id)!;
          const candidates = suppliersForCategory(masters.suppliers, material.category).slice(0, 3);
          const quantity = indentLine.approved_qty!;
          const line_id = sid("comparative_line", next(counters, "comparative_line"));

          const priced = candidates.map((supplier, si) => {
            const card = masters.supplier_rates.find(
              (r) => r.supplier_id === supplier.id && r.material_id === material.id,
            );
            const base = card?.rate ?? 100;
            const nudge = 0.97 + jitter(li * 17 + si * 5 + opts.days_ago) * 0.08;
            const rate = rupees(base * nudge);
            const freight_amount = rupees(quantity * rate * 0.008 + si * 250);
            return {
              supplier,
              rate,
              gst_percent: material.gst_percent,
              freight_amount,
              delivery_days: card?.lead_time_days ?? 5,
              payment_terms: `${supplier.payment_terms_days} days from GRN`,
              ...landedCost(quantity, rate, material.gst_percent, freight_amount),
            };
          });

          const ranked = [...priced].sort((a, b) => a.landed_rate - b.landed_rate);
          const l1 = ranked[0];
          const chosen = opts.pick_non_l1 && ranked.length > 1 ? ranked[1] : l1;
          const is_l1_selected = chosen.supplier.id === l1.supplier.id;

          let selected_quote_id: string | null = null;
          const quotes: Quote[] = priced.map((q) => {
            const quote: Quote = {
              id: sid("quote", next(counters, "quote")),
              project_id: project.id,
              created_at: preparedIso,
              updated_at: preparedIso,
              comparative_id,
              comparative_line_id: line_id,
              material_id: material.id,
              supplier_id: q.supplier.id,
              unit: indentLine.unit,
              quantity,
              rate: q.rate,
              gst_percent: q.gst_percent,
              freight_amount: q.freight_amount,
              delivery_days: q.delivery_days,
              payment_terms: q.payment_terms,
              basic_amount: q.basic_amount,
              tax_amount: q.tax_amount,
              landed_amount: q.landed_amount,
              landed_rate: q.landed_rate,
              is_l1: q.supplier.id === l1.supplier.id,
              is_selected: q.supplier.id === chosen.supplier.id,
              remarks: q.supplier.id === l1.supplier.id ? "Lowest landed rate." : "",
            };
            if (quote.is_selected) selected_quote_id = quote.id;
            return quote;
          });
          db.quotes.push(...quotes);

          total += chosen.landed_amount;
          lines.push({
            id: line_id,
            project_id: project.id,
            created_at: preparedIso,
            updated_at: preparedIso,
            comparative_id,
            indent_id: indent.id,
            indent_line_id: indentLine.id,
            boq_line_id: indentLine.boq_line_id,
            material_id: material.id,
            unit: indentLine.unit,
            quantity,
            selected_supplier_id: chosen.supplier.id,
            selected_quote_id,
            is_l1_selected,
            justification: is_l1_selected
              ? ""
              : (opts.justification ??
                "L1 could not commit to the site delivery window; L2 confirmed in writing."),
          });
        });
    });

    const comparative: Comparative = {
      id: comparative_id,
      project_id: project.id,
      created_at: preparedIso,
      updated_at: decided ? decidedIso : preparedIso,
      comparative_number: seedDocumentNumber(
        plan.short_code,
        "CMP",
        preparedIso,
        docSeq(counters, plan.code, "CMP"),
      ),
      indent_ids: opts.indents.map((i) => i.indent.id),
      prepared_by_user_id: po_user.id,
      prepared_date: preparedIso.slice(0, 10),
      status: opts.status,
      submitted_at: opts.status === "draft" ? null : preparedIso,
      decided_by_user_id: decided ? pur_head.id : null,
      decided_at: decided ? decidedIso : null,
      decision_comment: decided
        ? (opts.decision_comment ?? "Rates approved. Raise the purchase orders.")
        : "",
      total_selected_value: rupees(total),
      remarks: "",
    };
    db.comparatives.push(comparative);
    db.comparative_lines.push(...lines);

    if (opts.approval) {
      const step = APPROVAL_CHAINS.comparative[0];
      db.approvals.push({
        id: sid("approval", next(counters, "approval")),
        created_at: preparedIso,
        updated_at: decided ? decidedIso : preparedIso,
        project_id: project.id,
        entity_type: "comparative",
        entity_id: comparative_id,
        step_code: step.step_code,
        sequence: step.sequence,
        required_role: step.required_role,
        status: opts.approval,
        actor_user_id: decided ? pur_head.id : null,
        comment: decided ? comparative.decision_comment : "",
        acted_at: decided ? decidedIso : null,
      });
    }

    return { comparative, lines };
  }

  function makePurchaseOrders(opts: {
    comparative: Comparative;
    lines: ComparativeLine[];
    days_ago: number;
    status: PoStatus;
  }): Array<{ po: PurchaseOrder; lines: PoLine[] }> {
    const poIso = daysAgoIso(opts.days_ago);
    const quotes = db.quotes.filter((q) => q.comparative_id === opts.comparative.id);
    const quoteById = new Map(quotes.map((q) => [q.id, q]));
    const supplierById = new Map(masters.suppliers.map((s) => [s.id, s]));

    const bySupplier = new Map<string, ComparativeLine[]>();
    opts.lines.forEach((l) => {
      const list = bySupplier.get(l.selected_supplier_id!) ?? [];
      list.push(l);
      bySupplier.set(l.selected_supplier_id!, list);
    });

    const result: Array<{ po: PurchaseOrder; lines: PoLine[] }> = [];

    for (const [supplier_id, group] of bySupplier) {
      const supplier: Supplier = supplierById.get(supplier_id)!;
      const po_id = sid("purchase_order", next(counters, "purchase_order"));
      let basic = 0;
      let freight = 0;
      let tax = 0;
      let maxLead = 0;

      const poLines: PoLine[] = group.map((line) => {
        const quote = quoteById.get(line.selected_quote_id!)!;
        basic += quote.basic_amount;
        freight += quote.freight_amount;
        tax += quote.tax_amount;
        maxLead = Math.max(maxLead, quote.delivery_days);
        return {
          id: sid("po_line", next(counters, "po_line")),
          project_id: project.id,
          created_at: poIso,
          updated_at: poIso,
          purchase_order_id: po_id,
          comparative_line_id: line.id,
          indent_id: line.indent_id,
          indent_line_id: line.indent_line_id,
          boq_line_id: line.boq_line_id,
          material_id: line.material_id,
          unit: line.unit,
          ordered_qty: line.quantity,
          rate: quote.rate,
          gst_percent: quote.gst_percent,
          freight_amount: quote.freight_amount,
          basic_amount: quote.basic_amount,
          tax_amount: quote.tax_amount,
          line_total: quote.landed_amount,
          received_qty: 0,
          rejected_qty: 0,
        };
      });

      const po: PurchaseOrder = {
        id: po_id,
        project_id: project.id,
        created_at: poIso,
        updated_at: poIso,
        po_number: seedDocumentNumber(plan.short_code, "PO", poIso, docSeq(counters, plan.code, "PO")),
        comparative_id: opts.comparative.id,
        indent_ids: [...new Set(group.map((l) => l.indent_id))],
        supplier_id,
        po_date: poIso.slice(0, 10),
        expected_delivery_date: daysAgoDate(opts.days_ago - maxLead),
        status: opts.status,
        raised_by_user_id: po_user.id,
        sent_at: opts.status === "draft" ? null : daysAgoIso(Math.max(0, opts.days_ago - 1)),
        basic_amount: rupees(basic),
        freight_amount: rupees(freight),
        ...splitTax(supplier.state, tax),
        total_amount: rupees(basic + freight + tax),
        delivery_address: `${project.name} site office, ${project.location}`,
        terms:
          "Delivery at site. Payment as per agreed credit period from GRN date. Rates inclusive of loading and unloading.",
      };

      db.purchase_orders.push(po);
      db.po_lines.push(...poLines);
      group.forEach((line) => {
        const indentLine = db.indent_lines.find((l) => l.id === line.indent_line_id);
        if (indentLine) indentLine.ordered_qty += line.quantity;
      });
      result.push({ po, lines: poLines });
    }

    return result;
  }

  /** Running balance per material so the ledger reads correctly in date order. */
  const balances = new Map<string, number>();

  function pushStock(entry: {
    material_id: string;
    date: string;
    in_qty: number;
    out_qty: number;
    rate: number;
    source_entity_type: string;
    source_entity_id: string;
    remarks: string;
  }): StockLedgerEntry {
    const balance =
      (balances.get(entry.material_id) ?? 0) + entry.in_qty - entry.out_qty;
    balances.set(entry.material_id, balance);
    const row: StockLedgerEntry = {
      id: sid("stock_ledger_entry", next(counters, "stock_ledger_entry")),
      project_id: project.id,
      created_at: entry.date,
      updated_at: entry.date,
      material_id: entry.material_id,
      movement_type: entry.in_qty > 0 ? "receipt" : "issue",
      movement_date: entry.date.slice(0, 10),
      quantity_in: entry.in_qty,
      quantity_out: entry.out_qty,
      balance_quantity: Math.round(balance * 1000) / 1000,
      rate: entry.rate,
      value: rupees((entry.in_qty + entry.out_qty) * entry.rate),
      source_entity_type: entry.source_entity_type,
      source_entity_id: entry.source_entity_id,
      remarks: entry.remarks,
    };
    db.stock_ledger_entries.push(row);
    return row;
  }

  type ReceiptSpec = { po_line_id: string; received: number; accepted: number; rejected: number; reason: string };

  function makeGrn(opts: {
    po: PurchaseOrder;
    poLines: PoLine[];
    days_ago: number;
    receipts: ReceiptSpec[];
    challan: string;
    vehicle: string;
  }): { grn: Grn; lines: GrnLine[] } {
    const grnIso = daysAgoIso(opts.days_ago);
    const grn_id = sid("grn", next(counters, "grn"));
    const poLineById = new Map(opts.poLines.map((l) => [l.id, l]));

    const grn: Grn = {
      id: grn_id,
      project_id: project.id,
      created_at: grnIso,
      updated_at: grnIso,
      grn_number: seedDocumentNumber(plan.short_code, "GRN", grnIso, docSeq(counters, plan.code, "GRN")),
      purchase_order_id: opts.po.id,
      supplier_id: opts.po.supplier_id,
      received_on: grnIso.slice(0, 10),
      received_by_user_id: se.id,
      status: "posted",
      vehicle_number: opts.vehicle,
      challan_number: opts.challan,
      remarks: "",
    };
    db.grns.push(grn);

    const lines: GrnLine[] = opts.receipts.map((spec) => {
      const poLine = poLineById.get(spec.po_line_id)!;
      const line: GrnLine = {
        id: sid("grn_line", next(counters, "grn_line")),
        project_id: project.id,
        created_at: grnIso,
        updated_at: grnIso,
        grn_id,
        purchase_order_id: opts.po.id,
        po_line_id: poLine.id,
        indent_line_id: poLine.indent_line_id,
        boq_line_id: poLine.boq_line_id,
        material_id: poLine.material_id,
        unit: poLine.unit,
        received_qty: spec.received,
        accepted_qty: spec.accepted,
        rejected_qty: spec.rejected,
        rejection_reason: spec.reason,
        rate: poLine.rate,
        gst_percent: poLine.gst_percent,
        billed_qty: 0,
      };

      poLine.received_qty += spec.accepted;
      poLine.rejected_qty += spec.rejected;
      const indentLine = db.indent_lines.find((l) => l.id === poLine.indent_line_id);
      if (indentLine) indentLine.received_qty += spec.accepted;

      if (spec.accepted > 0) {
        pushStock({
          material_id: poLine.material_id,
          date: grnIso,
          in_qty: spec.accepted,
          out_qty: 0,
          rate: poLine.rate,
          source_entity_type: "grn",
          source_entity_id: grn_id,
          remarks: `Received against ${grn.grn_number}`,
        });
      }
      return line;
    });

    db.grn_lines.push(...lines);
    return { grn, lines };
  }

  function makeReturn(opts: {
    grn: Grn;
    grnLine: GrnLine;
    days_ago: number;
    status: ReturnStatus;
  }): Return {
    const retIso = daysAgoIso(opts.days_ago);
    const entry: Return = {
      id: sid("supplier_return", next(counters, "supplier_return")),
      project_id: project.id,
      created_at: retIso,
      updated_at: retIso,
      return_number: seedDocumentNumber(plan.short_code, "RTN", retIso, docSeq(counters, plan.code, "RTN")),
      supplier_id: opts.grn.supplier_id,
      purchase_order_id: opts.grn.purchase_order_id,
      grn_id: opts.grn.id,
      grn_line_id: opts.grnLine.id,
      material_id: opts.grnLine.material_id,
      unit: opts.grnLine.unit,
      quantity: opts.grnLine.rejected_qty,
      rate: opts.grnLine.rate,
      amount: rupees(opts.grnLine.rejected_qty * opts.grnLine.rate),
      return_date: retIso.slice(0, 10),
      reason: opts.grnLine.rejection_reason,
      status: opts.status,
      raised_by_user_id: po_user.id,
      dispatched_at: opts.status === "raised" ? null : daysAgoIso(Math.max(0, opts.days_ago - 1)),
      debit_note_number:
        opts.status === "debit_note_issued"
          ? seedDocumentNumber(plan.short_code, "DN", retIso, docSeq(counters, plan.code, "DN"))
          : null,
      debit_note_at:
        opts.status === "debit_note_issued" ? daysAgoIso(Math.max(0, opts.days_ago - 2)) : null,
    };
    db.returns.push(entry);

    if (entry.status === "debit_note_issued") {
      db.supplier_ledger_entries.push({
        id: sid("supplier_ledger_entry", next(counters, "supplier_ledger_entry")),
        created_at: entry.debit_note_at!,
        updated_at: entry.debit_note_at!,
        project_id: project.id,
        supplier_id: entry.supplier_id,
        entry_date: entry.debit_note_at!.slice(0, 10),
        entry_type: "debit_note",
        reference_type: "return",
        reference_id: entry.id,
        reference_number: entry.debit_note_number!,
        debit: entry.amount,
        credit: 0,
        narration: `Debit note against ${entry.return_number} — ${entry.reason}`,
      });
    }

    return entry;
  }

  function makeIssue(opts: {
    grnLine: GrnLine;
    boq_line_id: string;
    quantity: number;
    days_ago: number;
  }): MaterialIssue {
    const issueIso = daysAgoIso(opts.days_ago);
    const workOrder =
      ctx.workOrders.find((w) => {
        const boq = boqLines.find((b) => b.id === opts.boq_line_id);
        const contractor = masters.contractors.find((c) => c.id === w.contractor_id);
        return boq && contractor && contractor.trade === boq.trade;
      }) ?? ctx.workOrders[0];

    // Weighted average over receipts, exactly as issueMaterial() computes it.
    const receipts = db.stock_ledger_entries.filter(
      (e) => e.material_id === opts.grnLine.material_id && e.quantity_in > 0,
    );
    const totalQty = receipts.reduce((s, e) => s + e.quantity_in, 0);
    const rate =
      totalQty > 0
        ? Math.round((receipts.reduce((s, e) => s + e.quantity_in * (e.rate ?? 0), 0) / totalQty) * 100) / 100
        : opts.grnLine.rate;

    const issue: MaterialIssue = {
      id: sid("material_issue", next(counters, "material_issue")),
      project_id: project.id,
      created_at: issueIso,
      updated_at: issueIso,
      issue_number: seedDocumentNumber(plan.short_code, "ISS", issueIso, docSeq(counters, plan.code, "ISS")),
      issue_date: issueIso.slice(0, 10),
      work_order_id: workOrder?.id ?? "",
      boq_line_id: opts.boq_line_id,
      material_id: opts.grnLine.material_id,
      unit: opts.grnLine.unit,
      quantity: opts.quantity,
      rate,
      value: rupees(opts.quantity * rate),
      issued_to_contractor_id: workOrder?.contractor_id ?? null,
      issued_by_user_id: se.id,
      remarks: "",
    };
    db.material_issues.push(issue);

    pushStock({
      material_id: opts.grnLine.material_id,
      date: issueIso,
      in_qty: 0,
      out_qty: opts.quantity,
      rate,
      source_entity_type: "material_issue",
      source_entity_id: issue.id,
      remarks: `Issued on ${issue.issue_number}`,
    });

    return issue;
  }

  function makeVendorBill(opts: {
    grn: Grn;
    grnLines: GrnLine[];
    days_ago: number;
    /** Multiplier applied to the PO rate on the first line, to force a mismatch. */
    rate_factor?: number;
    status: "mismatch" | "matched" | "verified" | "handed_over";
  }): VendorBill {
    const billIso = daysAgoIso(opts.days_ago);
    const bill_id = sid("vendor_bill", next(counters, "vendor_bill"));
    const billable = opts.grnLines.filter((l) => l.accepted_qty > 0);

    const rows = billable.map((grnLine, i) => {
      const billed_rate =
        i === 0 && opts.rate_factor ? rupees(grnLine.rate * opts.rate_factor) : grnLine.rate;
      const billed_qty = grnLine.accepted_qty;
      const poLine = db.po_lines.find((l) => l.id === grnLine.po_line_id)!;
      const billed_amount = rupees(billed_qty * billed_rate);
      const expected_amount = rupees(grnLine.accepted_qty * poLine.rate);
      grnLine.billed_qty += billed_qty;
      return {
        grnLine,
        poLine,
        row: {
          grn_id: grnLine.grn_id,
          grn_line_id: grnLine.id,
          po_line_id: poLine.id,
          material_id: grnLine.material_id,
          unit: grnLine.unit,
          billed_qty,
          billed_rate,
          billed_gst_percent: poLine.gst_percent,
          billed_amount,
          grn_accepted_qty: grnLine.accepted_qty,
          po_rate: poLine.rate,
          po_gst_percent: poLine.gst_percent,
          expected_amount,
          qty_matched: true,
          rate_matched: Math.abs(billed_rate - poLine.rate) < 1,
          tax_matched: true,
          variance_amount: rupees(billed_amount - expected_amount),
        },
      };
    });

    const bill_basic_amount = rupees(rows.reduce((s, r) => s + r.row.billed_amount, 0));
    const bill_tax_amount = rupees(
      rows.reduce((s, r) => s + (r.row.billed_amount * r.row.billed_gst_percent) / 100, 0),
    );
    const expected_basic_amount = rupees(rows.reduce((s, r) => s + r.row.expected_amount, 0));
    const expected_tax_amount = rupees(
      rows.reduce((s, r) => s + (r.row.expected_amount * r.row.po_gst_percent) / 100, 0),
    );
    const verified = opts.status === "verified" || opts.status === "handed_over";

    const bill: VendorBill = {
      id: bill_id,
      project_id: project.id,
      created_at: billIso,
      updated_at: billIso,
      bill_number: `INV/${plan.short_code}/${2026}${String(400 + next(counters, "supplier_invoice"))}`,
      reference_number: seedDocumentNumber(
        plan.short_code,
        "VB",
        billIso,
        docSeq(counters, plan.code, "VB"),
      ),
      supplier_id: opts.grn.supplier_id,
      grn_ids: [opts.grn.id],
      purchase_order_ids: [opts.grn.purchase_order_id],
      bill_date: billIso.slice(0, 10),
      received_date: daysAgoDate(Math.max(0, opts.days_ago - 1)),
      status: opts.status,
      bill_basic_amount,
      bill_tax_amount,
      bill_total_amount: rupees(bill_basic_amount + bill_tax_amount),
      expected_basic_amount,
      expected_tax_amount,
      expected_total_amount: rupees(expected_basic_amount + expected_tax_amount),
      amount_variance: rupees(
        bill_basic_amount + bill_tax_amount - expected_basic_amount - expected_tax_amount,
      ),
      is_quantity_matched: rows.every((r) => r.row.qty_matched),
      is_rate_matched: rows.every((r) => r.row.rate_matched),
      is_tax_matched: rows.every((r) => r.row.tax_matched),
      entered_by_user_id: po_user.id,
      verified_by_user_id: verified ? po_user.id : null,
      verified_at: verified ? daysAgoIso(Math.max(0, opts.days_ago - 2)) : null,
      override_reason: "",
      handed_over_at: opts.status === "handed_over" ? daysAgoIso(Math.max(0, opts.days_ago - 3)) : null,
      remarks: "",
    };
    db.vendor_bills.push(bill);

    const lines: VendorBillLine[] = rows.map((r) => ({
      id: sid("vendor_bill_line", next(counters, "vendor_bill_line")),
      project_id: project.id,
      created_at: billIso,
      updated_at: billIso,
      vendor_bill_id: bill_id,
      ...r.row,
    }));
    db.vendor_bill_lines.push(...lines);

    if (verified) {
      db.supplier_ledger_entries.push({
        id: sid("supplier_ledger_entry", next(counters, "supplier_ledger_entry")),
        created_at: bill.verified_at!,
        updated_at: bill.verified_at!,
        project_id: project.id,
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
    }

    return bill;
  }

  /* ================================================================== */
  /* The eight scenarios                                                */
  /* ================================================================== */

  /** Whether a contractor for this BOQ line's trade is on the project. */
  function tradeIsLet(item_code: string): boolean {
    const trade = boqByCode.get(item_code)?.trade;
    return ctx.workOrders.some(
      (w) => masters.contractors.find((c) => c.id === w.contractor_id)?.trade === trade,
    );
  }

  // IND-1 — sitting in the Project Head's queue, comfortably within budget.
  makeIndent({
    seq: 1,
    days_ago: 2,
    status: "submitted",
    approval: "pending",
    remarks: "External plaster starting on the upper floors.",
    lines: [
      { item_code: "BOQ-08", material_code: "MAT-001", share: 0.12 },
      { item_code: "BOQ-08", material_code: "MAT-005", share: 0.1 },
    ],
  });

  // IND-2 — deliberately asks for more than the BOQ material balance allows.
  const overBudgetBudget = budgetFor("BOQ-09", "MAT-013").budget;
  makeIndent({
    seq: 2,
    days_ago: 4,
    status: "submitted",
    approval: "pending",
    remarks: "Terrace waterproofing — extra wastage expected at the parapet.",
    lines: [
      {
        item_code: "BOQ-09",
        material_code: "MAT-013",
        share: 1,
        absolute: Math.round((overBudgetBudget?.budget_qty ?? 500) * 1.35),
      },
    ],
  });

  // IND-3 — partially approved: one line in full, one cut back.
  makeIndent({
    seq: 3,
    days_ago: 9,
    status: "partially_approved",
    approval: "approved",
    remarks: "Flooring for Tower A.",
    lines: [
      { item_code: "BOQ-10", material_code: "MAT-011", share: 0.2 },
      { item_code: "BOQ-10", material_code: "MAT-001", share: 0.2, approved: 0 },
    ],
  });

  // IND-4 -> CMP-1, waiting on the Purchase Head with a non-L1 selection.
  const ind4 = makeIndent({
    seq: 4,
    days_ago: 14,
    status: "in_comparative",
    approval: "approved",
    remarks: "Block work, Tower B.",
    lines: [{ item_code: "BOQ-05", material_code: "MAT-009", share: 0.18 }],
  });
  makeComparative({
    days_ago: 11,
    status: "pending_approval",
    indents: [ind4],
    approval: "pending",
    pick_non_l1: true,
    justification:
      "L1 quoted a 14-day lead time against a 6-day site requirement. L2 confirmed delivery in 5 days in writing.",
  });

  // IND-5 -> CMP-2, sent back by the Purchase Head, so the indent is live again.
  const ind5 = makeIndent({
    seq: 5,
    days_ago: 20,
    status: "approved",
    approval: "approved",
    remarks: "Internal painting, Tower A.",
    lines: [{ item_code: "BOQ-12", material_code: "MAT-015", share: 0.15 }],
  });
  makeComparative({
    days_ago: 17,
    status: "sent_back",
    indents: [ind5],
    approval: "rejected",
    decision_comment: "Only two usable quotes. Get a third from an approved vendor and resubmit.",
  });

  // IND-6 -> CMP-3 -> PO sent, awaiting delivery.
  const ind6 = makeIndent({
    seq: 6,
    days_ago: 26,
    status: "po_raised",
    approval: "approved",
    remarks: "Slab casting, Tower A — cement and reinforcement.",
    lines: [
      { item_code: "BOQ-03", material_code: "MAT-001", share: 0.08 },
      { item_code: "BOQ-04", material_code: "MAT-003", share: 0.12 },
    ],
  });
  const cmp3 = makeComparative({
    days_ago: 23,
    status: "approved",
    indents: [ind6],
    approval: "approved",
  });
  makePurchaseOrders({
    comparative: cmp3.comparative,
    lines: cmp3.lines,
    days_ago: 20,
    status: "sent",
  });

  // IND-7 -> CMP-4 -> PO partially received; vendor bill has a rate mismatch.
  const ind7 = makeIndent({
    seq: 7,
    days_ago: 42,
    status: "partially_received",
    approval: "approved",
    remarks: "Plumbing and electrical rough-in.",
    lines: [
      { item_code: "BOQ-14", material_code: "MAT-014", share: 1, absolute: 700 },
      { item_code: "BOQ-15", material_code: "MAT-010", share: 1, absolute: 900 },
    ],
  });
  const cmp4 = makeComparative({
    days_ago: 39,
    status: "approved",
    indents: [ind7],
    approval: "approved",
  });
  const po2Group = makePurchaseOrders({
    comparative: cmp4.comparative,
    lines: cmp4.lines,
    days_ago: 36,
    status: "partially_received",
  });
  po2Group.forEach((entry, gi) => {
    const cpvc = entry.lines.find(
      (l) => l.material_id === materialByCode(masters.materials, "MAT-014").id,
    );
    const wire = entry.lines.find(
      (l) => l.material_id === materialByCode(masters.materials, "MAT-010").id,
    );
    const receipts: ReceiptSpec[] = [];
    if (cpvc) receipts.push({ po_line_id: cpvc.id, received: 700, accepted: 700, rejected: 0, reason: "" });
    // Only part of the wire arrived, which is what keeps the PO open.
    if (wire) receipts.push({ po_line_id: wire.id, received: 400, accepted: 400, rejected: 0, reason: "" });
    if (receipts.length === 0) return;

    const { grn, lines } = makeGrn({
      po: entry.po,
      poLines: entry.lines,
      days_ago: 30,
      receipts,
      challan: `CH-2026${310 + gi}`,
      vehicle: `GA 03 AB ${4120 + gi * 7}`,
    });

    // Issues: CPVC runs well ahead of the plumbing measured so far; wire
    // leaves stock low. Only where a contractor is there to receive it —
    // otherwise the delivery waits in stores for the trade to be let.
    const cpvcLine = lines.find((l) => l.material_id === cpvc?.material_id);
    const wireLine = lines.find((l) => l.material_id === wire?.material_id);
    if (cpvcLine && tradeIsLet("BOQ-14")) {
      makeIssue({
        grnLine: cpvcLine,
        boq_line_id: boqByCode.get("BOQ-14")!.id,
        quantity: 480,
        days_ago: 24,
      });
    }
    if (wireLine && tradeIsLet("BOQ-15")) {
      makeIssue({
        grnLine: wireLine,
        boq_line_id: boqByCode.get("BOQ-15")!.id,
        quantity: 380,
        days_ago: 22,
      });
    }

    makeVendorBill({ grn, grnLines: lines, days_ago: 26, rate_factor: 1.08, status: "mismatch" });
  });

  // IND-8 -> CMP-5 -> PO received with a rejection -> return -> debit note,
  // and a clean bill that has already gone to Accounts.
  const ind8 = makeIndent({
    seq: 8,
    days_ago: 60,
    status: "partially_received",
    approval: "approved",
    remarks: "Plaster works, Tower A — first lot.",
    lines: [
      { item_code: "BOQ-07", material_code: "MAT-001", share: 1, absolute: 900 },
      { item_code: "BOQ-07", material_code: "MAT-005", share: 1, absolute: 40 },
    ],
  });
  const cmp5 = makeComparative({
    days_ago: 57,
    status: "approved",
    indents: [ind8],
    approval: "approved",
  });
  const po3Group = makePurchaseOrders({
    comparative: cmp5.comparative,
    lines: cmp5.lines,
    days_ago: 54,
    status: "received",
  });
  po3Group.forEach((entry, gi) => {
    const cement = entry.lines.find(
      (l) => l.material_id === materialByCode(masters.materials, "MAT-001").id,
    );
    const sand = entry.lines.find(
      (l) => l.material_id === materialByCode(masters.materials, "MAT-005").id,
    );
    const receipts: ReceiptSpec[] = [];
    if (cement) {
      receipts.push({
        po_line_id: cement.id,
        received: 900,
        accepted: 880,
        rejected: 20,
        reason: "20 bags torn and caked — rejected at the gate",
      });
    }
    if (sand) receipts.push({ po_line_id: sand.id, received: 40, accepted: 40, rejected: 0, reason: "" });
    if (receipts.length === 0) return;

    const { grn, lines } = makeGrn({
      po: entry.po,
      poLines: entry.lines,
      days_ago: 48,
      receipts,
      challan: `CH-2026${205 + gi}`,
      vehicle: `GA 08 CJ ${1770 + gi * 11}`,
    });

    const rejected = lines.find((l) => l.rejected_qty > 0);
    if (rejected) {
      makeReturn({ grn, grnLine: rejected, days_ago: 46, status: "debit_note_issued" });
    }

    const cementLine = lines.find((l) => l.material_id === cement?.material_id);
    const sandLine = lines.find((l) => l.material_id === sand?.material_id);
    if (cementLine && tradeIsLet("BOQ-07")) {
      makeIssue({
        grnLine: cementLine,
        boq_line_id: boqByCode.get("BOQ-07")!.id,
        quantity: 600,
        days_ago: 40,
      });
    }
    if (sandLine && tradeIsLet("BOQ-07")) {
      makeIssue({
        grnLine: sandLine,
        boq_line_id: boqByCode.get("BOQ-07")!.id,
        quantity: 25,
        days_ago: 38,
      });
    }

    makeVendorBill({ grn, grnLines: lines, days_ago: 44, status: "handed_over" });
  });

  /* ================================================================== */
  /* Consumption history                                                */
  /* ================================================================== */

  /**
   * Everything that happened before the eight indents above.
   *
   * A project seventeen months in has consumed most of a year's material, and
   * a demo showing 3% of budget spent on all three projects makes the
   * portfolio chart meaningless (audit H1). This lays that history down in
   * bulk: the issues each BOQ line's progress accounts for, and one settled
   * purchase order and goods receipt per supplier that brought it in.
   *
   * `lineShare` is how far each line has got, as a fraction of its BOQ
   * quantity — measured where it has been measured, else reported done. A
   * line nobody has started draws nothing; a finished one draws its whole
   * allowance, give or take a few percent of site efficiency.
   *
   * Deliberately low-detail — no comparative, no vendor bill, no approvals.
   * Those queues are the thread above, which the demo walks through; this is
   * only the weight behind it. Every quantity is derived from the material
   * budget, so it stays reproducible.
   */
  function seedConsumptionHistory(lineShare: Map<string, number>): void {
    if (materialBudgets.length === 0) return;

    // The last 60 days belong to the demonstrable thread; history sits behind
    // it so the two can never collide on a document number or a stock balance.
    const RECEIPT_DAYS_AGO = 300;
    const ISSUE_DAYS_AGO = 280;

    const materialById = new Map(masters.materials.map((m) => [m.id, m]));

    // Most gangs come in a little under allowance; a few run a little over.
    const issueQty = materialBudgets.map((b, i) => {
      const share = lineShare.get(b.boq_line_id) ?? 0;
      return Math.round(b.budget_qty * share * (0.95 + jitter(i * 3 + 1) * 0.07) * 1000) / 1000;
    });

    // Receipts cover the issues with a little left in stock.
    const wantedByMaterial = new Map<string, number>();
    materialBudgets.forEach((b, i) => {
      wantedByMaterial.set(
        b.material_id,
        (wantedByMaterial.get(b.material_id) ?? 0) + issueQty[i] * 1.05,
      );
    });

    const bySupplier = new Map<string, Array<{ material_id: string; quantity: number }>>();
    [...wantedByMaterial.entries()].forEach(([material_id, quantity]) => {
      const material = materialById.get(material_id);
      if (!material || quantity <= 0) return;
      const candidates = suppliersForCategory(masters.suppliers, material.category);
      const supplier = candidates[0] ?? masters.suppliers[0];
      const list = bySupplier.get(supplier.id) ?? [];
      list.push({ material_id, quantity: Math.round(quantity * 1000) / 1000 });
      bySupplier.set(supplier.id, list);
    });

    const poIso = daysAgoIso(RECEIPT_DAYS_AGO);
    const grnIso = daysAgoIso(RECEIPT_DAYS_AGO - 4);
    const rateOf = new Map<string, number>();

    for (const [supplier_id, group] of bySupplier) {
      const supplier = masters.suppliers.find((x) => x.id === supplier_id)!;
      const po_id = sid("purchase_order", next(counters, "purchase_order"));
      const grn_id = sid("grn", next(counters, "grn"));

      const poLines: PoLine[] = group.map((g) => {
        const material = materialById.get(g.material_id)!;
        // Historical rates sat a little under today's, as they do.
        const rate = rupees(baseRateOf(material.code) * 0.94);
        rateOf.set(g.material_id, rate);
        const basic = rupees(g.quantity * rate);
        const boq = boqLines.find((b) =>
          materialBudgets.some(
            (mb) => mb.boq_line_id === b.id && mb.material_id === g.material_id,
          ),
        );
        return {
          id: sid("po_line", next(counters, "po_line")),
          project_id: project.id,
          created_at: poIso,
          updated_at: grnIso,
          purchase_order_id: po_id,
          comparative_line_id: null,
          indent_id: null,
          indent_line_id: null,
          boq_line_id: boq?.id ?? boqLines[0].id,
          material_id: g.material_id,
          unit: material.unit,
          ordered_qty: g.quantity,
          rate,
          gst_percent: material.gst_percent,
          freight_amount: 0,
          basic_amount: basic,
          tax_amount: rupees(basic * (material.gst_percent / 100)),
          line_total: rupees(basic * (1 + material.gst_percent / 100)),
          received_qty: g.quantity,
          rejected_qty: 0,
        };
      });

      const basic = rupees(poLines.reduce((t, l) => t + l.basic_amount, 0));
      const taxTotal = rupees(poLines.reduce((t, l) => t + l.tax_amount, 0));
      const tax = splitTax(supplier.state, taxTotal);

      const po: PurchaseOrder = {
        id: po_id,
        project_id: project.id,
        created_at: poIso,
        updated_at: grnIso,
        po_number: seedDocumentNumber(plan.short_code, "PO", poIso, docSeq(counters, plan.code, "PO")),
        comparative_id: null,
        indent_ids: [],
        supplier_id,
        po_date: poIso.slice(0, 10),
        expected_delivery_date: daysAgoDate(RECEIPT_DAYS_AGO - 4),
        status: "closed",
        raised_by_user_id: po_user.id,
        sent_at: poIso,
        basic_amount: basic,
        freight_amount: 0,
        is_interstate: tax.is_interstate,
        cgst_amount: tax.cgst_amount,
        sgst_amount: tax.sgst_amount,
        igst_amount: tax.igst_amount,
        total_amount: rupees(basic + taxTotal),
        delivery_address: project.location,
        terms: "Closed. Opening consumption history.",
      };
      db.purchase_orders.push(po);
      db.po_lines.push(...poLines);

      const grnLines: GrnLine[] = poLines.map((l) => ({
        id: sid("grn_line", next(counters, "grn_line")),
        project_id: project.id,
        created_at: grnIso,
        updated_at: grnIso,
        grn_id,
        purchase_order_id: po_id,
        po_line_id: l.id,
        indent_line_id: null,
        boq_line_id: l.boq_line_id,
        material_id: l.material_id,
        unit: l.unit,
        received_qty: l.ordered_qty,
        accepted_qty: l.ordered_qty,
        rejected_qty: 0,
        rejection_reason: "",
        rate: l.rate,
        gst_percent: l.gst_percent,
        billed_qty: l.ordered_qty,
      }));

      const grn: Grn = {
        id: grn_id,
        project_id: project.id,
        created_at: grnIso,
        updated_at: grnIso,
        grn_number: seedDocumentNumber(plan.short_code, "GRN", grnIso, docSeq(counters, plan.code, "GRN")),
        purchase_order_id: po_id,
        supplier_id,
        received_on: grnIso.slice(0, 10),
        received_by_user_id: se.id,
        status: "posted",
        vehicle_number: "",
        challan_number: `CH-HIST-${plan.short_code}`,
        remarks: "Opening consumption history.",
      };
      db.grns.push(grn);
      db.grn_lines.push(...grnLines);

      grnLines.forEach((l) => {
        pushStock({
          material_id: l.material_id,
          date: grnIso,
          in_qty: l.accepted_qty,
          out_qty: 0,
          rate: l.rate,
          source_entity_type: "grn",
          source_entity_id: grn_id,
          remarks: `Received against ${grn.grn_number}`,
        });
      });
    }

    /* ---- and the issues that drew it back down --------------------- */
    materialBudgets.forEach((budget, i) => {
      const quantity = issueQty[i];
      const material = materialById.get(budget.material_id);
      const boq = boqLines.find((b) => b.id === budget.boq_line_id);
      if (quantity <= 0 || !material || !boq) return;

      const issueIso = daysAgoIso(ISSUE_DAYS_AGO - (i % 40));
      const rate = rateOf.get(budget.material_id) ?? rupees(baseRateOf(material.code) * 0.94);
      const workOrder =
        ctx.workOrders.find((w) => {
          const contractor = masters.contractors.find((c) => c.id === w.contractor_id);
          return contractor?.trade === boq.trade;
        }) ?? ctx.workOrders[0];
      const issue_id = sid("material_issue", next(counters, "material_issue"));

      const issue: MaterialIssue = {
        id: issue_id,
        project_id: project.id,
        created_at: issueIso,
        updated_at: issueIso,
        issue_number: seedDocumentNumber(plan.short_code, "ISS", issueIso, docSeq(counters, plan.code, "ISS")),
        issue_date: issueIso.slice(0, 10),
        work_order_id: workOrder?.id ?? "",
        boq_line_id: boq.id,
        material_id: budget.material_id,
        unit: material.unit,
        quantity,
        rate,
        value: rupees(quantity * rate),
        issued_to_contractor_id: workOrder?.contractor_id ?? null,
        issued_by_user_id: se.id,
        remarks: "Opening consumption history.",
      };
      db.material_issues.push(issue);

      pushStock({
        material_id: budget.material_id,
        date: issueIso,
        in_qty: 0,
        out_qty: quantity,
        rate,
        source_entity_type: "material_issue",
        source_entity_id: issue_id,
        remarks: `Issued on ${issue.issue_number}`,
      });
    });
  }

  return seedConsumptionHistory;
}
