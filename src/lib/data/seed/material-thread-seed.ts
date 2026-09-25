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
import { baseRateOf, materialByCode, postedUser, suppliersForCategory, type Masters } from "./masters";
import { daysAgoDate, daysAgoIso, daysAheadDate, jitter, rupees, sid } from "./ids";
import { seedDocumentNumber } from "@/lib/services/document-number";
import { ageInDays } from "@/lib/clock";
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

/**
 * The eight scenarios, as each site plays them. The shapes are the same on
 * every project; the materials come from trades the project has let, and the
 * dates are staggered so a portfolio view does not show one story three times.
 *
 * `days` is how long ago the indent was raised; everything downstream is
 * dated from it. `note` is the scenario's own text: the reason a line was cut
 * (IND-3), the non-L1 justification (IND-4), the send-back comment (IND-5) or
 * the gate rejection (IND-8).
 */
type ScenarioLine = {
  item: string;
  mat: string;
  /** Fraction of the line's material budget to ask for. */
  share?: number;
  /** An absolute quantity instead. */
  qty?: number;
  /** Ask for 135% of the budget — the over-budget indent. */
  over?: boolean;
  /** Cut to nothing at approval. */
  cut?: boolean;
};
type Scenario = { days: number; remarks: string; lines: ScenarioLine[]; note?: string };

const SCENARIOS: Record<string, Scenario[]> = {
  "MNS-SAP": [
    { days: 2, remarks: "External plaster starting on the upper floors.", lines: [
      { item: "BOQ-08", mat: "MAT-001", share: 0.12 }, { item: "BOQ-08", mat: "MAT-005", share: 0.1 }] },
    { days: 4, remarks: "Terrace waterproofing — extra wastage expected at the parapet.", lines: [
      { item: "BOQ-09", mat: "MAT-013", over: true }] },
    { days: 3, remarks: "Flooring for Tower A.", note: "Cement for the bedding is already on site.", lines: [
      { item: "BOQ-10", mat: "MAT-011", share: 0.2 }, { item: "BOQ-10", mat: "MAT-001", share: 0.2, cut: true }] },
    { days: 6, remarks: "Block work, Tower B.",
      note: "L1 quoted a 14-day lead time against a 6-day site requirement. L2 confirmed delivery in 5 days in writing.",
      lines: [{ item: "BOQ-05", mat: "MAT-009", share: 0.18 }] },
    { days: 11, remarks: "Toilet wall tiling, Tower A.",
      note: "Only two usable quotes. Get a third from an approved vendor and resubmit.",
      lines: [{ item: "BOQ-11", mat: "MAT-012", share: 0.15 }] },
    { days: 10, remarks: "Slab casting, Tower A — cement and reinforcement.", lines: [
      { item: "BOQ-03", mat: "MAT-001", share: 0.08 }, { item: "BOQ-04", mat: "MAT-003", share: 0.12 }] },
    { days: 24, remarks: "Plumbing and electrical rough-in.", lines: [
      { item: "BOQ-14", mat: "MAT-014", qty: 700 }, { item: "BOQ-15", mat: "MAT-010", qty: 900 }] },
    { days: 45, remarks: "Plaster works, Tower A — first lot.", note: "Bags torn and caked — rejected at the gate", lines: [
      { item: "BOQ-07", mat: "MAT-001", qty: 900 }, { item: "BOQ-07", mat: "MAT-005", qty: 40 }] },
  ],
  "MNS-GRN": [
    { days: 1, remarks: "Partition blockwork, Block B, third and fourth floors.", lines: [
      { item: "BOQ-06", mat: "MAT-009", share: 0.1 }, { item: "BOQ-06", mat: "MAT-006", share: 0.1 }] },
    { days: 6, remarks: "Wiring for Block A in one lot, ahead of the supplier's price revision.", lines: [
      { item: "BOQ-15", mat: "MAT-010", over: true }] },
    { days: 5, remarks: "Column casting, Block B.", note: "Aggregate on site covers this pour.", lines: [
      { item: "BOQ-02", mat: "MAT-001", share: 0.12 }, { item: "BOQ-02", mat: "MAT-007", share: 0.1, cut: true }] },
    { days: 10, remarks: "External blockwork, Block A.",
      note: "L1 cannot deliver 150mm blocks before the 12th. L2 has stock at its Verna yard and confirmed a 3-day delivery.",
      lines: [{ item: "BOQ-05", mat: "MAT-009", share: 0.15 }] },
    { days: 9, remarks: "Plumbing risers and sleeves, Block A.",
      note: "Two of the three quotes are from the same distributor. Get an independent third quote.",
      lines: [{ item: "BOQ-14", mat: "MAT-014", share: 0.25 }] },
    { days: 11, remarks: "Slab casting, Block B — cement and 16mm steel.", lines: [
      { item: "BOQ-03", mat: "MAT-001", share: 0.06 }, { item: "BOQ-04", mat: "MAT-004", share: 0.1 }] },
    { days: 22, remarks: "Blockwork mortar, Block A.", lines: [
      { item: "BOQ-05", mat: "MAT-006", share: 0.4 }, { item: "BOQ-05", mat: "MAT-001", share: 0.25 }] },
    { days: 50, remarks: "Footing and plinth concrete, Block B.", note: "Bags set hard in transit — rejected at the gate", lines: [
      { item: "BOQ-01", mat: "MAT-001", share: 0.12 }, { item: "BOQ-01", mat: "MAT-005", share: 0.15 }] },
  ],
  "MNS-HTS": [
    { days: 3, remarks: "Column concrete, second lift.", lines: [
      { item: "BOQ-02", mat: "MAT-001", share: 0.1 }, { item: "BOQ-02", mat: "MAT-005", share: 0.1 }] },
    { days: 1, remarks: "Podium slab cement in one lot, before the monsoon rate revision.", lines: [
      { item: "BOQ-03", mat: "MAT-001", over: true }] },
    { days: 7, remarks: "Column reinforcement, grids C to F.", note: "16mm on site covers the columns; order it with the slab steel.", lines: [
      { item: "BOQ-04", mat: "MAT-003", share: 0.15 }, { item: "BOQ-04", mat: "MAT-004", share: 0.12, cut: true }] },
    { days: 12, remarks: "Coarse aggregate for the columns.",
      note: "L1's quarry is shut for the monsoon. L2 is supplying from stock at the same landed rate within 2%.",
      lines: [{ item: "BOQ-02", mat: "MAT-007", share: 0.15 }] },
    { days: 8, remarks: "Sand for the podium slab.",
      note: "The quotes are a month old. Get fresh rates before this comes back.",
      lines: [{ item: "BOQ-03", mat: "MAT-005", share: 0.08 }] },
    { days: 13, remarks: "Column steel, 12mm, and cement for the second lift.", lines: [
      { item: "BOQ-04", mat: "MAT-003", share: 0.12 }, { item: "BOQ-02", mat: "MAT-001", share: 0.08 }] },
    { days: 21, remarks: "Column concrete, first lift.", lines: [
      { item: "BOQ-02", mat: "MAT-005", share: 0.12 }, { item: "BOQ-02", mat: "MAT-001", share: 0.1 }] },
    { days: 40, remarks: "Foundation concrete — last pours.", note: "Bags damp and lumpy — rejected at the gate", lines: [
      { item: "BOQ-01", mat: "MAT-001", share: 0.1 }, { item: "BOQ-01", mat: "MAT-007", share: 0.12 }] },
  ],
};

/** What a Project Head writes when an indent is simply fine. */
const APPROVAL_NOTES = [
  "Within the BOQ balance. Approved.",
  "OK as per the pour schedule.",
  "Approved — stagger the deliveries to suit the store.",
  "Checked against the work order. Approved.",
  "Approved. Keep an eye on the balance on this line.",
];

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
  const posted = (role: Parameters<typeof postedUser>[1]) => postedUser(masters.users, role, project.id);
  const se = posted("site_engineer");
  const ph = posted("project_head");
  const po_user = posted("purchase_officer");
  const pur_head = posted("purchase_head");

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
      // Raised against the work order of the trade that will use it.
      work_order_id:
        ctx.workOrders.find(
          (w) =>
            masters.contractors.find((c) => c.id === w.contractor_id)?.trade ===
            boqByCode.get(opts.lines[0].item_code)?.trade,
        )?.id ?? null,
      raised_by_user_id: se.id,
      raised_date: daysAgoDate(opts.days_ago),
      required_by_date: lines.map((l) => l.required_by).sort()[0],
      status: opts.status,
      remarks: opts.remarks,
      approved_by_user_id: decided ? ph.id : null,
      approved_at: decided ? decidedIso : null,
      approval_comment: !decided
        ? ""
        : opts.status === "partially_approved"
          ? (opts.lines.find((l) => l.approved === 0)?.rejection_reason ?? "Reduced to what the work needs now.")
          : APPROVAL_NOTES[(opts.seq + ctx.index) % APPROVAL_NOTES.length],
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
    approval: "pending" | "approved" | "sent_back" | "rejected" | null;
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
  function tradeIsLet(boq_line_id: string): boolean {
    const trade = boqLines.find((b) => b.id === boq_line_id)?.trade;
    return ctx.workOrders.some(
      (w) => masters.contractors.find((c) => c.id === w.contractor_id)?.trade === trade,
    );
  }

  const set = SCENARIOS[plan.code];
  const days = set.map((s) => s.days);
  const specsOf = (s: Scenario): LineSpec[] =>
    s.lines.map((l) => ({
      item_code: l.item,
      material_code: l.mat,
      share: l.share ?? 1,
      absolute:
        l.qty ??
        (l.over
          ? Math.round((budgetFor(l.item, l.mat).budget?.budget_qty ?? 500) * 1.35)
          : undefined),
      approved: l.cut ? 0 : undefined,
      rejection_reason: l.cut ? s.note : undefined,
    }));
  // Challan and vehicle numbers differ per site, as the trucks do.
  const gate = (n: number) => ({
    challan: `CH-${2600 + ctx.index * 170 + n * 13}`,
    vehicle: `GA ${["03 AB", "08 CJ", "07 F"][(ctx.index + n) % 3]} ${1100 + ctx.index * 911 + n * 37}`,
  });

  // IND-1 — sitting in the Project Head's queue, comfortably within budget.
  makeIndent({
    seq: 1,
    days_ago: days[0],
    status: "submitted",
    approval: "pending",
    remarks: set[0].remarks,
    lines: specsOf(set[0]),
  });

  // IND-2 — deliberately asks for more than the BOQ material balance allows.
  makeIndent({
    seq: 2,
    days_ago: days[1],
    status: "submitted",
    approval: "pending",
    remarks: set[1].remarks,
    lines: specsOf(set[1]),
  });

  // IND-3 — partially approved: one line in full, one cut back.
  makeIndent({
    seq: 3,
    days_ago: days[2],
    status: "partially_approved",
    approval: "approved",
    remarks: set[2].remarks,
    lines: specsOf(set[2]),
  });

  // IND-4 -> CMP-1, waiting on the Purchase Head with a non-L1 selection.
  const ind4 = makeIndent({
    seq: 4,
    days_ago: days[3],
    status: "in_comparative",
    approval: "approved",
    remarks: set[3].remarks,
    lines: specsOf(set[3]),
  });
  makeComparative({
    days_ago: days[3] - 3,
    status: "pending_approval",
    indents: [ind4],
    approval: "pending",
    pick_non_l1: true,
    justification: set[3].note,
  });

  // IND-5 -> CMP-2, sent back by the Purchase Head, so the indent is live again.
  const ind5 = makeIndent({
    seq: 5,
    days_ago: days[4],
    status: "approved",
    approval: "approved",
    remarks: set[4].remarks,
    lines: specsOf(set[4]),
  });
  makeComparative({
    days_ago: days[4] - 3,
    status: "sent_back",
    indents: [ind5],
    approval: "sent_back",
    decision_comment: set[4].note,
  });

  // IND-6 -> CMP-3 -> PO sent, awaiting delivery.
  const ind6 = makeIndent({
    seq: 6,
    days_ago: days[5],
    status: "po_raised",
    approval: "approved",
    remarks: set[5].remarks,
    lines: specsOf(set[5]),
  });
  const cmp3 = makeComparative({
    days_ago: days[5] - 3,
    status: "approved",
    indents: [ind6],
    approval: "approved",
  });
  makePurchaseOrders({
    comparative: cmp3.comparative,
    lines: cmp3.lines,
    days_ago: days[5] - 6,
    status: "sent",
  });

  // IND-7 -> CMP-4 -> PO partially received; vendor bill has a rate mismatch.
  // The first material arrives in full and runs ahead of the measured work;
  // the second arrives in part, which is what keeps the PO open.
  const ind7 = makeIndent({
    seq: 7,
    days_ago: days[6],
    status: "partially_received",
    approval: "approved",
    remarks: set[6].remarks,
    lines: specsOf(set[6]),
  });
  const cmp4 = makeComparative({
    days_ago: days[6] - 3,
    status: "approved",
    indents: [ind7],
    approval: "approved",
  });
  const firstOf7 = materialByCode(masters.materials, set[6].lines[0].mat).id;
  makePurchaseOrders({
    comparative: cmp4.comparative,
    lines: cmp4.lines,
    days_ago: days[6] - 6,
    status: "partially_received",
  }).forEach((entry, gi) => {
    const receipts: ReceiptSpec[] = entry.lines.map((l) => {
      const got = l.material_id === firstOf7 ? l.ordered_qty : Math.round(l.ordered_qty * 0.45);
      return { po_line_id: l.id, received: got, accepted: got, rejected: 0, reason: "" };
    });
    const { grn, lines } = makeGrn({
      po: entry.po,
      poLines: entry.lines,
      days_ago: days[6] - 12,
      receipts,
      ...gate(gi),
    });
    // A supplier whose part of the order all arrived has closed its PO out.
    const short = entry.lines.some((l) => l.received_qty < l.ordered_qty);
    if (!short) entry.po.status = "received";
    // Only where a contractor is there to receive it — otherwise the
    // delivery waits in stores for the trade to be let.
    lines.forEach((l, li) => {
      const quantity = Math.round(l.accepted_qty * (l.material_id === firstOf7 ? 0.68 : 0.95));
      if (quantity <= 0 || !tradeIsLet(l.boq_line_id)) return;
      makeIssue({ grnLine: l, boq_line_id: l.boq_line_id, quantity, days_ago: days[6] - 18 - li * 2 });
    });
    // The short supplier's invoice is the one that came in at the wrong rate.
    makeVendorBill(
      short
        ? { grn, grnLines: lines, days_ago: days[6] - 16, rate_factor: 1.08, status: "mismatch" }
        : { grn, grnLines: lines, days_ago: days[6] - 16, status: "verified" },
    );
  });

  // IND-8 -> CMP-5 -> PO received with a rejection -> return -> debit note,
  // and a clean bill that has already gone to Accounts.
  const ind8 = makeIndent({
    seq: 8,
    days_ago: days[7],
    status: "partially_received",
    approval: "approved",
    remarks: set[7].remarks,
    lines: specsOf(set[7]),
  });
  const cmp5 = makeComparative({
    days_ago: days[7] - 3,
    status: "approved",
    indents: [ind8],
    approval: "approved",
  });
  const firstOf8 = materialByCode(masters.materials, set[7].lines[0].mat).id;
  makePurchaseOrders({
    comparative: cmp5.comparative,
    lines: cmp5.lines,
    days_ago: days[7] - 6,
    status: "received",
  }).forEach((entry, gi) => {
    const receipts: ReceiptSpec[] = entry.lines.map((l) => {
      const rejected = l.material_id === firstOf8 ? Math.max(1, Math.round(l.ordered_qty * 0.022)) : 0;
      return {
        po_line_id: l.id,
        received: l.ordered_qty,
        accepted: l.ordered_qty - rejected,
        rejected,
        reason: rejected > 0 ? (set[7].note ?? "") : "",
      };
    });
    const { grn, lines } = makeGrn({
      po: entry.po,
      poLines: entry.lines,
      days_ago: days[7] - 12,
      receipts,
      ...gate(gi + 5),
    });

    const rejected = lines.find((l) => l.rejected_qty > 0);
    if (rejected) {
      makeReturn({ grn, grnLine: rejected, days_ago: days[7] - 14, status: "debit_note_issued" });
    }
    lines.forEach((l, li) => {
      const quantity = Math.round(l.accepted_qty * (l.material_id === firstOf8 ? 0.68 : 0.62));
      if (quantity <= 0 || !tradeIsLet(l.boq_line_id)) return;
      makeIssue({ grnLine: l, boq_line_id: l.boq_line_id, quantity, days_ago: days[7] - 20 - li * 2 });
    });
    makeVendorBill({ grn, grnLines: lines, days_ago: days[7] - 16, status: "handed_over" });
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

    /*
     * History runs from just after the project started to two months ago —
     * the last 60 days belong to the demonstrable thread above — in delivery
     * rounds roughly ten weeks apart. Each round is a PO and a GRN per
     * supplier, invoiced and paid, then drawn down by issues until the next
     * round arrives. A line only draws once its contractor has been let.
     */
    const FIRST = plan.started_days_ago - 10;
    const LAST = 64;
    if (FIRST <= LAST) return;
    const LOTS = Math.max(1, Math.min(6, Math.round((FIRST - LAST) / 75)));
    const lotDay = Array.from({ length: LOTS }, (_, k) =>
      Math.round(FIRST - (k * (FIRST - LAST)) / LOTS),
    );
    /** Issues from a round run until the next round's GRN. */
    const lotEnd = (k: number) => (k + 1 < LOTS ? lotDay[k + 1] - 3 : 61);

    const materialById = new Map(masters.materials.map((m) => [m.id, m]));
    // Bags, blocks, pipe and tiles are counted; sand is by the tenth of a
    // brass; steel by the kilo.
    const places = (unit: string) => (unit === "brass" ? 1 : unit === "mt" ? 2 : 0);
    const down = (unit: string, n: number) => {
      const f = 10 ** places(unit);
      return Math.floor(n * f + 1e-9) / f;
    };
    const up = (unit: string, n: number) => {
      const f = 10 ** places(unit);
      return Math.ceil(n * f - 1e-9) / f;
    };
    const exact = (unit: string, n: number) => {
      const f = 10 ** places(unit);
      return Math.round(n * f) / f;
    };
    const workOrderFor = (boq_line_id: string) => {
      const trade = boqLines.find((b) => b.id === boq_line_id)?.trade;
      return ctx.workOrders.find(
        (w) => masters.contractors.find((c) => c.id === w.contractor_id)?.trade === trade,
      );
    };
    // Rates crept up over the project, as they do.
    const rateAt = (code: string, k: number) =>
      rupees(baseRateOf(code) * (0.9 + (0.06 * k) / Math.max(1, LOTS - 1)));

    /* ---- plan the draws: each line's consumption, round by round ---- */
    type Draw = { budget: BoqMaterialBudget; lot: number; quantity: number; day: number };
    const draws: Draw[] = [];
    materialBudgets.forEach((budget, i) => {
      const material = materialById.get(budget.material_id);
      const workOrder = workOrderFor(budget.boq_line_id);
      const share = lineShare.get(budget.boq_line_id) ?? 0;
      if (!material || !workOrder || share <= 0) return;
      // Most gangs come in a little under allowance; a few run a little over.
      // On the lead project the internal plaster gang has drawn most of its
      // allowance already, so the last lot on site takes that line a few
      // percent over budget — the overrun the Project Head's dashboard is
      // there to catch.
      const overdrawn =
        plan.depth === "full" && boqLines.find((b) => b.id === budget.boq_line_id)?.item_code === "BOQ-07";
      const efficiency = overdrawn ? 0.86 / Math.max(share, 0.01) : 0.95 + jitter(i * 3 + 1) * 0.07;
      const total = down(material.unit, budget.budget_qty * share * efficiency);
      if (total <= 0) return;

      const letAgo = ageInDays(workOrder.issued_date);
      const rounds = lotDay.map((d, k) => k).filter((k) => lotDay[k] <= letAgo - 10);
      const open = rounds.length > 0 ? rounds : [LOTS - 1];
      const part = down(material.unit, total / open.length);
      open.forEach((k, n) => {
        const quantity =
          n === open.length - 1 ? exact(material.unit, total - part * (open.length - 1)) : part;
        if (quantity <= 0) return;
        const span = Math.max(1, lotDay[k] - 6 - lotEnd(k));
        draws.push({ budget, lot: k, quantity, day: lotDay[k] - 6 - ((i * 7 + n * 3) % span) });
      });
    });

    /* ---- the rounds of deliveries that fed them ---------------------- */
    let historyGrns = 0;
    lotDay.forEach((day, k) => {
      // Receipts cover the round's issues with a little left in stock.
      const wanted = new Map<string, number>();
      draws
        .filter((d) => d.lot === k)
        .forEach((d) =>
          wanted.set(d.budget.material_id, (wanted.get(d.budget.material_id) ?? 0) + d.quantity * 1.05),
        );

      const bySupplier = new Map<string, Array<{ material_id: string; quantity: number }>>();
      [...wanted.entries()].forEach(([material_id, want]) => {
        const material = materialById.get(material_id)!;
        const candidates = suppliersForCategory(masters.suppliers, material.category);
        // The usual supplier, with the runner-up taking the odd round.
        const supplier =
          candidates[(k + ctx.index) % 3 === 2 && candidates.length > 1 ? 1 : 0] ?? masters.suppliers[0];
        const list = bySupplier.get(supplier.id) ?? [];
        list.push({ material_id, quantity: up(material.unit, want) });
        bySupplier.set(supplier.id, list);
      });

      const poIso = daysAgoIso(day);
      const grnIso = daysAgoIso(day - 4);

      for (const [supplier_id, group] of bySupplier) {
        const supplier = masters.suppliers.find((x) => x.id === supplier_id)!;
        const po_id = sid("purchase_order", next(counters, "purchase_order"));
        const grn_id = sid("grn", next(counters, "grn"));

        const poLines: PoLine[] = group.map((g) => {
          const material = materialById.get(g.material_id)!;
          const rate = rateAt(material.code, k);
          const basic = rupees(g.quantity * rate);
          const boq = boqLines.find((b) =>
            materialBudgets.some((mb) => mb.boq_line_id === b.id && mb.material_id === g.material_id),
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
          expected_delivery_date: daysAgoDate(day - 4),
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
          delivery_address: `${project.name} site office, ${project.location}`,
          terms:
            "Delivery at site. Payment as per agreed credit period from GRN date. Rates inclusive of loading and unloading.",
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
          // The bill below brings this up.
          billed_qty: 0,
        }));

        const truck = gate(20 + historyGrns);
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
          vehicle_number: truck.vehicle,
          challan_number: truck.challan,
          remarks: "",
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

        // Invoiced, checked, handed to Accounts and paid long ago — the
        // delivery sits in the ledger, not in anybody's queue.
        const billDaysAgo = day - 8;
        const bill = makeVendorBill({ grn, grnLines, days_ago: billDaysAgo, status: "handed_over" });
        const paidIso = daysAgoIso(Math.max(5, billDaysAgo - 3 - supplier.payment_terms_days));
        db.supplier_ledger_entries.push({
          id: sid("supplier_ledger_entry", next(counters, "supplier_ledger_entry")),
          created_at: paidIso,
          updated_at: paidIso,
          project_id: project.id,
          supplier_id,
          entry_date: paidIso.slice(0, 10),
          entry_type: "payment",
          reference_type: "vendor_bill",
          reference_id: bill.id,
          reference_number: bill.bill_number,
          debit: bill.bill_total_amount,
          credit: 0,
          narration: `Paid against invoice ${bill.bill_number}`,
        });
        historyGrns += 1;
      }
    });

    /* ---- and the issues that drew each round back down --------------- */
    draws.forEach((draw) => {
      const { budget, quantity } = draw;
      const material = materialById.get(budget.material_id)!;
      const workOrder = workOrderFor(budget.boq_line_id)!;
      const issueIso = daysAgoIso(draw.day);
      const rate = rateAt(material.code, draw.lot);
      const issue_id = sid("material_issue", next(counters, "material_issue"));

      const issue: MaterialIssue = {
        id: issue_id,
        project_id: project.id,
        created_at: issueIso,
        updated_at: issueIso,
        issue_number: seedDocumentNumber(plan.short_code, "ISS", issueIso, docSeq(counters, plan.code, "ISS")),
        issue_date: issueIso.slice(0, 10),
        work_order_id: workOrder.id,
        boq_line_id: budget.boq_line_id,
        material_id: budget.material_id,
        unit: material.unit,
        quantity,
        rate,
        value: rupees(quantity * rate),
        issued_to_contractor_id: workOrder.contractor_id,
        issued_by_user_id: se.id,
        remarks: "",
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
