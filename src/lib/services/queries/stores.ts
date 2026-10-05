import { getRepositories } from "@/lib/data";
import { ageInDays, today } from "@/lib/clock";
import { formatNumber } from "@/lib/format";
import { gatePassTypeLabel } from "@/config/labels";
import { inScope } from "./scope";
import type { Kpi, QueryScope } from "./types";

/*
 * The Stores dashboard.
 *
 * Nothing here returns a rupee figure. The store keeper is denied the `rates`
 * data class, and these queries are written so the screen has nothing to hide
 * — the same arrangement the Site Engineer's queries are in.
 */

export async function getStoreKeeperKpis(scope: QueryScope): Promise<Kpi[]> {
  const repos = getRepositories();
  const [entries, materials, passes, transfers, inbound, pos] = await Promise.all([
    repos.stock.list(),
    repos.materials.list(),
    repos.gatePasses.list(),
    repos.materialTransfers.list(),
    inboundTransfers(scope),
    repos.purchaseOrders.list(),
  ]);
  const now = today();
  const project = scope.project_ids[0];

  // Materials below their reorder level, across the stores in scope.
  const balances = new Map<string, number>();
  inScope(entries, scope).forEach((e) => {
    balances.set(
      e.material_id,
      (balances.get(e.material_id) ?? 0) + e.quantity_in - e.quantity_out,
    );
  });
  const low = materials.filter((m) => {
    const balance = balances.get(m.id);
    return balance !== undefined && balance < m.reorder_level;
  }).length;

  const out = inScope(passes, scope).filter(
    (p) => p.pass_type === "returnable" && p.status === "acknowledged",
  );
  const overdue = out.filter(
    (p) => p.expected_return_date && p.expected_return_date < now,
  ).length;

  const dispatched = inScope(transfers, scope).filter((t) => t.status === "in_transit").length;
  const arriving = inbound.filter((t) => t.status === "in_transit").length;

  const due = inScope(pos, scope).filter(
    (p) =>
      (p.status === "sent" || p.status === "partially_received") &&
      p.expected_delivery_date <= now,
  ).length;

  return [
    {
      key: "deliveries",
      label: "Deliveries to post",
      display: String(due),
      hint: "Material due on site with no GRN against it",
      tone: due > 0 ? "warn" : "neutral",
      href: project ? `/projects/${project}/procurement/grn` : undefined,
    },
    {
      key: "gate_passes",
      label: "Out on gate pass",
      display: String(out.length),
      hint: overdue > 0 ? `${overdue} past the date it was due back` : "All within their return date",
      tone: overdue > 0 ? "bad" : "neutral",
      href: project ? `/projects/${project}/stores/gate-pass` : undefined,
    },
    {
      key: "transfers",
      label: "In transit",
      display: String(dispatched + arriving),
      hint:
        arriving > 0
          ? `${arriving} arriving here, still to be signed for`
          : "Dispatched and not yet acknowledged",
      tone: arriving > 0 ? "warn" : "neutral",
      href: project ? `/projects/${project}/stores/transfer-orders` : undefined,
    },
    {
      key: "low_stock",
      label: "Below reorder level",
      display: String(low),
      hint: "Materials the store is running short of",
      tone: low > 0 ? "warn" : "neutral",
      href: project ? `/projects/${project}/stores/stock-position` : undefined,
    },
  ];
}

/** One line of the "Still out of the store" panel. */
export type StoresOutstandingRow = {
  id: string;
  entity_type: "gate_pass" | "material_transfer";
  document_number: string;
  project_id: string;
  /** What it is and where it went, in one line. */
  context: string;
  /** Where it has got to, in the storeman's words. */
  stage: string;
  /** The date the clock started: the return date, or the dispatch. */
  since: string;
  age_days: number;
  /** A returnable pass past its return date. The one red row here. */
  overdue: boolean;
  href: string;
};

/**
 * Everything that has left the store and not been squared off: material out on
 * a gate pass, and transfers nobody has signed for at either end.
 *
 * Both halves of the transfer are in it — one dispatched from a store in
 * scope, one arriving at one — because the storeman's question is "what is
 * open", not "whose document is it".
 */
export async function getStoresOutstanding(
  scope: QueryScope,
): Promise<StoresOutstandingRow[]> {
  const repos = getRepositories();
  const [passes, passLines, transfers, inbound, stores, projects] = await Promise.all([
    repos.gatePasses.list(),
    repos.gatePasses.listLines(),
    repos.materialTransfers.list(),
    inboundTransfers(scope),
    repos.stores.list(),
    repos.projects.list(),
  ]);
  const now = today();
  const storeName = new Map(stores.map((s) => [s.id, s.name]));
  const projectName = new Map(projects.map((p) => [p.id, p.name]));
  const rows: StoresOutstandingRow[] = [];

  inScope(passes, scope)
    .filter((p) => p.status === "acknowledged")
    .forEach((pass) => {
      const lines = passLines.filter((l) => l.gate_pass_id === pass.id);
      const outstanding = lines.reduce((s, l) => s + Math.max(0, l.quantity - l.returned_qty), 0);
      const overdue = Boolean(
        pass.pass_type === "returnable" && pass.expected_return_date && pass.expected_return_date < now,
      );
      const since = pass.expected_return_date ?? pass.gate_pass_date;
      rows.push({
        id: `gate_pass:${pass.id}`,
        entity_type: "gate_pass",
        document_number: pass.gate_pass_number,
        project_id: pass.project_id,
        context: `${pass.issued_to_company || pass.issued_to_name} — ${pass.purpose}`,
        stage:
          pass.pass_type === "returnable"
            ? `${gatePassTypeLabel(pass.pass_type)} · ${formatNumber(outstanding, 2)} still out`
            : `${gatePassTypeLabel(pass.pass_type)} · nothing to come back`,
        since,
        age_days: ageInDays(since),
        overdue,
        href: `/projects/${pass.project_id}/stores/gate-pass`,
      });
    });

  const openTransfers = [
    ...inScope(transfers, scope).filter((t) => t.status === "in_transit"),
    ...inbound.filter((t) => t.status === "in_transit"),
  ];
  // A transfer inside one project's own stores is in both lists.
  const seen = new Set<string>();
  openTransfers.forEach((transfer) => {
    if (seen.has(transfer.id)) return;
    seen.add(transfer.id);
    const since = transfer.dispatched_at?.slice(0, 10) ?? transfer.transfer_date;
    rows.push({
      id: `material_transfer:${transfer.id}`,
      entity_type: "material_transfer",
      document_number: transfer.transfer_number,
      project_id: transfer.project_id,
      context: `${storeName.get(transfer.from_store_id) ?? ""} → ${storeName.get(transfer.to_store_id) ?? projectName.get(transfer.to_project_id) ?? ""}`,
      stage: "In transit · waiting on the receiving store",
      since,
      age_days: ageInDays(since),
      overdue: false,
      href: `/projects/${transfer.project_id}/stores/transfer-orders`,
    });
  });

  // Overdue first, then oldest: the two things the storeman is chased about.
  return rows.sort(
    (a, b) => Number(b.overdue) - Number(a.overdue) || b.age_days - a.age_days,
  );
}

/**
 * Transfers arriving at a project in scope.
 *
 * A transfer is filed under the project it leaves, so the receiving store
 * cannot find its own inbound work through the ordinary project scope. This is
 * the one read in the app that deliberately steps outside it.
 */
export async function inboundTransfers(scope: QueryScope) {
  const repos = getRepositories();
  const all = await repos.materialTransfers.list();
  const ids = new Set(scope.project_ids);
  return all.filter((t) => ids.has(t.to_project_id));
}
