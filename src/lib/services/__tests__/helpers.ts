import { getRepositories } from "@/lib/data";
import { resetDemo } from "@/lib/data/local";
import type { ActingUser } from "@/lib/services/types";
import type { Role } from "@/lib/domain";

/**
 * Test harness. Every test starts from the deterministic seed, so the fixtures
 * below can address records by their seeded document numbers.
 */
export function reset(): void {
  resetDemo();
}

export const repos = () => getRepositories();

export async function actorFor(role: Role): Promise<ActingUser> {
  const user = await getRepositories().users.getByRole(role);
  if (!user) throw new Error(`no seeded user for role ${role}`);
  return { user_id: user.id, role };
}

export const SITE = () => actorFor("site_engineer");
export const PH = () => actorFor("project_head");
export const PO = () => actorFor("purchase_officer");
export const PURCHASE_HEAD = () => actorFor("purchase_head");
export const QS = () => actorFor("project_qs");

/** The deepest seeded project, Manas Sapphire. */
export async function project() {
  const p = await getRepositories().projects.getByCode("MNS-SAP");
  if (!p) throw new Error("seed is missing MNS-SAP");
  return p;
}

export async function boqLineByCode(project_id: string, item_code: string) {
  const line = (await getRepositories().boq.listByProject(project_id)).find(
    (b) => b.item_code === item_code,
  );
  if (!line) throw new Error(`no BOQ line ${item_code}`);
  return line;
}

export async function materialByCode(code: string) {
  const m = (await getRepositories().materials.list()).find((x) => x.code === code);
  if (!m) throw new Error(`no material ${code}`);
  return m;
}

export async function supplierByCode(code: string) {
  const s = (await getRepositories().suppliers.list()).find((x) => x.code === code);
  if (!s) throw new Error(`no supplier ${code}`);
  return s;
}

export async function indentByNumber(number: string) {
  const i = (await getRepositories().indents.list()).find((x) => x.indent_number === number);
  if (!i) throw new Error(`no indent ${number}`);
  return i;
}

export async function stockOf(project_id: string, material_id: string): Promise<number> {
  const rows = await getRepositories().stock.listByMaterial(project_id, material_id);
  return rows.reduce((s, r) => s + r.quantity_in - r.quantity_out, 0);
}

/** Suppliers that quote for a material's category, for building comparatives. */
export async function threeSuppliersFor(material_id: string) {
  const rates = await getRepositories().suppliers.listRatesByMaterial(material_id);
  if (rates.length < 3) throw new Error(`fewer than three rate cards for material ${material_id}`);
  return rates.slice(0, 3);
}

export const QS_HEAD = () => actorFor("qs_head");
export const HOD = () => actorFor("hod");

export async function workOrderByNumber(project_id: string, wo_number: string) {
  const w = (await getRepositories().workOrders.listByProject(project_id)).find(
    (x) => x.wo_number === wo_number,
  );
  if (!w) throw new Error(`no work order ${wo_number}`);
  return w;
}

/** The first work order on a project, with its priced lines. */
export async function firstWorkOrder(project_id: string) {
  const repos = getRepositories();
  const wo = (await repos.workOrders.listByProject(project_id))[0];
  if (!wo) throw new Error("project has no work orders");
  return { wo, lines: await repos.workOrders.listLinesByWorkOrder(wo.id) };
}

/** A work-order line the seed has reported progress on. */
export async function lineWithProgress(project_id: string) {
  const line = (await getRepositories().workOrders.listLinesByProject(project_id)).find(
    (l) => l.done_qty > l.measured_qty,
  );
  if (!line) throw new Error("seed has no line with unmeasured progress");
  return line;
}
