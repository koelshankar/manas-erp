import type { Contractor, Material, Role, Supplier, SupplierRate, Team, User } from "@/lib/domain";
import {
  CONTRACTOR_CATALOG,
  MATERIAL_CATALOG,
  PROJECT_CATALOG,
  SUPPLIER_CATALOG,
  USER_CATALOG,
} from "./catalog";
import { daysAgoIso, jitter, rupees, sid } from "./ids";

const CREATED = daysAgoIso(760);

function initialsOf(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function emailOf(name: string): string {
  return `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@manasdevelopers.in`;
}

export function buildUsers(): User[] {
  const allProjectIds = PROJECT_CATALOG.map((_, i) => sid("project", i + 1));
  return USER_CATALOG.map((u, i) => ({
    id: sid("user", i + 1),
    created_at: CREATED,
    updated_at: CREATED,
    full_name: u.full_name,
    email: emailOf(u.full_name),
    role: u.role as Role,
    team: u.team as Team,
    phone: u.phone,
    initials: initialsOf(u.full_name),
    assigned_project_ids:
      u.projects === "all" ? allProjectIds : u.projects.map((p) => allProjectIds[p]),
  }));
}

export function buildContractors(): Contractor[] {
  return CONTRACTOR_CATALOG.map((c, i) => ({
    id: sid("contractor", i + 1),
    created_at: CREATED,
    updated_at: CREATED,
    code: c.code,
    name: c.name,
    trade: c.trade,
    type: c.type,
    contact_person: c.contact_person,
    phone: c.phone,
    pan: c.pan,
    gstin: c.gstin,
    address: c.address,
    default_retention_percent: c.default_retention_percent,
    is_active: true,
  }));
}

export function buildMaterials(): Material[] {
  return MATERIAL_CATALOG.map((m, i) => ({
    id: sid("material", i + 1),
    created_at: CREATED,
    updated_at: CREATED,
    code: m.code,
    name: m.name,
    category: m.category,
    unit: m.unit,
    hsn_code: m.hsn_code,
    gst_percent: m.gst_percent,
    reorder_level: m.reorder_level,
    is_active: true,
  }));
}

export function buildSuppliers(): Supplier[] {
  return SUPPLIER_CATALOG.map((s, i) => ({
    id: sid("supplier", i + 1),
    created_at: CREATED,
    updated_at: CREATED,
    code: s.code,
    name: s.name,
    contact_person: s.contact_person,
    phone: s.phone,
    email: s.email,
    gstin: s.gstin,
    address: s.address,
    city: s.city,
    state: s.state,
    payment_terms_days: s.payment_terms_days,
    is_active: true,
  }));
}

/** A rate row for every (supplier, material) pair the supplier stocks. */
export function buildSupplierRates(suppliers: Supplier[], materials: Material[]): SupplierRate[] {
  const rates: SupplierRate[] = [];
  let n = 0;
  SUPPLIER_CATALOG.forEach((sc, si) => {
    MATERIAL_CATALOG.forEach((mc, mi) => {
      if (!sc.categories.includes(mc.category)) return;
      n += 1;
      // Deterministic +/- 4% spread around the supplier's factor so the
      // comparative screens have something real to compare.
      const spread = 0.96 + jitter(si * 31 + mi * 7) * 0.08;
      rates.push({
        id: sid("supplier_rate", n),
        created_at: CREATED,
        updated_at: CREATED,
        supplier_id: suppliers[si].id,
        material_id: materials[mi].id,
        rate: rupees(mc.base_rate * sc.rate_factor * spread),
        unit: mc.unit,
        valid_from: daysAgoIso(180).slice(0, 10),
        valid_to: null,
        lead_time_days: sc.lead_time_days,
      });
    });
  });
  return rates;
}

export type Masters = {
  users: User[];
  contractors: Contractor[];
  materials: Material[];
  suppliers: Supplier[];
  supplier_rates: SupplierRate[];
};

export function buildMasters(): Masters {
  const users = buildUsers();
  const contractors = buildContractors();
  const materials = buildMaterials();
  const suppliers = buildSuppliers();
  return {
    users,
    contractors,
    materials,
    suppliers,
    supplier_rates: buildSupplierRates(suppliers, materials),
  };
}

/* Lookup helpers used by the project seeder. */
/**
 * The user of a role posted to a project — the one who would really have
 * raised, measured or approved there. Portfolio roles are posted everywhere.
 */
export function postedUser(users: User[], role: Role, project_id: string): User {
  const u = users.find((x) => x.role === role && x.assigned_project_ids.includes(project_id));
  if (!u) throw new Error(`seed: no ${role} posted to ${project_id}`);
  return u;
}

export function contractorByCode(contractors: Contractor[], code: string): Contractor {
  const c = contractors.find((x) => x.code === code);
  if (!c) throw new Error(`seed: no contractor ${code}`);
  return c;
}

export function materialByCode(materials: Material[], code: string): Material {
  const m = materials.find((x) => x.code === code);
  if (!m) throw new Error(`seed: no material ${code}`);
  return m;
}

export function suppliersForCategory(suppliers: Supplier[], category: string): Supplier[] {
  return SUPPLIER_CATALOG.map((sc, i) => ({ sc, s: suppliers[i] }))
    .filter(({ sc }) => sc.categories.includes(category))
    .map(({ s }) => s);
}

export function baseRateOf(code: string): number {
  const m = MATERIAL_CATALOG.find((x) => x.code === code);
  if (!m) throw new Error(`seed: no material ${code}`);
  return m.base_rate;
}

/** Which materials a trade consumes — drives indents and issues. */
export const TRADE_MATERIALS: Record<string, string[]> = {
  rcc: ["MAT-001", "MAT-003", "MAT-004", "MAT-005", "MAT-007"],
  masonry: ["MAT-009", "MAT-001", "MAT-006"],
  plaster: ["MAT-001", "MAT-005", "MAT-006"],
  waterproofing: ["MAT-013", "MAT-001"],
  flooring: ["MAT-011", "MAT-012", "MAT-001"],
  painting: ["MAT-015"],
  plumbing: ["MAT-014"],
  electrical: ["MAT-010"],
  general: ["MAT-001", "MAT-005"],
};
