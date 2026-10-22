# Nine client-feedback changes ahead of the Manas meeting

> Status: **not implemented**. This is a saved plan for future work, written
> after exploring the codebase and reading the client's reference files
> (`~/Desktop/Manas/Steel PO.pdf`, `~/Desktop/Manas/Good Received Note.xlsx`).
> Only the branding logo swap (item 7, partial) has been done from this list —
> see the session that added `public/branding/manas-logo.png`.

## Context

The client reviewed the demo and sent nine concrete change requests, plus two
reference files (now in `~/Desktop/Manas/`): `Steel PO.pdf` (a real Vaswani
purchase order) and `Good Received Note.xlsx` (their GRN template), and a
`manas-logo.png` brand mark. These drive items 3, 4 and 7. The other six items
(GRN-without-PO, material-master collapse, drawings version history, budget
overrun reasons, a 5-year cash-flow preview, and title case) are independent
UX/process gaps found during the review.

Codebase exploration (three parallel Explore passes) found two things worth
flagging before implementation:
- **CLAUDE.md's build-order table is stale**: Drawings (P6) says "pending" but
  `drawings/register` and `drawings/transmittals` are fully built — domain,
  service, pages, dialogs. Item 5 is additive (upload + version history), not
  a from-scratch build.
- **Our PO print template already closely mirrors the Vaswani format** — it
  was built from three of their real orders (per CLAUDE.md). The real gaps are
  the numbering *structure* and a few field-level polish items, not a rebuild.
- **GRN has no print/PDF at all today** — item 4 is a genuine build.
- **`Reports` has no nav entry** — the route `/reports/budget-vs-actual`
  exists but nothing links to it. CLAUDE.md already documents this as a
  pending "Reports (project_head, qs_head, hod)" nav addition, which item 8
  now delivers alongside the cash-flow report.
- **No drag-and-drop upload exists anywhere in the app.** Items 1 and 5 both
  need one — build it once, shared.
- **`recharts` is an installed-but-unused dependency** — item 8 is the first
  real chart in the app; use recharts rather than hand-rolling SVG.
- A `titleCase()` helper and a `documentHeading()` lookup already exist in
  `src/config/labels.ts` — item 9 extends that existing precedent rather than
  inventing a new mechanism.

All nine items require a **single `SCHEMA_VERSION` bump** at the end (GRN
nullable PO/new unplanned fields, a new `drawing_revision` reason field, a new
`BudgetOverrunReason` table).

No logo "dark" variant was supplied — only one PNG. Branding will wrap it in a
light backing chip wherever it sits on a dark surface, flagged to the client as
a known gap pending a dark-mode asset.

---

## Execution order

Implemented in dependency-light batches, each ending in `npm run build` +
`npm test` before moving on, so a failure is caught near its cause:

1. Shared primitives: upload/dropzone component, `toTitleCase()` util, logo asset.
2. GRN thread (items 1, 4) — schema, services, UI, print, seed.
3. PO print/numbering (item 3).
4. Material master collapse (item 2).
5. Drawings version history (item 5).
6. Budget overrun reasons (item 6).
7. Branding rollout (item 7, using the shared logo asset from batch 1).
8. Cash flow report (item 8).
9. Title case sweep + lint script (item 9) — done last since it touches the
   most files across everything built above.
10. Final pass: `npm run build`, `npm test`, `npm run lint`, `npm run
    lint:titlecase`, `npm run audit`, `npm run screenshots`.

---

## 1. GRN — attach during creation, and GRN without a PO

**Schema** (`src/lib/domain/purchase.ts`):
- `grnSchema`: `purchase_order_id` → nullable; add `is_unplanned: boolean`,
  `unplanned_reason: z.string().nullable()`.
- `grnLineSchema`: `purchase_order_id`, `po_line_id`, `boq_line_id` → nullable
  (`indent_line_id` already is). `rate`/`gst_percent`/`material_id` stay as-is
  — an unplanned line still carries its own rate for valuation.

**Services** (`src/lib/services/stores-service.ts`):
- Keep `postGrn` for the PO-linked path, unchanged in behaviour.
- Add `postUnplannedGrn(input, actor)`: `assertCan(actor.role, "create",
  "grn")`, `parseInput` requires `project_id, store_id, supplier_id, lines:
  [{material_id, unit, quantity, rate, gst_percent}], reason (min length),
  received_on`, optional challan/vehicle. Sets `is_unplanned: true`,
  `unplanned_reason`. Posts the stock-ledger receipt directly (no PO/indent
  line touched). Factor the shared "write GRN + lines + stock receipt" body
  into a private helper both functions call, per rule 9 (one exported
  function = one business action).

**Vendor bill three-way match** (`src/lib/services/vendor-bill-service.ts`):
- `createVendorBill`: when a line's `grnLine.po_line_id` is null, skip the PO
  lookup; match on `billed_qty` vs `grnLine.accepted_qty` only (no rate/tax
  check — there is no PO rate to compare against). Add `no_po: boolean` on the
  bill line and a bill-level `has_unplanned_lines: boolean`, both computed at
  creation.

**UI**:
- `src/components/material/receive-material-dialog.tsx`: add a two-way route
  selector at the top — "Against a PO" (default, current flow unchanged) /
  "Without a PO" (supplier picker, `<MaterialPicker>` line(s) with qty/rate,
  mandatory reason textarea, challan/vehicle/received-on as today).
- Build `src/components/common/file-dropzone.tsx`: click-or-drag, multi-file,
  image+PDF, thumbnail previews, removable before submit — reusing
  `readAttachmentFile` (`src/lib/files/read-attachment.ts`) for the
  read/resize logic. Drop it into both GRN create routes; on submit, the
  dialog first calls `postGrn`/`postUnplannedGrn`, then loops `addAttachment`
  for each staged file against the new `grn.id`. (Reused again in item 5.)
- New "Unplanned receipt" badge via `<ToneChip tone="warning">` on the GRN
  list, GRN detail dialog, and the vendor bill where `no_po`/
  `has_unplanned_lines` is true (labelled "No PO").

**Seed** (`src/lib/data/seed/material-thread-seed.ts`): add a
`makeUnplannedGrn` helper alongside `makeGrn`, seed two unplanned receipts so
the chip is visible in the demo.

## 4. GRN print/PDF format (built alongside item 1, since both touch the GRN detail surface)

Build `src/components/material/grn-document.tsx` and `src/lib/files/grn-pdf.ts`
(mirroring `po-document.tsx` / `po-pdf.ts`), fields taken field-for-field from
`Good Received Note.xlsx`:
- Header: To Store, Supplier Name, GRN No. / Date, DC No. / Date (mapped from
  `challan_number`/`received_on`), Indent No. / Date, Invoice No. / Date
  (no data source today — printed as a labelled empty field), PO No. / Date,
  Vehicle No., Test Certificate (labelled empty field — no data source).
- Item table: S.No, Material (Name / Type / Sub-type via
  `useLookups().material(id)` cascade, never a raw map), Unit, Quantity
  columns Ordered / Received / Accepted **and Rejected** (client's sheet only
  had Ordered/Received/Accepted; item 4's own ask adds Rejected, which the
  domain already tracks on `GrnLine.rejected_qty`), Remarks (doubles as
  rejection remarks, matching their sheet's single remarks column).
- Signatures: "Project Engineer" / "Purchase Manager" (their exact labels),
  which read naturally as receiver/verifier.
- An unplanned GRN prints its real header fields and leaves Indent/PO
  No./Date blank, per the same "labelled empty field" rule.
- Add `<PrintButton>` + a PDF download action to `GrnDetailDialog`
  (`src/app/projects/[projectId]/procurement/grn/page.tsx`), matching the PO's
  print/PDF button placement.

## 3. PO print format and numbering

Field audit against `Steel PO.pdf` confirmed the existing `PoDocument` already
carries the header block, Indent Details, supplier block (name/PAN/GST/
contact), delivery address, the Material Details table (SI No/Material/Brand/
UOM/Qty/Rate/CGST/SGST/IGST/Net Amount), Additional Charges, grand total in
words, delivery schedule(s), 19-clause terms, and all four signature labels —
essentially a match already (the template was built from three of their real
orders). Two real gaps:

1. **Numbering structure.** Vaswani's number is
   `Pur/<Company short>/<Project short>/<FY>/<Serial>` (prefix / company code
   / project code / FY / serial) — ours is
   `<Project short>/<Kind>/<FY>/<Serial>`, no company segment, project code
   first not third. Extend `src/lib/services/document-number.ts`'s
   `SeriesShape`/`formatDocumentNumber` to support an ordered field template
   and an optional company-code segment (default `"MD"` for Manas
   Developers, sourced from `ISSUING_COMPANY` in `src/config/po-document.ts`).
   Extend the `DocumentSeries` domain row and the `/masters/numbering` screen
   accordingly — this is the "configurable, per kind" numbering the client
   asked for generally, so GRN/PO/etc. all gain the same template control.
   Existing numbers are untouched (a change only affects the next number
   issued, per CLAUDE.md's own numbering rule).
2. **Field-level polish**: verify at A4 render that no column clips, and fill
   any field Vaswani's form carries that we have no data source for as a
   labelled empty cell rather than dropping it (audit during implementation;
   none identified as missing from the explore pass, but confirm against the
   real PDF rendering, not just the component source).

## 2. Material master — collapsed by default

`src/app/masters/materials/page.tsx`:
- Add a second `collapsedTypes: Set<string>` alongside the existing
  `collapsed` (names) set, with its own chevron per Level-2 (type) row —
  today only Level-1 has a toggle; Level-2 always fully renders once its
  parent opens. Both sets default to "all collapsed" (populated from the
  loaded catalog on first render) so only Level 1 shows on load, and opening a
  name does not cascade-open its types.
- Add "Open All" / "Close All" buttons to the `PageHeader` actions slot
  (beside the existing "+ New"), clearing/filling both sets.
- Persist both sets to `sessionStorage` (wrapped in try/catch, hydrated after
  mount) so the state survives in-session navigation, per the ask.

## 5. Drawings — upload and version history

Drawing register/transmittals, the domain (`src/lib/domain/drawings.ts`), and
`drawing-service.ts` (`createDrawing`, `addDrawingRevision`, roll-ups) already
exist and work. Additive changes:

- `drawingRevisionSchema`: add `reason: z.string()` (required — distinct from
  the existing free-form `remarks`) and `created_by_user_id: z.string()` (for
  "uploader" in the history list).
- Extend `AttachmentEntityType` (`src/lib/services/attachment-service.ts`)
  with `"drawing_revision"`, so a revision's file goes through the existing
  `Attachments`/`addAttachment` machinery rather than a one-off field —
  consistent with how every other document hangs its file.
- `DrawingDialog` ("Add Drawing"): add the shared `file-dropzone` from item 1
  for the R0 file, with name/size/preview before saving.
- Build an "Add Revision" modal (check first whether `AddRevisionDialog` is
  already stubbed near `register-table.tsx` per a code comment found during
  exploration — extend it if so, build it if not): same dropzone, plus
  revision number (auto-next `drawingRevisionCodeSchema`), date, and the new
  `reason` field.
- Drawing detail: version-history list, newest first — revision code, date,
  uploader, reason, its own file (opened via `Attachments` for that revision
  id), latest row marked "Current" against `drawing.current_revision_code`.
- Seed: one drawing with three revisions, each carrying its own placeholder
  attachment (name/type/size, "demo: not stored" per the existing convention).

## 6. Budget overrun — make the loop visible

**Schema**: new `BudgetOverrunReason` entity (`src/lib/domain/masters.ts` or a
new file) — `{id, project_id, boq_line_id, cost_head: "material"|"total",
reason, recorded_by_user_id, created_at, updated_at}`. New repository
(`src/lib/data/repositories/`), local impl via the existing generic CRUD
factory, added to `DemoDatabase`.

**Service** (`src/lib/services/budget-service.ts`):
- `recordOverrunReason(input, actor)`: new atomic service, one row per
  explanation (history preserved — never updated in place, the "current"
  reason for a line+head is its most recent row, same pattern as
  `RaBillRevision`).
- `suggestOverrunCause(row)`: pure function comparing actual rate vs budgeted
  rate and quantity drawn vs BOQ allowance, returning a plain-language
  suggested cause when no reason has been recorded.
- Permission: neither role currently holds an edit grant on `budget_vs_actual`
  (it's `R` everywhere, `—` for site_engineer). Add a narrow new resource
  `budget_overrun_reason` to `permissions.ts` (`RESOURCES`/`RESOURCE_META`/
  `GRANTS`) with `C E` for `project_head` (owns BOQ & Budget) and
  `purchase_officer` (owns rates, the likely source of a rate-increase
  explanation) — this is what lets "Add reason" appear for either.

**UI**: `BudgetDrilldownSheet` — an overrun line with a recorded reason shows
it inline with who/when; one with none shows `suggestOverrunCause()`'s output
plus an "Add reason" action opening a small `FormDialog`.

**Action item**: extend `purchaseItems()` in
`src/lib/services/queries/action-items.ts` to loop the purchase officer's
scoped projects, find overrun lines with no current reason via
`budgetVsActual`/`needsAttention`/`overrunOf`, and push an `ActionItem`
(`id` prefixed `overrun:`, `step_code: null` — not on the client's chart, same
treatment as the gate pass — `team: "project_budget"`, `href` to that
project's Budget vs Actual page).

**Seed**: on the mature project (Manas Sapphire), seed one
`BudgetOverrunReason` row against an existing overrun line (explained) and
leave at least one other overrun line unreasoned (unexplained) — verify the
seed already produces ≥2 overrun lines there; add one if not.

## 7. Manas branding

- Copy `manas-logo.png` into `public/branding/manas-logo.png`.
- Top bar (`src/components/shell/top-nav.tsx`): replace the "M" glyph span
  with the logo image at 28px height, aspect preserved, wrapped in a small
  light rounded backing for dark-mode contrast (no dark variant supplied —
  flagged as a known gap).
- Favicon/app icon: add `src/app/icon.png` from the same asset (Next.js app
  router auto-serves it).
- No login screen exists (session is mocked, confirmed in exploration) — skip,
  note to the client.
- Print templates: extract a small shared `<CompanyLetterhead>` piece (logo +
  `ISSUING_COMPANY` block) used by `document-chrome.tsx` (covers Drawings and
  Stores documents), `po-document.tsx`, the new `grn-document.tsx`, and
  `ra-bill-sheet.tsx` (currently a bespoke hard-coded header — switch it to
  the shared component). The two ledger statement pages
  (`src/app/ledgers/suppliers`, `/contractors`) currently have **no** company
  header at all — add one using the same shared piece.

## 8. Five-year cash flow (Reports, demo preview)

- Add a `REPORTS` `TopNavItem` (currently missing entirely — confirmed via
  exploration) enabled only for `project_head`, `qs_head`, `hod`, per
  CLAUDE.md's own documented intent, with two children: the existing Budget
  vs Actual report and the new `/reports/cash-flow`.
- New pure module `src/lib/services/queries/cash-flow-math.ts`:
  - Outflow: for each `BoqLine`, find `ProgrammeTask`s referencing it
    (`programme.ts`'s `boq_line_id`), spread the line's budget amount across
    the calendar months its tasks span, weighted by days-in-month overlap.
    BOQ lines with no matching task fall back to spreading evenly across the
    full project programme span, so nothing silently drops out of the
    forecast.
  - Inflow: driven by an on-screen assumptions panel — sales value, a list of
    collection milestones (label + % of sales value), and a collection lag in
    days. Milestones trigger at their percentage of the programme's elapsed
    duration, shifted by the lag — documented plainly on the page as the
    simplification it is.
  - 60 monthly buckets starting at `today()`'s month (rule 13 — no ad hoc
    dates), clipped to that window; rendered monthly for year 1, quarterly for
    years 2–5.
- Wired through `queries/index.ts`'s `guarded()`/`redactMoney` wrapper per
  rule 14/16, even though the only roles who ever reach the page already see
  rates.
- UI: assumptions panel (editable, recomputes live, not persisted to the
  domain — this is a preview, explicitly not wired into billing), a recharts
  `ComposedChart` (inflow/outflow/net, using `chart-1..3` tokens — the first
  real chart in the app, using the already-installed-but-unused `recharts`
  dependency), and a table (opening balance / inflow / outflow / closing
  balance) with any negative-closing-balance row in `destructive` tone.
  Labelled clearly as a projection from the current schedule and budget.

## 9. Title case

- `toTitleCase()` in `src/lib/title-case.ts`, extending the existing
  `titleCase()`/`documentHeading()` precedent in `src/config/labels.ts`:
  minor-words list (a, an, the, and, or, but, of, to, in, on, at, for, vs)
  lowercase unless first word; acronyms (PO, GRN, BOQ, DPR, RA, QS, HoD, TDS,
  GST) forced to canonical casing regardless of position.
- Apply it at a small number of **static-string** render points only, never as
  a blanket wrapper (dialog/record titles frequently interpolate a document
  number or contractor name, which must never be re-cased):
  - Nav labels: `WORKSPACE_TABS` (`nav-config.ts`) and the new `TOP_NAV`
    entries, at their single render point.
  - `RESOURCE_META[...].label`, feeding `PageHeader`/`ResourcePage` titles —
    compose with the existing `documentHeading()` lookup.
  - `DataTable` column `header` strings, wrapped once inside `DataTable`'s own
    header-cell render.
  - Static (non-interpolated) `title` props on `AppDialog`/`FormDialog`/
    `ConfirmDialog`/`RecordDialog` — fixed at their literal call sites, found
    and verified by the lint script below, not via a runtime wrapper (too
    risky given how many titles interpolate a record number).
  - **Explicitly excluded**: `STEP_LABELS` (chart step codes must print
    verbatim per CLAUDE.md), team names, any heading built from interpolated
    entity/record data, and all body text/buttons/toasts (sentence case
    stays).
- `scripts/lint-titlecase.ts` (new): a static source scan (not a Playwright
  DOM crawl — the existing `audit-density.ts`/`screenshots.ts` pattern is
  DOM-based, but source-text scanning is the right tool for *this* rule) for
  nav labels, `RESOURCE_META` labels, `header: "..."` literals in `DataTable`
  column arrays, and static `title="..."`/`title: "..."` literals on the
  dialog primitives — flags any literal that doesn't already satisfy the rule,
  skipping template-literal/expression titles. Add `"lint:titlecase": "tsx
  scripts/lint-titlecase.ts"` to `package.json`, and call it from
  `npm run audit`.

---

## Verification

- `npm run build` — no type errors, no lint warnings — after each batch above
  and once more at the end.
- `npm test` — existing suites must keep passing; extend
  `material-thread.test.ts` for the unplanned-GRN path and three-way-match
  "no PO" exclusion, add coverage for `recordOverrunReason`/
  `suggestOverrunCause`, and a `seed.test.ts` check that the two unplanned
  GRNs and the drawing's three revisions are schema-valid and internally
  consistent.
- `npm run lint` and the new `npm run lint:titlecase`.
- `npm run audit` (390px Playwright pass — must stay clean, including the
  existing "no ₹ under /stores/" check, now also covering the new unplanned
  GRN screens).
- `npm run screenshots` at the end, for the stop-and-report.
- Manual check at A4 print preview for the new/changed PO and GRN documents,
  since column clipping can't be caught by the automated audit.

## Stop-and-report (per the client's original ask)

1. PO and GRN templates: fields matched field-for-field, and any field we
   printed as a labelled empty cell for lack of data.
2. Unplanned GRN behaviour and exactly how it's excluded from three-way match.
3. Drawings version history, naming the seeded three-revision example.
4. Cash flow assumptions used and how the outflow spread is derived.
5. Title case violations found and fixed.
6. `npm run build`, tests, and the audit passing; new screenshots.
