import { getRepositories } from "@/lib/data";
import { loadMaterialCatalog } from "../material-catalog";
import { APPROVAL_CHAINS } from "@/config/permissions";
import { ageInDays, today } from "@/lib/clock";
import { formatDate, formatNumber } from "@/lib/format";
import type { Role } from "@/lib/domain";
import { inScope } from "./scope";
import { inboundTransfers } from "./stores";
import type { ActionItem, QueryScope } from "./types";

/**
 * Everything the current role has to do, across all of its queues, oldest
 * first. This is the panel the whole dashboard is built around, so it is one
 * query rather than a widget per queue.
 */
export async function getActionItems(scope: QueryScope): Promise<ActionItem[]> {
  const repos = getRepositories();
  const projects = await repos.projects.list();
  const byProject = new Map(projects.map((p) => [p.id, p]));
  const name = (id: string) => byProject.get(id)?.name ?? "";

  const items: ActionItem[] = [];
  const push = (item: ActionItem) => items.push(item);

  switch (scope.role) {
    case "project_head":
      await projectHeadItems(scope, name, push);
      break;
    case "site_engineer":
      await siteEngineerItems(scope, name, push);
      break;
    case "purchase_officer":
      await purchaseItems(scope, name, push, false);
      break;
    case "purchase_head":
      await purchaseHeadItems(scope, name, push);
      break;
    case "project_qs":
      await projectQsItems(scope, name, push);
      break;
    case "qs_head":
    case "hod":
      await approverItems(scope, name, push);
      break;
    case "store_keeper":
      await storeKeeperItems(scope, name, push);
      break;
  }

  return items.sort(
    (a, b) => Number(a.read_only ?? false) - Number(b.read_only ?? false) || b.age_days - a.age_days,
  );
}

type Push = (item: ActionItem) => void;
type NameOf = (project_id: string) => string;

/* ------------------------------------------------------------------ */
/* Project Head — A2 indents and the C3 cross-team verification        */
/* ------------------------------------------------------------------ */

async function projectHeadItems(scope: QueryScope, name: NameOf, push: Push): Promise<void> {
  const repos = getRepositories();
  const indents = inScope(await repos.indents.list(), scope).filter(
    (i) => i.status === "submitted",
  );
  const indentLines = await repos.indents.listLines();
  const catalog = await loadMaterialCatalog(repos);

  indents.forEach((indent) => {
    const lines = indentLines.filter((l) => l.indent_id === indent.id);
    push({
      id: `indent:${indent.id}`,
      entity_type: "indent",
      entity_id: indent.id,
      step_code: "A2",
      team: "project_budget",
      label: "Approve material indent",
      document_number: indent.indent_number,
      project_id: indent.project_id,
      project_name: name(indent.project_id),
      context: lines
        .slice(0, 2)
        .map((l) => catalog.label(l.material_id))
        .filter(Boolean)
        .join(", "),
      since: indent.raised_date,
      age_days: ageInDays(indent.raised_date),
      href: `/projects/${indent.project_id}/procurement/indent-approval`,
    });
  });

  // The gate pass. Not on the client's chart, so it carries no step code —
  // see APPROVAL_CHAINS.
  const passes = inScope(await repos.gatePasses.list(), scope).filter(
    (p) => p.status === "pending_approval",
  );
  const stores = await repos.stores.list();
  const storeName = new Map(stores.map((s) => [s.id, s.name]));
  passes.forEach((pass) => {
    push({
      id: `gate_pass:${pass.id}`,
      entity_type: "gate_pass",
      entity_id: pass.id,
      step_code: null,
      team: "site_execution",
      label: "Approve material leaving the gate",
      document_number: pass.gate_pass_number,
      project_id: pass.project_id,
      project_name: name(pass.project_id),
      context: `${storeName.get(pass.store_id) ?? ""} — ${pass.purpose}`,
      since: pass.gate_pass_date,
      age_days: ageInDays(pass.gate_pass_date),
      href: `/projects/${pass.project_id}/stores/gate-pass`,
    });
  });

  await raBillStepItems(scope, name, push, "project_head", "Cross-team verification");
  await outstandingTransmittalItems(scope, name, push);
}

/* ------------------------------------------------------------------ */
/* Site Engineer — quantities only, never a value                      */
/* ------------------------------------------------------------------ */

async function siteEngineerItems(scope: QueryScope, name: NameOf, push: Push): Promise<void> {
  const repos = getRepositories();
  const dprs = inScope(await repos.dprs.list(), scope);
  const now = today();

  // Today's report, if it has not been filed on a project you are posted to.
  for (const project_id of scope.project_ids) {
    if (dprs.some((d) => d.project_id === project_id && d.report_date === now)) continue;
    push({
      id: `dpr:${project_id}`,
      entity_type: "dpr",
      entity_id: project_id,
      step_code: "A3",
      team: "site_execution",
      label: "File today's daily progress report",
      document_number: formatDate(now),
      project_id,
      project_name: name(project_id),
      context: "Progress and labour on site",
      since: now,
      age_days: 0,
      href: `/projects/${project_id}/progress/daily-report`,
    });
  }

  // POs that are due or overdue with nothing received against them.
  const pos = inScope(await repos.purchaseOrders.list(), scope);
  const suppliers = await repos.suppliers.list();
  const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));
  pos
    .filter((po) => po.status === "sent" && ageInDays(po.expected_delivery_date) >= 0)
    .forEach((po) => {
      push({
        id: `grn:${po.id}`,
        entity_type: "purchase_order",
        entity_id: po.id,
        step_code: "B5",
        team: "site_execution",
        label: "Material due — receive it and post a GRN",
        document_number: po.po_number,
        project_id: po.project_id,
        project_name: name(po.project_id),
        context: supplierName.get(po.supplier_id) ?? "",
          since: po.expected_delivery_date,
        age_days: ageInDays(po.expected_delivery_date),
        href: `/projects/${po.project_id}/procurement/grn`,
      });
    });

  // Work reported done that nobody has offered to the QS yet.
  const lines = inScope(await repos.workOrders.listLines(), scope);
  const workOrders = await repos.workOrders.list();
  const woNumber = new Map(workOrders.map((w) => [w.id, w.wo_number]));
  lines
    .filter((l) => !l.ready_to_measure && l.done_qty - l.measured_qty > 0.5)
    .forEach((line) => {
      push({
        id: `ready:${line.id}`,
        entity_type: "work_order_line",
        entity_id: line.id,
        step_code: "A4",
        team: "site_execution",
        label: "Work done but not flagged ready to measure",
        document_number: woNumber.get(line.work_order_id) ?? "",
        project_id: line.project_id,
        project_name: name(line.project_id),
        context: `${line.description} — ${formatNumber(line.done_qty - line.measured_qty, 2)} ${line.unit} unmeasured`,
          since: line.updated_at.slice(0, 10),
        age_days: ageInDays(line.updated_at),
        href: `/projects/${line.project_id}/progress/work-done`,
      });
    });

  await outstandingTransmittalItems(scope, name, push);
}

/* ------------------------------------------------------------------ */
/* Drawing transmittals — issued, not yet acknowledged                 */
/* ------------------------------------------------------------------ */

/**
 * Shared by every role that can raise a transmittal (site engineer, QS,
 * project head): what they issued is waiting on a signature at the other
 * end, which is their own follow-up to chase, not a gate another team holds.
 */
async function outstandingTransmittalItems(
  scope: QueryScope,
  name: NameOf,
  push: Push,
): Promise<void> {
  const repos = getRepositories();
  const transmittals = inScope(await repos.transmittals.list(), scope).filter(
    (t) => t.status === "issued",
  );
  transmittals.forEach((t) => {
    push({
      id: `transmittal:${t.id}`,
      entity_type: "transmittal",
      entity_id: t.id,
      step_code: null,
      team: "project_budget",
      label: "Drawing transmittal issued — not yet acknowledged",
      document_number: t.transmittal_number,
      project_id: t.project_id,
      project_name: name(t.project_id),
      context: t.to_company || t.to_name,
      since: t.issued_at?.slice(0, 10) ?? t.transmittal_date,
      age_days: ageInDays(t.issued_at ?? t.transmittal_date),
      href: `/projects/${t.project_id}/drawings/transmittals`,
    });
  });
}

/* ------------------------------------------------------------------ */
/* Manager - stores — the three queues the store itself owns           */
/* ------------------------------------------------------------------ */

/**
 * Quantities only, never a value — the storeman is denied the `rates` data
 * class, so nothing here computes one.
 *
 * Three queues, which is his whole day: material at the gate with no GRN
 * against it, gate passes that have not come back, and transfers nobody has
 * signed for. Plus the drafts he has not sent anywhere yet, because a draft
 * sitting in a list is work that looks done and is not.
 */
async function storeKeeperItems(scope: QueryScope, name: NameOf, push: Push): Promise<void> {
  const repos = getRepositories();
  const [pos, suppliers, passes, passLines, transfers, inbound, stores] = await Promise.all([
    repos.purchaseOrders.list(),
    repos.suppliers.list(),
    repos.gatePasses.list(),
    repos.gatePasses.listLines(),
    repos.materialTransfers.list(),
    inboundTransfers(scope),
    repos.stores.list(),
  ]);
  const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));
  const storeName = new Map(stores.map((s) => [s.id, s.name]));
  const now = today();

  // Material due or overdue on site, with the GRN still to post.
  inScope(pos, scope)
    .filter((po) => po.status === "sent" && ageInDays(po.expected_delivery_date) >= 0)
    .forEach((po) => {
      push({
        id: `store-grn:${po.id}`,
        entity_type: "purchase_order",
        entity_id: po.id,
        step_code: "B5",
        team: "site_execution",
        label: "Material due — receive it and post a GRN",
        document_number: po.po_number,
        project_id: po.project_id,
        project_name: name(po.project_id),
        context: supplierName.get(po.supplier_id) ?? "",
        since: po.expected_delivery_date,
        age_days: ageInDays(po.expected_delivery_date),
        href: `/projects/${po.project_id}/procurement/grn`,
      });
    });

  // Gate passes he has started and not sent to the project manager.
  inScope(passes, scope)
    .filter((p) => p.status === "draft")
    .forEach((pass) => {
      push({
        id: `gp-draft:${pass.id}`,
        entity_type: "gate_pass",
        entity_id: pass.id,
        step_code: null,
        team: "site_execution",
        label: "Gate pass drafted — send it for approval",
        document_number: pass.gate_pass_number,
        project_id: pass.project_id,
        project_name: name(pass.project_id),
        context: pass.purpose,
        since: pass.gate_pass_date,
        age_days: ageInDays(pass.gate_pass_date),
        href: `/projects/${pass.project_id}/stores/gate-pass`,
      });
    });

  // Approved but not yet handed over at the gate.
  inScope(passes, scope)
    .filter((p) => p.status === "approved")
    .forEach((pass) => {
      push({
        id: `gp-ack:${pass.id}`,
        entity_type: "gate_pass",
        entity_id: pass.id,
        step_code: null,
        team: "site_execution",
        label: "Gate pass approved — get the receiver to sign for it",
        document_number: pass.gate_pass_number,
        project_id: pass.project_id,
        project_name: name(pass.project_id),
        context: `${pass.issued_to_company || pass.issued_to_name} — ${pass.purpose}`,
        since: pass.approved_at?.slice(0, 10) ?? pass.gate_pass_date,
        age_days: ageInDays(pass.approved_at ?? pass.gate_pass_date),
        href: `/projects/${pass.project_id}/stores/gate-pass`,
      });
    });

  /*
   * Returnable passes that have not come back. Every one is a queue item, not
   * only the overdue ones: the storeman is the person who has to go and ask,
   * and `ageBand` already colours the old ones amber and red.
   */
  inScope(passes, scope)
    .filter((p) => p.pass_type === "returnable" && p.status === "acknowledged")
    .forEach((pass) => {
      const lines = passLines.filter((l) => l.gate_pass_id === pass.id);
      const outstanding = lines.reduce((s, l) => s + Math.max(0, l.quantity - l.returned_qty), 0);
      const due = pass.expected_return_date ?? pass.gate_pass_date;
      push({
        id: `gp-return:${pass.id}`,
        entity_type: "gate_pass",
        entity_id: pass.id,
        step_code: null,
        team: "site_execution",
        label:
          due < now
            ? "Gate pass overdue — chase what is still out"
            : "Gate pass out — record the return when it comes back",
        document_number: pass.gate_pass_number,
        project_id: pass.project_id,
        project_name: name(pass.project_id),
        context: `${pass.issued_to_company || pass.issued_to_name} — ${formatNumber(outstanding, 2)} still out`,
        since: due,
        age_days: ageInDays(due),
        href: `/projects/${pass.project_id}/stores/gate-pass`,
      });
    });

  // Transfers arriving here and not signed for. This is the receiving store's
  // own queue, and a transfer is filed under the project it left, so it has to
  // be looked up by destination.
  inbound
    .filter((t) => t.status === "in_transit")
    .forEach((transfer) => {
      const since = transfer.dispatched_at?.slice(0, 10) ?? transfer.transfer_date;
      push({
        id: `mto-ack:${transfer.id}`,
        entity_type: "material_transfer",
        entity_id: transfer.id,
        step_code: null,
        team: "site_execution",
        label: "Transfer in transit — acknowledge what arrived",
        document_number: transfer.transfer_number,
        project_id: transfer.project_id,
        project_name: name(transfer.project_id),
        context: `From ${storeName.get(transfer.from_store_id) ?? name(transfer.project_id)}`,
        since,
        age_days: ageInDays(since),
        href: `/projects/${transfer.project_id}/stores/transfer-orders`,
      });
    });

  // Transfers he has drafted and not dispatched.
  inScope(transfers, scope)
    .filter((t) => t.status === "draft")
    .forEach((transfer) => {
      push({
        id: `mto-draft:${transfer.id}`,
        entity_type: "material_transfer",
        entity_id: transfer.id,
        step_code: null,
        team: "site_execution",
        label: "Transfer order drafted — dispatch it",
        document_number: transfer.transfer_number,
        project_id: transfer.project_id,
        project_name: name(transfer.project_id),
        context: transfer.reason,
        since: transfer.transfer_date,
        age_days: ageInDays(transfer.transfer_date),
        href: `/projects/${transfer.project_id}/stores/transfer-orders`,
      });
    });
}

/* ------------------------------------------------------------------ */
/* Purchase & Stores                                                   */
/* ------------------------------------------------------------------ */

async function purchaseItems(
  scope: QueryScope,
  name: NameOf,
  push: Push,
  read_only: boolean,
): Promise<void> {
  const repos = getRepositories();
  const [indents, comparatives, comparativeLines, pos, grns, bills, returns, suppliers] =
    await Promise.all([
      repos.indents.list(),
      repos.comparatives.list(),
      repos.comparatives.listLines(),
      repos.purchaseOrders.list(),
      repos.grns.list(),
      repos.vendorBills.list(),
      repos.returns.list(),
      repos.suppliers.list(),
    ]);
  const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));
  const mark = read_only ? { read_only: true } : {};

  // Approved indents nobody has started quoting.
  const live = new Set(
    comparatives.filter((c) => c.status !== "rejected" && c.status !== "sent_back").map((c) => c.id),
  );
  const committed = new Set(
    comparativeLines.filter((l) => live.has(l.comparative_id)).map((l) => l.indent_id),
  );
  inScope(indents, scope)
    .filter(
      (i) =>
        (i.status === "approved" || i.status === "partially_approved") && !committed.has(i.id),
    )
    .forEach((indent) => {
      push({
        id: `comparative:${indent.id}`,
        entity_type: "indent",
        entity_id: indent.id,
        step_code: "B1",
        team: "purchase_stores",
        label: "Approved indent — start a vendor comparative",
        document_number: indent.indent_number,
        project_id: indent.project_id,
        project_name: name(indent.project_id),
        context: indent.remarks || "Ready to quote",
          since: indent.approved_at?.slice(0, 10) ?? indent.raised_date,
        age_days: ageInDays(indent.approved_at ?? indent.raised_date),
        href: `/projects/${indent.project_id}/procurement/comparatives`,
        ...mark,
      });
    });

  // Approved comparatives with no PO yet.
  const withPo = new Set(pos.map((p) => p.comparative_id).filter(Boolean) as string[]);
  inScope(comparatives, scope)
    .filter((c) => c.status === "approved" && !withPo.has(c.id))
    .forEach((c) => {
      push({
        id: `po:${c.id}`,
        entity_type: "comparative",
        entity_id: c.id,
        step_code: "B3",
        team: "purchase_stores",
        label: "Approved comparative — generate the purchase orders",
        document_number: c.comparative_number,
        project_id: c.project_id,
        project_name: name(c.project_id),
        context: supplierName.get(
          comparativeLines.find((l) => l.comparative_id === c.id)?.selected_supplier_id ?? "",
        ) ?? "",
        value: c.total_selected_value,
        since: c.decided_at?.slice(0, 10) ?? c.prepared_date,
        age_days: ageInDays(c.decided_at ?? c.prepared_date),
        href: `/projects/${c.project_id}/procurement/purchase-orders`,
        ...mark,
      });
    });

  /*
   * The officer's three purchase-order queues, which are three different
   * actions and so three different lines: a draft to send for sign-off, one
   * sent back for rework, and an authorised order still not issued.
   */
  const PO_QUEUES: Array<{
    status: (typeof pos)[number]["status"];
    step: "B3" | "B4";
    label: string;
  }> = [
    { status: "draft", step: "B3", label: "Purchase order drafted — send it for approval" },
    { status: "sent_back", step: "B3", label: "Purchase order sent back — rework and resubmit" },
    { status: "approved", step: "B4", label: "Purchase order authorised — issue it to the supplier" },
  ];
  for (const queue of PO_QUEUES) {
    inScope(pos, scope)
      .filter((po) => po.status === queue.status)
      .forEach((po) => {
        push({
          id: `po-${queue.status}:${po.id}`,
          entity_type: "purchase_order",
          entity_id: po.id,
          step_code: queue.step,
          team: "purchase_stores",
          label: queue.label,
          document_number: po.po_number,
          project_id: po.project_id,
          project_name: name(po.project_id),
          context:
            (supplierName.get(po.supplier_id) ?? "") +
            (po.status === "sent_back" && po.decision_comment ? ` · ${po.decision_comment}` : ""),
          value: po.total_amount,
          since: po.submitted_at?.slice(0, 10) ?? po.po_date,
          age_days: ageInDays(po.submitted_at ?? po.po_date),
          href: `/projects/${po.project_id}/procurement/purchase-orders`,
          ...mark,
        });
      });
  }

  // GRNs nobody has billed against.
  const billedGrns = new Set(bills.flatMap((b) => b.grn_ids));
  inScope(grns, scope)
    .filter((g) => !billedGrns.has(g.id))
    .forEach((g) => {
      push({
        id: `bill:${g.id}`,
        entity_type: "grn",
        entity_id: g.id,
        step_code: "B7",
        team: "purchase_stores",
        label: "Material received — no vendor bill entered",
        document_number: g.grn_number,
        project_id: g.project_id,
        project_name: name(g.project_id),
        context: supplierName.get(g.supplier_id) ?? "",
          since: g.received_on,
        age_days: ageInDays(g.received_on),
        href: `/projects/${g.project_id}/procurement/vendor-bills`,
        ...mark,
      });
    });

  // Bills waiting to be verified, or verified and waiting to go to Accounts.
  inScope(bills, scope)
    .filter((b) => b.status !== "handed_over")
    .forEach((b) => {
      const verified = b.status === "verified";
      push({
        id: `vendorbill:${b.id}`,
        entity_type: "vendor_bill",
        entity_id: b.id,
        step_code: verified ? "B8" : "B7",
        team: verified ? "accounts" : "purchase_stores",
        label: verified
          ? "Verified bill — hand it over to Accounts"
          : b.status === "mismatch"
            ? "Bill failed the three-way match — resolve it"
            : "Bill matched — verify it",
        document_number: b.bill_number,
        project_id: b.project_id,
        project_name: name(b.project_id),
        context: supplierName.get(b.supplier_id) ?? "",
        value: b.bill_total_amount,
        since: b.received_date,
        age_days: ageInDays(b.received_date),
        href: `/projects/${b.project_id}/procurement/vendor-bills`,
        ...mark,
      });
    });

  // Returns still to be sent back to the supplier.
  inScope(returns, scope)
    .filter((r) => r.status !== "debit_note_issued")
    .forEach((r) => {
      push({
        id: `return:${r.id}`,
        entity_type: "supplier_return",
        entity_id: r.id,
        step_code: null,
        team: "purchase_stores",
        label:
          r.status === "raised"
            ? "Rejected material — dispatch the return"
            : "Return dispatched — issue the debit note",
        document_number: r.return_number,
        project_id: r.project_id,
        project_name: name(r.project_id),
        context: supplierName.get(r.supplier_id) ?? r.reason,
        value: r.amount,
        since: r.return_date,
        age_days: ageInDays(r.return_date),
        href: `/projects/${r.project_id}/procurement/returns`,
        ...mark,
      });
    });
}

/** The Purchase Head acts on B2; everything else is for awareness. */
async function purchaseHeadItems(scope: QueryScope, name: NameOf, push: Push): Promise<void> {
  const repos = getRepositories();
  const [comparatives, lines, suppliers] = await Promise.all([
    repos.comparatives.list(),
    repos.comparatives.listLines(),
    repos.suppliers.list(),
  ]);
  const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));

  inScope(comparatives, scope)
    .filter((c) => c.status === "pending_approval")
    .forEach((c) => {
      const mine = lines.filter((l) => l.comparative_id === c.id);
      const notL1 = mine.filter((l) => !l.is_l1_selected).length;
      push({
        id: `b2:${c.id}`,
        entity_type: "comparative",
        entity_id: c.id,
        step_code: "B2",
        team: "purchase_stores",
        label: "Approve the purchase",
        document_number: c.comparative_number,
        project_id: c.project_id,
        project_name: name(c.project_id),
        context:
          [...new Set(mine.map((l) => supplierName.get(l.selected_supplier_id ?? "") ?? ""))]
            .filter(Boolean)
            .join(", ") + (notL1 > 0 ? ` · ${notL1} not L1` : ""),
        value: c.total_selected_value,
        since: c.submitted_at?.slice(0, 10) ?? c.prepared_date,
        age_days: ageInDays(c.submitted_at ?? c.prepared_date),
        href: `/projects/${c.project_id}/procurement/approval`,
      });
    });

  await poStepItems(scope, name, push, "purchase_head", "Recommend the purchase order");
  await purchaseItems(scope, name, push, true);
}

/** Purchase orders whose current sign-off step belongs to `role`. */
async function poStepItems(
  scope: QueryScope,
  name: NameOf,
  push: Push,
  role: Role,
  label: string,
): Promise<void> {
  const repos = getRepositories();
  const [pos, suppliers] = await Promise.all([repos.purchaseOrders.list(), repos.suppliers.list()]);
  const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));

  inScope(pos, scope)
    .filter((po) => po.status === "pending_approval")
    .forEach((po) => {
      const step = APPROVAL_CHAINS.purchase_order.find((x) => x.sequence === po.current_sequence);
      if (!step || step.required_role !== role) return;
      push({
        id: `po-sign:${po.id}`,
        entity_type: "purchase_order",
        entity_id: po.id,
        step_code: step.step_code,
        team: "purchase_stores",
        label,
        document_number: po.po_number,
        project_id: po.project_id,
        project_name: name(po.project_id),
        context: supplierName.get(po.supplier_id) ?? "",
        value: po.total_amount,
        since: po.submitted_at?.slice(0, 10) ?? po.po_date,
        age_days: ageInDays(po.submitted_at ?? po.po_date),
        href: `/projects/${po.project_id}/procurement/purchase-orders`,
      });
    });
}

/* ------------------------------------------------------------------ */
/* Project QS — C1 through C5                                          */
/* ------------------------------------------------------------------ */

async function projectQsItems(scope: QueryScope, name: NameOf, push: Push): Promise<void> {
  const repos = getRepositories();
  const [lines, workOrders, measurements, bills, contractors] = await Promise.all([
    repos.workOrders.listLines(),
    repos.workOrders.list(),
    repos.measurements.list(),
    repos.raBills.list(),
    repos.contractors.list(),
  ]);
  const woNumber = new Map(workOrders.map((w) => [w.id, w.wo_number]));
  const contractorName = new Map(contractors.map((c) => [c.id, c.name]));

  inScope(lines, scope)
    .filter((l) => l.ready_to_measure && l.ready_qty > 0)
    .forEach((line) => {
      push({
        id: `measure:${line.id}`,
        entity_type: "work_order_line",
        entity_id: line.id,
        step_code: "C1",
        team: "billing_certification",
        label: "Site has flagged work ready — measure it",
        document_number: woNumber.get(line.work_order_id) ?? "",
        project_id: line.project_id,
        project_name: name(line.project_id),
        context: `${line.description} — ${formatNumber(line.ready_qty, 2)} ${line.unit} claimed`,
        value: line.ready_qty * line.agreed_rate,
        since: line.updated_at.slice(0, 10),
        age_days: ageInDays(line.updated_at),
        href: `/projects/${line.project_id}/billing/measurements`,
      });
    });

  inScope(measurements, scope).forEach((m) => {
    if (m.status === "draft") {
      push({
        id: `sign:${m.id}`,
        entity_type: "joint_measurement",
        entity_id: m.id,
        step_code: "C1",
        team: "billing_certification",
        label: "Measurement drafted — get it signed",
        document_number: m.measurement_number,
        project_id: m.project_id,
        project_name: name(m.project_id),
        context: contractorName.get(m.contractor_id) ?? "",
        value: m.total_value,
        since: m.measurement_date,
        age_days: ageInDays(m.measurement_date),
        href: `/projects/${m.project_id}/billing/measurements`,
      });
    }
    if (m.status === "signed") {
      push({
        id: `billit:${m.id}`,
        entity_type: "joint_measurement",
        entity_id: m.id,
        step_code: "C2",
        team: "billing_certification",
        label: "Signed measurement — prepare the RA bill",
        document_number: m.measurement_number,
        project_id: m.project_id,
        project_name: name(m.project_id),
        context: contractorName.get(m.contractor_id) ?? "",
        value: m.total_value,
        since: m.signed_by_qs_at?.slice(0, 10) ?? m.measurement_date,
        age_days: ageInDays(m.signed_by_qs_at ?? m.measurement_date),
        href: `/projects/${m.project_id}/billing/ra-bills`,
      });
    }
  });

  inScope(bills, scope).forEach((b) => {
    if (b.status === "draft") {
      push({
        id: `resubmit:${b.id}`,
        entity_type: "ra_bill",
        entity_id: b.id,
        step_code: "C2",
        team: "billing_certification",
        label: b.decision_comment ? "Bill sent back — rework and resubmit" : "Draft bill — submit it",
        document_number: b.bill_number,
        project_id: b.project_id,
        project_name: name(b.project_id),
        context: contractorName.get(b.contractor_id) ?? "",
        value: b.gross_amount,
        since: b.bill_date,
        age_days: ageInDays(b.bill_date),
        href: `/projects/${b.project_id}/billing/ra-bills`,
      });
    }
    if (b.status === "certified") {
      push({
        id: `handover:${b.id}`,
        entity_type: "ra_bill",
        entity_id: b.id,
        step_code: "C5",
        team: "accounts",
        label: "Certified bill — hand it over to Accounts",
        document_number: b.bill_number,
        project_id: b.project_id,
        project_name: name(b.project_id),
        context: contractorName.get(b.contractor_id) ?? "",
        value: b.net_payable_amount,
        since: b.certified_at?.slice(0, 10) ?? b.bill_date,
        age_days: ageInDays(b.certified_at ?? b.bill_date),
        href: `/projects/${b.project_id}/billing/handed-over`,
      });
    }
  });

  await raBillStepItems(scope, name, push, "project_qs", "Verify the bill");
  await outstandingTransmittalItems(scope, name, push);
}

/* ------------------------------------------------------------------ */
/* QS Head and HoD — their own step in the chain                       */
/* ------------------------------------------------------------------ */

async function approverItems(scope: QueryScope, name: NameOf, push: Push): Promise<void> {
  await raBillStepItems(scope, name, push, scope.role, "Approve the certified bill");
  // The HoD is also the authorised signatory on a purchase order (B4).
  if (scope.role === "hod") {
    await poStepItems(scope, name, push, "hod", "Authorise the purchase order");
  }
}

/** RA bills whose current chain step belongs to `role`. */
async function raBillStepItems(
  scope: QueryScope,
  name: NameOf,
  push: Push,
  role: Role,
  label: string,
): Promise<void> {
  const repos = getRepositories();
  const [bills, contractors] = await Promise.all([repos.raBills.list(), repos.contractors.list()]);
  const contractorName = new Map(contractors.map((c) => [c.id, c.name]));

  inScope(bills, scope)
    .filter((b) => b.status === "in_certification")
    .forEach((b) => {
      const step = APPROVAL_CHAINS.ra_bill.find((s) => s.sequence === b.current_sequence);
      if (!step || step.required_role !== role) return;
      push({
        id: `certify:${b.id}`,
        entity_type: "ra_bill",
        entity_id: b.id,
        step_code: step.step_code,
        team: step.required_role === "project_head" ? "project_budget" : "billing_certification",
        label,
        document_number: b.bill_number,
        project_id: b.project_id,
        project_name: name(b.project_id),
        context: contractorName.get(b.contractor_id) ?? "",
        value: b.gross_amount,
        since: b.submitted_at?.slice(0, 10) ?? b.bill_date,
        age_days: ageInDays(b.submitted_at ?? b.bill_date),
        href: `/projects/${b.project_id}/billing/certification`,
      });
    });
}
