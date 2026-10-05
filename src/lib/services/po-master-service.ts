import { z } from "zod";
import { getRepositories } from "@/lib/data";
import {
  DOCUMENT_KINDS,
  PO_CLAUSE_CATEGORIES,
  PO_VARIABLE_FIELDS,
  type DocumentSeries,
  type PoClause,
} from "@/lib/domain";
import { assertCan, parseInput, required } from "./guards";
import { PO_CLAUSE_CATALOGUE } from "./po-terms";
import { ValidationError, type ActingUser } from "./types";

/**
 * The two purchase order masters: the terms clause library and the document
 * numbering series. Both are reference data an officer maintains, so they live
 * in Masters and not on the order.
 */

/* ------------------------------------------------------------------ */
/* The clause library                                                  */
/* ------------------------------------------------------------------ */

export const poClauseInput = z.object({
  code: z.string().min(2, "a code is required"),
  category: z.enum(PO_CLAUSE_CATEGORIES),
  sequence: z.number().int().positive(),
  title: z.string().min(2, "a title is required"),
  text: z.string().min(5, "the clause text is required"),
  /**
   * Set only on the four clauses whose words come off the PO. The text then
   * needs a `{{value}}` placeholder saying where they go.
   */
  variable_field: z.enum(PO_VARIABLE_FIELDS).nullable().default(null),
  is_default: z.boolean().default(true),
  is_active: z.boolean().default(true),
});
export type PoClauseInput = z.input<typeof poClauseInput>;

export async function createPoClause(
  input: PoClauseInput,
  actor: ActingUser,
): Promise<PoClause> {
  assertCan(actor, "create", "po_clauses");
  const data = parseInput(poClauseInput, input);
  const repos = getRepositories();
  if (await repos.poClauses.getByCode(data.code)) {
    throw new ValidationError(`code: ${data.code} is already in the library`);
  }
  return repos.poClauses.create(data);
}

export async function updatePoClause(
  id: string,
  input: PoClauseInput,
  actor: ActingUser,
): Promise<PoClause> {
  assertCan(actor, "edit", "po_clauses");
  const data = parseInput(poClauseInput, input);
  const repos = getRepositories();
  required(await repos.poClauses.getById(id), "Clause");
  const clash = (await repos.poClauses.list()).some((c) => c.id !== id && c.code === data.code);
  if (clash) throw new ValidationError(`code: ${data.code} is already in the library`);
  return repos.poClauses.update(id, data);
}

/**
 * Deleting a clause an order already prints is refused.
 *
 * The order keeps its own copy of the words, so nothing would render blank —
 * but the trail back from a printed clause to the library entry it came from
 * would break, and that trail is the reason the library exists. Deactivate it
 * instead: it stops appearing on new orders and the old ones stay explicable.
 */
export async function deletePoClause(id: string, actor: ActingUser): Promise<void> {
  assertCan(actor, "delete", "po_clauses");
  const repos = getRepositories();
  const clause = required(await repos.poClauses.getById(id), "Clause");
  const used = (await repos.purchaseOrders.list()).length > 0 ? await countTermUses(id) : 0;
  if (used > 0) {
    throw new ValidationError(
      `${clause.title} is printed on ${used} purchase order${used === 1 ? "" : "s"}. Deactivate it instead of deleting it.`,
    );
  }
  await repos.poClauses.remove(id);
}

async function countTermUses(po_clause_id: string): Promise<number> {
  const repos = getRepositories();
  const orders = await repos.purchaseOrders.list();
  let n = 0;
  for (const po of orders) {
    const terms = await repos.purchaseOrders.listTermsByPo(po.id);
    if (terms.some((t) => t.po_clause_id === po_clause_id)) n += 1;
  }
  return n;
}

/**
 * Puts the library back to the sixteen clauses the build ships with, leaving
 * anything Manas added in place. Useful while the wording is still being
 * settled with them, and harmless afterwards.
 */
export async function restoreDefaultClauses(actor: ActingUser): Promise<PoClause[]> {
  assertCan(actor, "edit", "po_clauses");
  const repos = getRepositories();
  const out: PoClause[] = [];
  for (const seed of PO_CLAUSE_CATALOGUE) {
    const existing = await repos.poClauses.getByCode(seed.code);
    out.push(
      existing ? await repos.poClauses.update(existing.id, seed) : await repos.poClauses.create(seed),
    );
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Document numbering                                                  */
/* ------------------------------------------------------------------ */

export const documentSeriesInput = z.object({
  prefix: z
    .string()
    .min(1, "a prefix is required")
    .regex(/^[A-Za-z0-9-]+$/, "use letters, digits and hyphens only"),
  serial_width: z.number().int().min(1).max(8),
  start_serial: z.number().int().min(1),
  include_project_code: z.boolean(),
  include_financial_year: z.boolean(),
  separator: z.string().min(1).max(1),
});
export type DocumentSeriesInput = z.input<typeof documentSeriesInput>;

/**
 * Changes a series. Only how *future* numbers are built: documents already
 * issued keep the number they were issued under, which is the whole point of a
 * document number. `start_serial` is what the next document takes when none has
 * been issued yet for the kind, project and financial year.
 */
export async function updateDocumentSeries(
  id: string,
  input: DocumentSeriesInput,
  actor: ActingUser,
): Promise<DocumentSeries> {
  assertCan(actor, "edit", "document_numbering");
  const data = parseInput(documentSeriesInput, input);
  const repos = getRepositories();
  required(await repos.documentSeries.getById(id), "Document series");
  return repos.documentSeries.update(id, data);
}

/**
 * Makes sure every document kind has a settings row.
 *
 * The seed lays them all down, but a kind added later would otherwise have none
 * and `nextDocumentNumber` would quietly fall back to its built-in default.
 */
export async function ensureDocumentSeries(): Promise<DocumentSeries[]> {
  const repos = getRepositories();
  const existing = await repos.documentSeries.list();
  const have = new Set(existing.map((s) => s.kind));
  const added: DocumentSeries[] = [];
  for (const kind of DOCUMENT_KINDS) {
    if (have.has(kind)) continue;
    added.push(
      await repos.documentSeries.create({
        kind,
        prefix: kind,
        serial_width: 4,
        start_serial: 1,
        include_project_code: true,
        include_financial_year: true,
        separator: "/",
      }),
    );
  }
  return [...existing, ...added];
}
