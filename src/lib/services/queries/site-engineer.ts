import { getRepositories } from "@/lib/data";
import { ageInDays, daysAheadDate, today, todayUtc } from "@/lib/clock";
import { inScope } from "./scope";
import type { Kpi, QueryScope } from "./types";

/*
 * Site Execution dashboard.
 *
 * Nothing here returns a rupee figure — the Site Engineer is denied `view` on
 * rates, and these queries are written so the screen has nothing to hide.
 */

export async function getSiteEngineerKpis(scope: QueryScope): Promise<Kpi[]> {
  const repos = getRepositories();
  const [tasks, dprs, indents, pos] = await Promise.all([
    repos.siteTasks.list(),
    repos.dprs.list(),
    repos.indents.list(),
    repos.purchaseOrders.list(),
  ]);
  const now = today();
  const project = scope.project_ids[0];

  const inProgress = inScope(tasks, scope).filter((t) => t.status === "in_progress").length;
  const filedToday = inScope(dprs, scope).filter((d) => d.report_date === now).length;
  const openIndents = inScope(indents, scope).filter(
    (i) => i.status !== "closed" && i.status !== "rejected" && i.status !== "received",
  ).length;
  const weekEnd = daysAheadDate(7);
  const dueThisWeek = inScope(pos, scope).filter(
    (p) =>
      (p.status === "sent" || p.status === "partially_received") &&
      p.expected_delivery_date <= weekEnd,
  ).length;

  const expected = scope.project_ids.length;

  return [
    {
      key: "tasks",
      label: "Tasks in progress",
      display: String(inProgress),
      hint: "On the ground right now",
      href: project ? `/projects/${project}/site/tasks` : undefined,
    },
    {
      key: "dpr",
      label: "Today's DPR",
      display: filedToday >= expected ? "Filed" : "Pending",
      hint: filedToday >= expected ? "Report is in" : "Progress and labour still to record",
      tone: filedToday >= expected ? "good" : "warn",
      href: project ? `/projects/${project}/site/dpr` : undefined,
    },
    {
      key: "indents",
      label: "Indents open",
      display: String(openIndents),
      hint: "Raised and not yet fully received",
      href: project ? `/projects/${project}/site/indents` : undefined,
    },
    {
      key: "deliveries",
      label: "Deliveries this week",
      display: String(dueThisWeek),
      hint: "POs expected on site",
      tone: dueThisWeek > 0 ? "warn" : "neutral",
      href: project ? `/projects/${project}/site/grn` : undefined,
    },
  ];
}

export type TodayTask = {
  site_task_id: string;
  project_id: string;
  task_code: string;
  title: string;
  location_block: string;
  contractor_name: string;
  status: string;
  done_qty: number;
  wo_qty: number;
  unit: string;
  percent: number;
  href: string;
};

/** Tasks whose planned window covers today, plus anything already running. */
export async function getTodaysTasks(scope: QueryScope): Promise<TodayTask[]> {
  const repos = getRepositories();
  const [tasks, lines, contractors] = await Promise.all([
    repos.siteTasks.list(),
    repos.workOrders.listLines(),
    repos.contractors.list(),
  ]);
  const lineById = new Map(lines.map((l) => [l.id, l]));
  const contractorName = new Map(contractors.map((c) => [c.id, c.name]));
  const now = today();

  return inScope(tasks, scope)
    .filter(
      (t) =>
        t.status === "in_progress" || (t.status === "planned" && t.planned_start <= now),
    )
    .map((t) => {
      const line = t.work_order_line_id ? lineById.get(t.work_order_line_id) : undefined;
      return {
        site_task_id: t.id,
        project_id: t.project_id,
        task_code: t.task_code,
        title: t.title,
        location_block: t.location_block,
        contractor_name: contractorName.get(t.assigned_contractor_id ?? "") ?? "",
        status: t.status,
        done_qty: line?.done_qty ?? 0,
        wo_qty: line?.quantity ?? 0,
        unit: line?.unit ?? "",
        percent: t.progress_percent,
        href: `/projects/${t.project_id}/site/tasks`,
      };
    })
    .sort((a, b) => b.percent - a.percent);
}

export type DprDay = {
  date: string;
  filed: boolean;
  is_today: boolean;
  labour: number;
  lines: number;
};

/** The last `days` of reporting, so gaps are obvious at a glance. */
export async function getDprStreak(scope: QueryScope, days = 14): Promise<DprDay[]> {
  const repos = getRepositories();
  const dprs = inScope(await repos.dprs.list(), scope);
  const byDate = new Map(dprs.map((d) => [d.report_date, d]));
  const now = today();

  return Array.from({ length: days }, (_, i) => {
    const d = todayUtc();
    d.setUTCDate(d.getUTCDate() - (days - 1 - i));
    const date = d.toISOString().slice(0, 10);
    const dpr = byDate.get(date);
    return {
      date,
      filed: Boolean(dpr),
      is_today: date === now,
      labour: dpr?.total_labour_count ?? 0,
      lines: dpr?.total_progress_entries ?? 0,
    };
  });
}

export type IndentPipelineStage = {
  key: string;
  label: string;
  count: number;
  href: string;
};

/** Where this site's indents have got to: submitted → approved → PO → received. */
export async function getIndentPipeline(scope: QueryScope): Promise<IndentPipelineStage[]> {
  const repos = getRepositories();
  const indents = inScope(await repos.indents.list(), scope);
  const project = scope.project_ids[0];
  const href = project ? `/projects/${project}/site/indents` : "/projects";
  const count = (...statuses: string[]) =>
    indents.filter((i) => statuses.includes(i.status)).length;

  return [
    { key: "submitted", label: "Submitted", count: count("submitted"), href },
    {
      key: "approved",
      label: "Approved",
      count: count("approved", "partially_approved", "in_comparative"),
      href,
    },
    { key: "po_raised", label: "PO raised", count: count("po_raised"), href },
    {
      key: "received",
      label: "Received",
      count: count("partially_received", "received", "closed"),
      href,
    },
  ];
}

export type ExpectedDelivery = {
  purchase_order_id: string;
  po_number: string;
  project_id: string;
  supplier_name: string;
  expected_date: string;
  days_until: number;
  is_overdue: boolean;
  /**
   * Lines still to arrive, and how much of each unit — never one mixed sum.
   * `quantity`, not `value`: the redaction layer reads `value` as money.
   */
  pending_lines: number;
  pending: Array<{ unit: string; quantity: number }>;
  materials: string;
  href: string;
};

function pendingByUnit(
  lines: Array<{ unit: string; ordered_qty: number; received_qty: number; rejected_qty: number }>,
): { pending_lines: number; pending: Array<{ unit: string; quantity: number }> } {
  const open = lines.filter((l) => l.ordered_qty - l.received_qty - l.rejected_qty > 0);
  const byUnit = new Map<string, number>();
  open.forEach((l) =>
    byUnit.set(l.unit, (byUnit.get(l.unit) ?? 0) + l.ordered_qty - l.received_qty - l.rejected_qty),
  );
  return {
    pending_lines: open.length,
    pending: [...byUnit.entries()].map(([unit, quantity]) => ({
      unit,
      quantity: Math.round(quantity * 100) / 100,
    })),
  };
}

/** Open POs by expected date. Quantities only — never a value. */
export async function getExpectedDeliveries(scope: QueryScope): Promise<ExpectedDelivery[]> {
  const repos = getRepositories();
  const [pos, lines, suppliers, materials] = await Promise.all([
    repos.purchaseOrders.list(),
    repos.purchaseOrders.listLines(),
    repos.suppliers.list(),
    repos.materials.list(),
  ]);
  const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));
  const materialName = new Map(materials.map((m) => [m.id, m.name]));

  return inScope(pos, scope)
    .filter((p) => p.status === "sent" || p.status === "partially_received")
    .map((po) => {
      const mine = lines.filter((l) => l.purchase_order_id === po.id);
      const age = ageInDays(po.expected_delivery_date);
      return {
        purchase_order_id: po.id,
        po_number: po.po_number,
        project_id: po.project_id,
        supplier_name: supplierName.get(po.supplier_id) ?? "",
        expected_date: po.expected_delivery_date,
        days_until: -age,
        is_overdue: age > 0,
        ...pendingByUnit(mine),
        materials: mine
          .slice(0, 2)
          .map((l) => materialName.get(l.material_id) ?? "")
          .filter(Boolean)
          .join(", "),
        href: `/projects/${po.project_id}/site/grn`,
      };
    })
    .sort((a, b) => a.expected_date.localeCompare(b.expected_date));
}

export type LowStockMaterial = {
  material_id: string;
  project_id: string;
  code: string;
  name: string;
  unit: string;
  balance: number;
  reorder_level: number;
  shortfall: number;
  href: string;
};

/** Materials on site sitting below their reorder level. */
export async function getLowStockMaterials(scope: QueryScope): Promise<LowStockMaterial[]> {
  const repos = getRepositories();
  const [ledger, materials] = await Promise.all([
    repos.stock.list(),
    repos.materials.list(),
  ]);
  const materialById = new Map(materials.map((m) => [m.id, m]));

  const balances = new Map<string, number>();
  inScope(ledger, scope).forEach((e) => {
    const key = `${e.project_id}:${e.material_id}`;
    balances.set(key, (balances.get(key) ?? 0) + e.quantity_in - e.quantity_out);
  });

  const rows: LowStockMaterial[] = [];
  for (const [key, raw] of balances) {
    const [project_id, material_id] = key.split(":");
    const material = materialById.get(material_id);
    if (!material) continue;
    const balance = Math.round(raw * 100) / 100;
    if (balance >= material.reorder_level) continue;
    rows.push({
      material_id,
      project_id,
      code: material.code,
      name: material.name,
      unit: material.unit,
      balance,
      reorder_level: material.reorder_level,
      shortfall: Math.round((material.reorder_level - balance) * 100) / 100,
      href: `/projects/${project_id}/site/stock`,
    });
  }
  return rows.sort((a, b) => b.shortfall - a.shortfall);
}
