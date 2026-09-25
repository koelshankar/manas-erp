import { getRepositories } from "@/lib/data";
import { APPROVAL_CHAINS } from "@/config/permissions";
import { ageInDays, today } from "@/lib/clock";
import { formatDate, formatNumber } from "@/lib/format";
import type { Role } from "@/lib/domain";
import { inScope } from "./scope";
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
  const materials = await repos.materials.list();
  const materialName = new Map(materials.map((m) => [m.id, m.name]));

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
        .map((l) => materialName.get(l.material_id) ?? "")
        .filter(Boolean)
        .join(", "),
      since: indent.raised_date,
      age_days: ageInDays(indent.raised_date),
      href: `/projects/${indent.project_id}/budget/indent-approval`,
    });
  });

  await raBillStepItems(scope, name, push, "project_head", "Cross-team verification");
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
      href: `/projects/${project_id}/site/dpr`,
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
        href: `/projects/${po.project_id}/site/grn`,
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
        href: `/projects/${line.project_id}/site/work-done`,
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
        href: `/projects/${indent.project_id}/purchase/comparatives`,
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
        href: `/projects/${c.project_id}/purchase/purchase-orders`,
        ...mark,
      });
    });

  // Drafted POs still sitting on the desk.
  inScope(pos, scope)
    .filter((po) => po.status === "draft")
    .forEach((po) => {
      push({
        id: `send:${po.id}`,
        entity_type: "purchase_order",
        entity_id: po.id,
        step_code: "B4",
        team: "purchase_stores",
        label: "Purchase order drafted — send it to the vendor",
        document_number: po.po_number,
        project_id: po.project_id,
        project_name: name(po.project_id),
        context: supplierName.get(po.supplier_id) ?? "",
        value: po.total_amount,
        since: po.po_date,
        age_days: ageInDays(po.po_date),
        href: `/projects/${po.project_id}/purchase/purchase-orders`,
        ...mark,
      });
    });

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
        href: `/projects/${g.project_id}/purchase/vendor-bills`,
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
        href: `/projects/${b.project_id}/purchase/vendor-bills`,
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
        href: `/projects/${r.project_id}/purchase/returns`,
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
        href: `/projects/${c.project_id}/purchase/approval`,
      });
    });

  await purchaseItems(scope, name, push, true);
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
}

/* ------------------------------------------------------------------ */
/* QS Head and HoD — their own step in the chain                       */
/* ------------------------------------------------------------------ */

async function approverItems(scope: QueryScope, name: NameOf, push: Push): Promise<void> {
  await raBillStepItems(scope, name, push, scope.role, "Approve the certified bill");
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
