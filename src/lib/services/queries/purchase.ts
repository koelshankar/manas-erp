import { getRepositories } from "@/lib/data";
import { ageInDays, isThisMonth } from "@/lib/clock";
import { rupees } from "../pricing";
import { formatInrCompact } from "@/lib/format";
import { inScope } from "./scope";
import type { Kpi, QueryScope } from "./types";

/* Purchase & Stores dashboards. */

/**
 * The Officer's numbers: the desk work in front of them.
 *
 * The Head gets a different four (`getPurchaseHeadKpis`) — the two roles share
 * most of their widgets, so identical KPIs made the two dashboards read as the
 * same screen.
 */
export async function getPurchaseKpis(scope: QueryScope): Promise<Kpi[]> {
  const repos = getRepositories();
  const [indents, comparatives, comparativeLines, pos, bills] = await Promise.all([
    repos.indents.list(),
    repos.comparatives.list(),
    repos.comparatives.listLines(),
    repos.purchaseOrders.list(),
    repos.vendorBills.list(),
  ]);

  const live = new Set(
    comparatives.filter((c) => c.status !== "rejected" && c.status !== "sent_back").map((c) => c.id),
  );
  const committed = new Set(
    comparativeLines.filter((l) => live.has(l.comparative_id)).map((l) => l.indent_id),
  );
  const awaitingComparative = inScope(indents, scope).filter(
    (i) => (i.status === "approved" || i.status === "partially_approved") && !committed.has(i.id),
  ).length;
  const awaitingB2 = inScope(comparatives, scope).filter(
    (c) => c.status === "pending_approval",
  ).length;
  const openPos = inScope(pos, scope).filter(
    (p) => p.status === "draft" || p.status === "sent" || p.status === "partially_received",
  ).length;
  const mismatches = inScope(bills, scope).filter((b) => b.status === "mismatch").length;

  return [
    {
      key: "awaiting_comparative",
      label: "Indents to quote",
      display: String(awaitingComparative),
      hint: "Approved and waiting for a comparative",
      tone: awaitingComparative > 0 ? "warn" : "neutral",
      href: "/approvals",
    },
    {
      key: "awaiting_b2",
      label: "Awaiting B2",
      display: String(awaitingB2),
      hint: "Comparatives with the Purchase Head",
      tone: awaitingB2 > 0 ? "warn" : "neutral",
      href: "/approvals",
    },
    { key: "open_pos", label: "Open purchase orders", display: String(openPos), hint: "Not yet fully received" },
    {
      key: "mismatches",
      label: "Bill mismatches",
      display: String(mismatches),
      hint: "Failed the three-way match",
      tone: mismatches > 0 ? "bad" : "good",
    },
  ];
}

/**
 * The Head's numbers: what has been committed, and whether it was bought well.
 *
 * Deliberately not the Officer's four. The Head approves rather than prepares,
 * so the questions are "what is on my desk", "what have we committed this
 * month", "are we buying at L1" and "what is stuck with the vendor".
 */
export async function getPurchaseHeadKpis(scope: QueryScope): Promise<Kpi[]> {
  const repos = getRepositories();
  const [comparatives, pos, bills] = await Promise.all([
    repos.comparatives.list(),
    repos.purchaseOrders.list(),
    repos.vendorBills.list(),
  ]);

  const awaitingMe = inScope(comparatives, scope).filter(
    (c) => c.status === "pending_approval",
  );
  const committedThisMonth = inScope(pos, scope).filter((p) => isThisMonth(p.po_date));
  const committedValue = rupees(
    committedThisMonth.reduce((sum, p) => sum + p.total_amount, 0),
  );
  const overdue = inScope(pos, scope).filter(
    (p) =>
      (p.status === "sent" || p.status === "partially_received") &&
      ageInDays(p.expected_delivery_date) > 0,
  );
  const unpaid = inScope(bills, scope).filter((b) => b.status !== "handed_over");

  return [
    {
      key: "awaiting_me",
      label: "Awaiting my approval",
      display: String(awaitingMe.length),
      hint: awaitingMe.length === 1 ? "1 comparative at B2" : `${awaitingMe.length} comparatives at B2`,
      tone: awaitingMe.length > 0 ? "warn" : "good",
      href: "/approvals",
    },
    {
      key: "committed_this_month",
      label: "Committed this month",
      display: formatInrCompact(committedValue),
      hint: `${committedThisMonth.length} purchase order${committedThisMonth.length === 1 ? "" : "s"} raised`,
    },
    {
      key: "overdue_pos",
      label: "Overdue deliveries",
      display: String(overdue.length),
      hint: "Past the date the vendor promised",
      tone: overdue.length > 0 ? "bad" : "good",
    },
    {
      key: "unbilled",
      label: "Bills not yet cleared",
      display: String(unpaid.length),
      hint: "Raised but not handed to Accounts",
      tone: unpaid.length > 0 ? "warn" : "good",
    },
  ];
}

export type OverduePo = {
  purchase_order_id: string;
  po_number: string;
  project_id: string;
  supplier_name: string;
  expected_date: string;
  days_overdue: number;
  value: number;
  href: string;
};

/** POs past their expected delivery date with material still outstanding. */
export async function getOverduePos(scope: QueryScope): Promise<OverduePo[]> {
  const repos = getRepositories();
  const [pos, suppliers] = await Promise.all([
    repos.purchaseOrders.list(),
    repos.suppliers.list(),
  ]);
  const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));

  return inScope(pos, scope)
    .filter(
      (p) =>
        (p.status === "sent" || p.status === "partially_received") &&
        ageInDays(p.expected_delivery_date) > 0,
    )
    .map((po) => ({
      purchase_order_id: po.id,
      po_number: po.po_number,
      project_id: po.project_id,
      supplier_name: supplierName.get(po.supplier_id) ?? "",
      expected_date: po.expected_delivery_date,
      days_overdue: ageInDays(po.expected_delivery_date),
      value: po.total_amount,
      href: `/projects/${po.project_id}/purchase/purchase-orders`,
    }))
    .sort((a, b) => b.days_overdue - a.days_overdue);
}

export type UnbilledGrn = {
  grn_id: string;
  grn_number: string;
  project_id: string;
  supplier_name: string;
  received_on: string;
  age_days: number;
  value: number;
  href: string;
};

/** Material received with no vendor bill entered against it. */
export async function getGrnsWithoutBill(scope: QueryScope): Promise<UnbilledGrn[]> {
  const repos = getRepositories();
  const [grns, grnLines, bills, suppliers] = await Promise.all([
    repos.grns.list(),
    repos.grns.listLines(),
    repos.vendorBills.list(),
    repos.suppliers.list(),
  ]);
  const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));
  const billed = new Set(bills.flatMap((b) => b.grn_ids));

  return inScope(grns, scope)
    .filter((g) => !billed.has(g.id))
    .map((g) => ({
      grn_id: g.id,
      grn_number: g.grn_number,
      project_id: g.project_id,
      supplier_name: supplierName.get(g.supplier_id) ?? "",
      received_on: g.received_on,
      age_days: ageInDays(g.received_on),
      value: rupees(
        grnLines
          .filter((l) => l.grn_id === g.id)
          .reduce((s, l) => s + l.accepted_qty * l.rate, 0),
      ),
      href: `/projects/${g.project_id}/purchase/vendor-bills`,
    }))
    .sort((a, b) => b.age_days - a.age_days);
}

export type SupplierPayable = {
  supplier_id: string;
  supplier_name: string;
  state: string;
  credit: number;
  debit: number;
  balance: number;
  href: string;
};

/** What each supplier is owed, biggest first. */
export async function getPayablesBySupplier(
  scope: QueryScope,
  limit = 6,
): Promise<SupplierPayable[]> {
  const repos = getRepositories();
  const [entries, suppliers] = await Promise.all([
    repos.supplierLedger.list(),
    repos.suppliers.list(),
  ]);
  const ids = new Set(scope.project_ids);

  return suppliers
    .map((s) => {
      const mine = entries.filter(
        (e) => e.supplier_id === s.id && (!e.project_id || ids.has(e.project_id)),
      );
      const credit = rupees(mine.reduce((t, e) => t + e.credit, 0));
      const debit = rupees(mine.reduce((t, e) => t + e.debit, 0));
      return {
        supplier_id: s.id,
        supplier_name: s.name,
        state: s.state,
        credit,
        debit,
        balance: rupees(credit - debit),
        href: "/ledgers/suppliers",
      };
    })
    .filter((r) => r.balance !== 0)
    .sort((a, b) => b.balance - a.balance)
    .slice(0, limit);
}

export type CategorySpend = {
  category: string;
  value: number;
  percent: number;
  href: string;
};

/** This month's PO value by material category — the Purchase Head's view. */
export async function getSpendByCategory(scope: QueryScope): Promise<CategorySpend[]> {
  const repos = getRepositories();
  const [pos, lines, materials] = await Promise.all([
    repos.purchaseOrders.list(),
    repos.purchaseOrders.listLines(),
    repos.materials.list(),
  ]);
  const category = new Map(materials.map((m) => [m.id, m.category]));
  const thisMonth = new Set(
    inScope(pos, scope)
      .filter((p) => p.status !== "draft" && isThisMonth(p.po_date))
      .map((p) => p.id),
  );

  const totals = new Map<string, number>();
  lines
    .filter((l) => thisMonth.has(l.purchase_order_id))
    .forEach((l) => {
      const key = category.get(l.material_id) ?? "Other";
      totals.set(key, (totals.get(key) ?? 0) + l.line_total);
    });

  const grand = [...totals.values()].reduce((s, v) => s + v, 0);
  return [...totals.entries()]
    .map(([name, value]) => ({
      category: name,
      value: rupees(value),
      percent: grand > 0 ? Math.round((value / grand) * 1000) / 10 : 0,
      href: "/masters/materials",
    }))
    .sort((a, b) => b.value - a.value);
}

export type L1Adherence = {
  total_lines: number;
  l1_lines: number;
  percent: number;
  /** Lines where the officer justified passing over L1. */
  justified: Array<{
    comparative_id: string;
    comparative_number: string;
    project_id: string;
    material_name: string;
    justification: string;
    href: string;
  }>;
};

/**
 * How often the selected vendor was the cheapest on landed cost. Only decided
 * comparatives count — a draft has not made a choice yet.
 */
export async function getL1Adherence(scope: QueryScope): Promise<L1Adherence> {
  const repos = getRepositories();
  const [comparatives, lines, materials] = await Promise.all([
    repos.comparatives.list(),
    repos.comparatives.listLines(),
    repos.materials.list(),
  ]);
  const materialName = new Map(materials.map((m) => [m.id, m.name]));
  const decided = new Map(
    inScope(comparatives, scope)
      .filter((c) => c.status !== "draft")
      .map((c) => [c.id, c]),
  );

  const mine = lines.filter((l) => decided.has(l.comparative_id));
  const l1 = mine.filter((l) => l.is_l1_selected);

  return {
    total_lines: mine.length,
    l1_lines: l1.length,
    percent: mine.length > 0 ? Math.round((l1.length / mine.length) * 1000) / 10 : 100,
    justified: mine
      .filter((l) => !l.is_l1_selected)
      .map((l) => {
        const c = decided.get(l.comparative_id)!;
        return {
          comparative_id: c.id,
          comparative_number: c.comparative_number,
          project_id: c.project_id,
          material_name: materialName.get(l.material_id) ?? "",
          justification: l.justification,
          href: `/projects/${c.project_id}/purchase/comparatives`,
        };
      }),
  };
}
