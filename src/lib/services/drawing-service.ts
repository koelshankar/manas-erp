import { z } from "zod";
import { getRepositories } from "@/lib/data";
import { DRAWING_REVISION_CODES, type Drawing, type DrawingRevision } from "@/lib/domain";
import { assertCan, parseInput, qty, required } from "./guards";
import { ValidationError, type ActingUser } from "./types";

/**
 * The drawing register.
 *
 * A drawing is logged with its first revision in one call — a register row
 * with no revision at all has nothing in its "current revision" column, and
 * their Excel sheet never has one either. Every later revision goes through
 * `addDrawingRevision`, which is the register's one writer for the three
 * roll-up columns (`current_revision_code`, `current_revision_date`,
 * `current_status`), exactly the pattern `WorkOrderLine`'s roll-ups follow.
 *
 * Revisions are sequential, R0 through R4: a drawing cannot skip from R0 to
 * R2, and a sixth revision is refused rather than invented as "R5" — their
 * template stops at five columns.
 */

export const createDrawingInput = z.object({
  project_id: z.string().min(1),
  drawing_no: z.string().min(1, "give the drawing a number"),
  title: z.string().min(2, "give the drawing a title"),
  discipline: z.string().min(1),
  sheet_size: z.string().min(1),
  consultant: z.string().default(""),
  revision_date: z.string().min(1, "the first revision needs a date"),
  copies_received: z.number().nonnegative().default(1),
  remarks: z.string().default(""),
});
export type CreateDrawingInput = z.input<typeof createDrawingInput>;

export type DrawingResult = { drawing: Drawing; revision: DrawingRevision };

export async function createDrawing(
  input: CreateDrawingInput,
  actor: ActingUser,
): Promise<DrawingResult> {
  assertCan(actor, "create", "drawings");
  const data = parseInput(createDrawingInput, input);
  const repos = getRepositories();

  const project = required(await repos.projects.getById(data.project_id), "Project");

  const existing = await repos.drawings.listByProject(project.id);
  if (existing.some((d) => d.drawing_no.toLowerCase() === data.drawing_no.toLowerCase())) {
    throw new ValidationError(`drawing_no: ${data.drawing_no} is already on the register`);
  }

  const drawing = await repos.drawings.create({
    project_id: project.id,
    drawing_no: data.drawing_no,
    title: data.title,
    discipline: data.discipline as Drawing["discipline"],
    sheet_size: data.sheet_size as Drawing["sheet_size"],
    consultant: data.consultant,
    current_revision_code: null,
    current_revision_date: null,
    current_status: "",
  });

  const revision = await writeRevision(drawing, "R0", data.revision_date, data.copies_received, data.remarks);
  const updated = await rollUp(drawing.id);
  return { drawing: updated, revision };
}

export const addDrawingRevisionInput = z.object({
  drawing_id: z.string().min(1),
  revision_date: z.string().min(1, "the revision needs a date"),
  copies_received: z.number().nonnegative().default(1),
  remarks: z.string().default(""),
});
export type AddDrawingRevisionInput = z.input<typeof addDrawingRevisionInput>;

export async function addDrawingRevision(
  input: AddDrawingRevisionInput,
  actor: ActingUser,
): Promise<DrawingResult> {
  assertCan(actor, "edit", "drawings");
  const data = parseInput(addDrawingRevisionInput, input);
  const repos = getRepositories();

  const drawing = required(await repos.drawings.getById(data.drawing_id), "Drawing");
  const have = await repos.drawings.listRevisionsByDrawing(drawing.id);
  const nextIndex = have.length;
  if (nextIndex >= DRAWING_REVISION_CODES.length) {
    throw new ValidationError(
      `${drawing.drawing_no} already carries R0 through R4 — their register has no sixth column.`,
    );
  }
  const code = DRAWING_REVISION_CODES[nextIndex];

  const revision = await writeRevision(drawing, code, data.revision_date, data.copies_received, data.remarks);
  const updated = await rollUp(drawing.id);
  return { drawing: updated, revision };
}

async function writeRevision(
  drawing: Drawing,
  revision_code: (typeof DRAWING_REVISION_CODES)[number],
  revision_date: string,
  copies_received: number,
  remarks: string,
): Promise<DrawingRevision> {
  const repos = getRepositories();
  return repos.drawings.createRevision({
    project_id: drawing.project_id,
    drawing_id: drawing.id,
    revision_code,
    revision_date,
    copies_received: qty(copies_received),
    remarks,
  });
}

/** Rolls the latest revision onto the drawing's three summary columns. */
async function rollUp(drawing_id: string): Promise<Drawing> {
  const repos = getRepositories();
  const revisions = await repos.drawings.listRevisionsByDrawing(drawing_id);
  const latest = [...revisions].sort((a, b) =>
    DRAWING_REVISION_CODES.indexOf(a.revision_code) -
    DRAWING_REVISION_CODES.indexOf(b.revision_code),
  ).at(-1);

  return repos.drawings.update(drawing_id, {
    current_revision_code: latest?.revision_code ?? null,
    current_revision_date: latest?.revision_date ?? null,
    current_status: latest?.remarks ?? "",
  });
}

export const updateDrawingInput = z.object({
  drawing_id: z.string().min(1),
  title: z.string().min(2),
  discipline: z.string().min(1),
  sheet_size: z.string().min(1),
  consultant: z.string().default(""),
});
export type UpdateDrawingInput = z.input<typeof updateDrawingInput>;

/** Corrects the drawing's own particulars. Never touches a revision. */
export async function updateDrawing(input: UpdateDrawingInput, actor: ActingUser): Promise<Drawing> {
  assertCan(actor, "edit", "drawings");
  const data = parseInput(updateDrawingInput, input);
  const repos = getRepositories();
  const drawing = required(await repos.drawings.getById(data.drawing_id), "Drawing");
  return repos.drawings.update(drawing.id, {
    title: data.title,
    discipline: data.discipline as Drawing["discipline"],
    sheet_size: data.sheet_size as Drawing["sheet_size"],
    consultant: data.consultant,
  });
}
