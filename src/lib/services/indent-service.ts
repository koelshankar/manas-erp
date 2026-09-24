import { z } from "zod";
import { getRepositories } from "@/lib/data";
import {
  INDENT_TRANSITIONS,
  nowIso,
  type Approval,
  type Indent,
  type IndentLine,
  type IndentStatus,
} from "@/lib/domain";
import { APPROVAL_CHAINS } from "@/config/permissions";
import { assertCan, assertTransition, parseInput, qty, required } from "./guards";
import { nextDocumentNumber } from "./numbering";
import { ValidationError, WorkflowError, type ActingUser } from "./types";

/* ------------------------------------------------------------------ */
/* A2 — createIndent                                                   */
/* ------------------------------------------------------------------ */

export const createIndentLineInput = z.object({
  boq_line_id: z.string().min(1, "pick a BOQ line"),
  material_id: z.string().min(1, "pick a material"),
  requested_qty: z.number().positive("quantity must be greater than zero"),
  required_by: z.string().min(1, "required-by date is needed"),
  remarks: z.string().default(""),
});

export const createIndentInput = z.object({
  project_id: z.string().min(1),
  work_order_id: z.string().nullable().default(null),
  site_task_id: z.string().nullable().default(null),
  remarks: z.string().default(""),
  lines: z.array(createIndentLineInput).min(1, "an indent needs at least one line"),
});

export type CreateIndentInput = z.input<typeof createIndentInput>;

export type CreateIndentResult = {
  indent: Indent;
  lines: IndentLine[];
  approval: Approval;
};

/**
 * Raises an A2 material indent and opens the Project Head's approval gate.
 *
 * Requesting more than the BOQ material balance is deliberately allowed — the
 * screen warns, the Project Head decides. Only genuinely invalid input is
 * rejected here.
 */
export async function createIndent(
  input: CreateIndentInput,
  actor: ActingUser,
): Promise<CreateIndentResult> {
  assertCan(actor, "create", "indents");
  const data = parseInput(createIndentInput, input);
  const repos = getRepositories();

  const project = required(await repos.projects.getById(data.project_id), "Project");
  const boqLines = await repos.boq.listByProject(project.id);
  const boqById = new Map(boqLines.map((b) => [b.id, b]));
  const materials = await repos.materials.list();
  const materialById = new Map(materials.map((m) => [m.id, m]));

  const seen = new Set<string>();
  data.lines.forEach((line, i) => {
    if (!boqById.has(line.boq_line_id)) {
      throw new ValidationError(`lines.${i}.boq_line_id: not a BOQ line on this project`);
    }
    if (!materialById.has(line.material_id)) {
      throw new ValidationError(`lines.${i}.material_id: unknown material`);
    }
    const key = `${line.boq_line_id}:${line.material_id}`;
    if (seen.has(key)) {
      throw new ValidationError(
        `lines.${i}: ${materialById.get(line.material_id)!.name} is already on this indent for the same BOQ line`,
      );
    }
    seen.add(key);
  });

  if (data.work_order_id) {
    required(await repos.workOrders.getById(data.work_order_id), "Work order");
  }

  const today = nowIso();
  const indent_number = await nextDocumentNumber("IND", project, today);
  const required_by_date = data.lines
    .map((l) => l.required_by)
    .sort((a, b) => a.localeCompare(b))[0];

  const indent = await repos.indents.create({
    project_id: project.id,
    indent_number,
    site_task_id: data.site_task_id,
    work_order_id: data.work_order_id,
    raised_by_user_id: actor.user_id,
    raised_date: today.slice(0, 10),
    required_by_date,
    status: "submitted",
    remarks: data.remarks,
    approved_by_user_id: null,
    approved_at: null,
    approval_comment: "",
  });

  const lines: IndentLine[] = [];
  for (const line of data.lines) {
    lines.push(
      await repos.indents.createLine({
        project_id: project.id,
        indent_id: indent.id,
        boq_line_id: line.boq_line_id,
        material_id: line.material_id,
        unit: materialById.get(line.material_id)!.unit,
        requested_qty: qty(line.requested_qty),
        approved_qty: null,
        rejection_reason: "",
        ordered_qty: 0,
        received_qty: 0,
        required_by: line.required_by,
        remarks: line.remarks,
      }),
    );
  }

  const step = APPROVAL_CHAINS.indent[0];
  const approval = await repos.approvals.create({
    project_id: project.id,
    entity_type: "indent",
    entity_id: indent.id,
    step_code: step.step_code,
    sequence: step.sequence,
    required_role: step.required_role,
    status: "pending",
    actor_user_id: null,
    comment: "",
    acted_at: null,
  });

  return { indent, lines, approval };
}

/* ------------------------------------------------------------------ */
/* A2 — approveIndent                                                  */
/* ------------------------------------------------------------------ */

export const approveIndentLineInput = z
  .object({
    indent_line_id: z.string().min(1),
    decision: z.enum(["approve", "reduce", "reject"]),
    /** Required for "reduce"; ignored otherwise. */
    approved_qty: z.number().nonnegative().optional(),
    /** Required for "reject". */
    rejection_reason: z.string().default(""),
  })
  .refine((l) => l.decision !== "reduce" || (l.approved_qty ?? 0) > 0, {
    message: "a reduced quantity must be greater than zero",
    path: ["approved_qty"],
  })
  .refine((l) => l.decision !== "reject" || l.rejection_reason.trim().length > 0, {
    message: "a rejected line needs a reason",
    path: ["rejection_reason"],
  });

export const approveIndentInput = z.object({
  indent_id: z.string().min(1),
  comment: z.string().default(""),
  lines: z.array(approveIndentLineInput).min(1),
});

export type ApproveIndentInput = z.input<typeof approveIndentInput>;

export type ApproveIndentResult = {
  indent: Indent;
  lines: IndentLine[];
  approval: Approval;
};

/**
 * The A2 gate. Per line the Project Head may approve in full, approve a reduced
 * quantity, or reject with a reason.
 *
 * Cascades: line approved_qty -> indent status -> the pending Approval row.
 */
export async function approveIndent(
  input: ApproveIndentInput,
  actor: ActingUser,
): Promise<ApproveIndentResult> {
  assertCan(actor, "approve", "indent_approval");
  const data = parseInput(approveIndentInput, input);
  const repos = getRepositories();

  const indent = required(await repos.indents.getById(data.indent_id), "Indent");
  const existing = await repos.indents.listLinesByIndent(indent.id);
  const byId = new Map(existing.map((l) => [l.id, l]));

  if (data.lines.length !== existing.length) {
    throw new ValidationError(
      `every line must be decided: ${existing.length} on the indent, ${data.lines.length} submitted`,
    );
  }

  const decided = data.lines.map((d) => {
    const line = byId.get(d.indent_line_id);
    if (!line) throw new ValidationError(`${d.indent_line_id} is not a line on this indent`);
    if (d.decision === "reduce" && (d.approved_qty ?? 0) > line.requested_qty) {
      throw new ValidationError(
        `approved quantity ${d.approved_qty} exceeds the requested ${line.requested_qty}`,
      );
    }
    const approved_qty =
      d.decision === "approve" ? line.requested_qty : d.decision === "reduce" ? qty(d.approved_qty!) : 0;
    return { line, approved_qty, rejection_reason: d.decision === "reject" ? d.rejection_reason : "" };
  });

  const anyApproved = decided.some((d) => d.approved_qty > 0);
  const allFull = decided.every((d) => d.approved_qty === d.line.requested_qty);
  const next: IndentStatus = !anyApproved ? "rejected" : allFull ? "approved" : "partially_approved";

  assertTransition("Indent", INDENT_TRANSITIONS, indent.status, next);

  const lines: IndentLine[] = [];
  for (const d of decided) {
    lines.push(
      await repos.indents.updateLine(d.line.id, {
        approved_qty: d.approved_qty,
        rejection_reason: d.rejection_reason,
      }),
    );
  }

  const at = nowIso();
  const updated = await repos.indents.update(indent.id, {
    status: next,
    approved_by_user_id: actor.user_id,
    approved_at: at,
    approval_comment: data.comment,
  });

  const pending = (await repos.approvals.listForEntity("indent", indent.id)).find(
    (a) => a.status === "pending",
  );
  if (!pending) throw new WorkflowError("This indent has no open approval step.");

  const approval = await repos.approvals.update(pending.id, {
    status: next === "rejected" ? "rejected" : "approved",
    actor_user_id: actor.user_id,
    comment: data.comment,
    acted_at: at,
  });

  return { indent: updated, lines, approval };
}
