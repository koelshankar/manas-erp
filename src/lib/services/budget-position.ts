import { getRepositories } from "@/lib/data";
import type { BoqMaterialBudget } from "@/lib/domain";
import { qty } from "./guards";

/**
 * What a BOQ line's material allowance looks like right now.
 *
 * This is the single calculation the indent screens, the A2 approval screen and
 * Budget vs Actual all read from, so they can never disagree.
 */
export type MaterialPosition = {
  project_id: string;
  boq_line_id: string;
  material_id: string;
  /** From BoqMaterialBudget; 0 when the BOQ line has no allowance for it. */
  budget_qty: number;
  budget_rate: number;
  budget_value: number;
  /** Approved where a decision exists, otherwise still-requested. */
  indented_qty: number;
  /** Already drawn from site stock against this BOQ line. */
  issued_qty: number;
  issued_value: number;
  /** budget_qty less indented_qty — how much may still be indented. */
  balance_qty: number;
  /** Project-wide stock of this material, not specific to the BOQ line. */
  stock_qty: number;
};

/** Live on-site balance of one material across the whole project. */
export async function stockOnHand(project_id: string, material_id: string): Promise<number> {
  const entries = await getRepositories().stock.listByMaterial(project_id, material_id);
  return qty(entries.reduce((sum, e) => sum + e.quantity_in - e.quantity_out, 0));
}

/**
 * Weighted average cost of the material on site, over receipts at PO rate.
 * Returns 0 when nothing has ever been received.
 */
export async function weightedAverageRate(
  project_id: string,
  material_id: string,
): Promise<number> {
  const entries = await getRepositories().stock.listByMaterial(project_id, material_id);
  const receipts = entries.filter((e) => e.quantity_in > 0);
  const totalQty = receipts.reduce((s, e) => s + e.quantity_in, 0);
  if (totalQty === 0) return 0;
  const totalValue = receipts.reduce((s, e) => s + e.quantity_in * (e.rate ?? 0), 0);
  return Math.round((totalValue / totalQty) * 100) / 100;
}

export async function materialPosition(
  project_id: string,
  boq_line_id: string,
  material_id: string,
): Promise<MaterialPosition> {
  const repos = getRepositories();
  const [budgets, indentLines, indents, issues] = await Promise.all([
    repos.boq.listMaterialBudgetsByBoqLine(boq_line_id),
    repos.indents.listLinesByProject(project_id),
    repos.indents.listByProject(project_id),
    repos.stock.listIssuesByProject(project_id),
  ]);

  const budget: BoqMaterialBudget | undefined = budgets.find(
    (b) => b.material_id === material_id,
  );
  const indentStatus = new Map(indents.map((i) => [i.id, i.status]));

  const indented = indentLines
    .filter((l) => l.boq_line_id === boq_line_id && l.material_id === material_id)
    .filter((l) => indentStatus.get(l.indent_id) !== "rejected")
    .reduce((sum, l) => sum + (l.approved_qty ?? l.requested_qty), 0);

  const mine = issues.filter(
    (i) => i.boq_line_id === boq_line_id && i.material_id === material_id,
  );

  const budget_qty = budget?.budget_qty ?? 0;
  const budget_rate = budget?.budget_rate ?? 0;

  return {
    project_id,
    boq_line_id,
    material_id,
    budget_qty,
    budget_rate,
    budget_value: qty(budget_qty * budget_rate),
    indented_qty: qty(indented),
    issued_qty: qty(mine.reduce((s, i) => s + i.quantity, 0)),
    issued_value: Math.round(mine.reduce((s, i) => s + i.value, 0) * 100) / 100,
    balance_qty: qty(budget_qty - indented),
    stock_qty: await stockOnHand(project_id, material_id),
  };
}

/**
 * Every budgeted (BOQ line, material) pair on a project, computed in one pass.
 *
 * The indent screens need dozens of these at once, so they read this rather
 * than calling materialPosition() in a loop.
 */
export async function materialPositions(project_id: string): Promise<MaterialPosition[]> {
  const repos = getRepositories();
  const [budgets, indentLines, indents, issues, stock] = await Promise.all([
    repos.boq.listMaterialBudgetsByProject(project_id),
    repos.indents.listLinesByProject(project_id),
    repos.indents.listByProject(project_id),
    repos.stock.listIssuesByProject(project_id),
    repos.stock.listByProject(project_id),
  ]);

  const indentStatus = new Map(indents.map((i) => [i.id, i.status]));
  const stockByMaterial = new Map<string, number>();
  stock.forEach((e) => {
    stockByMaterial.set(
      e.material_id,
      (stockByMaterial.get(e.material_id) ?? 0) + e.quantity_in - e.quantity_out,
    );
  });

  return budgets.map((budget) => {
    const indented = indentLines
      .filter((l) => l.boq_line_id === budget.boq_line_id && l.material_id === budget.material_id)
      .filter((l) => indentStatus.get(l.indent_id) !== "rejected")
      .reduce((sum, l) => sum + (l.approved_qty ?? l.requested_qty), 0);

    const mine = issues.filter(
      (i) => i.boq_line_id === budget.boq_line_id && i.material_id === budget.material_id,
    );

    return {
      project_id,
      boq_line_id: budget.boq_line_id,
      material_id: budget.material_id,
      budget_qty: budget.budget_qty,
      budget_rate: budget.budget_rate,
      budget_value: qty(budget.budget_qty * budget.budget_rate),
      indented_qty: qty(indented),
      issued_qty: qty(mine.reduce((s, i) => s + i.quantity, 0)),
      issued_value: Math.round(mine.reduce((s, i) => s + i.value, 0) * 100) / 100,
      balance_qty: qty(budget.budget_qty - indented),
      stock_qty: qty(stockByMaterial.get(budget.material_id) ?? 0),
    };
  });
}

/** Key used by the screens to look a position up. */
export function positionKey(boq_line_id: string, material_id: string): string {
  return `${boq_line_id}:${material_id}`;
}
