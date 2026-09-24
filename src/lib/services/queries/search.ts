import { getRepositories } from "@/lib/data";
import type { QueryScope } from "./types";
import { inScope } from "./scope";

/**
 * What Cmd/Ctrl+K searches: document numbers across the two threads, and the
 * three masters people look things up by. One flat, ranked list — the reader
 * types "0042" or "cement", not a resource name.
 */
export type SearchHit = {
  id: string;
  /** What the reader calls this kind of record. Never an entity_type value. */
  kind: string;
  /** The line they will recognise: a document number, or a master's name. */
  title: string;
  subtitle?: string;
  href: string;
};

const MAX_PER_KIND = 5;

export async function searchRecords(scope: QueryScope, term: string): Promise<SearchHit[]> {
  const q = term.trim().toLowerCase();
  if (q.length < 2) return [];

  const repos = getRepositories();
  const hits: SearchHit[] = [];
  const matches = (...fields: Array<string | null | undefined>) =>
    fields.some((f) => (f ?? "").toLowerCase().includes(q));

  const projects = await repos.projects.list();
  const projectName = new Map(projects.map((p) => [p.id, p.name]));
  const take = <T>(rows: T[]) => rows.slice(0, MAX_PER_KIND);

  /* --- Documents, project-scoped --- */
  take(inScope(await repos.indents.list(), scope).filter((r) => matches(r.indent_number))).forEach(
    (r) =>
      hits.push({
        id: r.id,
        kind: "Indent",
        title: r.indent_number,
        subtitle: projectName.get(r.project_id),
        href: `/projects/${r.project_id}/site/indents`,
      }),
  );

  take(
    inScope(await repos.purchaseOrders.list(), scope).filter((r) => matches(r.po_number)),
  ).forEach((r) =>
    hits.push({
      id: r.id,
      kind: "Purchase order",
      title: r.po_number,
      subtitle: projectName.get(r.project_id),
      href: `/projects/${r.project_id}/purchase/purchase-orders`,
    }),
  );

  take(inScope(await repos.grns.list(), scope).filter((r) => matches(r.grn_number))).forEach((r) =>
    hits.push({
      id: r.id,
      kind: "Delivery (GRN)",
      title: r.grn_number,
      subtitle: projectName.get(r.project_id),
      href: `/projects/${r.project_id}/site/grn`,
    }),
  );

  take(
    inScope(await repos.vendorBills.list(), scope).filter((r) =>
      matches(r.bill_number, r.reference_number),
    ),
  ).forEach((r) =>
    hits.push({
      id: r.id,
      kind: "Vendor bill",
      title: r.bill_number,
      subtitle: projectName.get(r.project_id),
      href: `/projects/${r.project_id}/purchase/vendor-bills`,
    }),
  );

  take(inScope(await repos.raBills.list(), scope).filter((r) => matches(r.bill_number))).forEach(
    (r) =>
      hits.push({
        id: r.id,
        kind: "RA bill",
        title: r.bill_number,
        subtitle: projectName.get(r.project_id),
        href: `/projects/${r.project_id}/billing/ra-bills`,
      }),
  );

  take(
    inScope(await repos.measurements.list(), scope).filter((r) => matches(r.measurement_number)),
  ).forEach((r) =>
    hits.push({
      id: r.id,
      kind: "Joint measurement",
      title: r.measurement_number,
      subtitle: projectName.get(r.project_id),
      href: `/projects/${r.project_id}/billing/measurements`,
    }),
  );

  /* --- Masters, portfolio-wide --- */
  take((await repos.materials.list()).filter((m) => matches(m.name, m.code))).forEach((m) =>
    hits.push({
      id: m.id,
      kind: "Material",
      title: m.name,
      subtitle: `${m.code} · ${m.category}`,
      href: "/masters/materials",
    }),
  );

  take((await repos.suppliers.list()).filter((s) => matches(s.name, s.code))).forEach((s) =>
    hits.push({
      id: s.id,
      kind: "Supplier",
      title: s.name,
      subtitle: `${s.code} · ${s.state}`,
      href: "/masters/suppliers",
    }),
  );

  take((await repos.contractors.list()).filter((c) => matches(c.name, c.code))).forEach((c) =>
    hits.push({
      id: c.id,
      kind: "Contractor",
      title: c.name,
      subtitle: `${c.code} · ${c.trade}`,
      href: "/masters/contractors",
    }),
  );

  // An exact document-number match is almost always what was typed.
  return hits.sort(
    (a, b) =>
      Number(b.title.toLowerCase().endsWith(q)) - Number(a.title.toLowerCase().endsWith(q)),
  );
}
