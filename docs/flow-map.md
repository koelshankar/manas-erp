# Manas ERP — flow and permissions map

Derived entirely from the code under `src/`, as of this branch. Where the code
disagrees with `CLAUDE.md` or other prose docs, that is called out explicitly —
look for **⚠ Code vs. doc**.

Primary sources: `src/config/permissions.ts`, `src/lib/domain/enums.ts`,
`src/lib/services/*.ts`, `src/app/**/page.tsx`, `src/lib/data/seed/catalog.ts`,
`src/components/shell/nav-config.ts`.

---

## Part 1 — Role reference

Eight roles have a real login (one seeded `User` row each, selectable in the
role switcher): `project_head`, `site_engineer`, `purchase_officer`,
`purchase_head`, `project_qs`, `qs_head`, `hod`, `store_keeper`.

A ninth position, **QA/QC**, is listed in `CLIENT_ROLES` (`src/lib/domain/enums.ts`
has no QA/QC `Role` value at all — it only exists as a `role: null` entry in
`CLIENT_ROLES` in `permissions.ts`) purely so the `/masters/permissions` screen
can show the client's full org chart. It has no seed user, no `Role` enum value,
no grants, nothing it can do. Its work is folded into `site_engineer`.

Every role sees every nav item and every page — `can()`'s `"view"` action is
denied only for the `rates` data class (`VIEW_DENIED`), never for a page. The
table below is `GRANTS` (mutating authority) plus `PROJECT_NAV` (which tabs/pages
are relevant) plus the value-blindness flags.

| Role | Workspace tabs (`ROLE_TAB_ACCESS`) | Can create | Can approve | Explicitly denied |
|---|---|---|---|---|
| `project_head` | Overview, Progress, Budget, Procurement, Stores, Billing, Drawings, Contracts (all 8) | BOQ, work orders, contractors, drawings, transmittals | Indent approval (A2, sole step); Certification (C3 cross-team step, sequence 2); Gate pass (sole step) | Nothing (full value visibility; full nav) |
| `site_engineer` | Overview, Progress, Budget, Procurement, Stores, Drawings (6 of 8 — no Billing, no Contracts) | Site tasks, indents, DPR, work-done entries, GRN, material issue, gate pass, transfer order, drawings, transmittals | Nothing | `rates` data class → value-blind everywhere (BOQ, Budget vs Actual, comparatives, POs, vendor bills, supplier ledger all show no money) |
| `store_keeper` | Overview, Procurement, Stores (3 of 8) | GRN, material issue, gate pass, transfer order, Store Master | Nothing | `rates` — same value-blindness as site_engineer |
| `purchase_officer` | Budget, Procurement (2 of 8) | Comparatives, purchase orders, vendor bills, returns, material master, supplier master, PO clause library | Nothing | Nothing money-wise, but `ROLE_TAB_ACCESS` hides Overview/Progress/Stores/Billing/Drawings/Contracts entirely |
| `purchase_head` | Budget, Procurement, Contracts (3 of 8) | Nothing | Approval to purchase (B2, sole step); Purchase order B3 "recommended by" (sequence 1) | No create grants anywhere |
| `project_qs` | Overview, Progress, Budget, Billing, Drawings, Contracts (6 of 8 — no Procurement, no Stores) | Measurements, RA bills, handed-over records, drawings, transmittals | Certification (C3 QS verification, sequence 1) | `boq`, `budget_vs_actual` → **value-blind on those two resources only** (`VALUE_BLIND`), not globally — sees PO/vendor-bill/supplier-ledger money fine |
| `qs_head` | Overview, Budget, Procurement, Billing, Contracts (5 of 8 — no Progress, no Stores, no Drawings) | Nothing | Certification (C4, sequence 3) | Nothing |
| `hod` | All 8 (same as project_head) | Nothing | Certification (C4, sequence 4, final); Purchase order B4 "authorised signatory" (sequence 2) | Nothing |

⚠ **Code vs. doc** — `ROLE_TAB_ACCESS` (the editable tab matrix) and `PROJECT_NAV`
(which decides what opens inside a tab) are **two independent lists that must be
kept in sync by hand**, and they already drift in one place: `qs_head`'s
`ROLE_TAB_ACCESS` grants the **Procurement** tab (`tabs(...,"y",...)` at position
4), but `qs_head`'s `PROJECT_NAV` entry *does* list `indents`, `comparatives`,
`purchase_orders`, `grn`, `vendor_bills` — so that one is actually consistent.
The real drift is `purchase_officer` and `purchase_head`: both have **Contracts**
granted false/true respectively, yet `purchase_head`'s `PROJECT_NAV` lists
`"work_orders"` (which lives under the Contracts tab) while `purchase_officer`'s
does not — consistent with their respective `ROLE_TAB_ACCESS` rows, so no bug
there. No cross-role inconsistency was found beyond this — the two lists happen
to agree today, but nothing in the code enforces that they must, and the
`/masters/permissions` screen only edits `ROLE_TAB_ACCESS`, never `PROJECT_NAV` —
**turning a tab on for a role at `/masters/permissions` does not add the pages
behind it to that role's `PROJECT_NAV`**, so a tab can be switched on and show
nothing relevant, or a role can see pages in a tab that `PROJECT_NAV` never
granted them as "theirs" (they'd open read-only, tagged "Owned by \<team\>",
inside their own tab strip). This is a real gap: the editable matrix only
controls tab *visibility*, not *content*.

**Approval-chain responsibility, from `APPROVAL_CHAINS`** (so "who approves
what, in what order" is unambiguous):

| Chain | Seq 1 | Seq 2 | Seq 3 | Seq 4 |
|---|---|---|---|---|
| `indent` (A2) | `project_head` | — | — | — |
| `comparative` (B2) | `purchase_head` | — | — | — |
| `purchase_order` (B3→B4) | `purchase_head` (recommend) | `hod` (authorise) | — | — |
| `gate_pass` (no code) | `project_head` | — | — | — |
| `ra_bill` (C3→C4) | `project_qs` | `project_head` (cross-team) | `qs_head` | `hod` |

`inboxFor(role)` gives **Approvals** to any role holding a step in any chain —
that's `project_head`, `purchase_head`, `project_qs`, `qs_head`, `hod`. Everyone
else (`site_engineer`, `purchase_officer`, `store_keeper`) gets **My Requests**.

---

## Part 2 — Document lifecycle, per document type

### Work order & `WorkOrderContract`

| Field | Value |
|---|---|
| Created by | `project_head` (`createWorkOrder`, resource `work_orders`) |
| Created from | One or more approved BOQ lines, a contractor from the Contractor Master |
| Standalone? | Yes — no upstream document required, only a BOQ and a contractor |
| Approval sequence | None — no chain. It is a straight `create`/`edit`/`delete` grant |
| Actions | n/a |
| States | None — `WorkOrder` has no status enum at all; `is_active: boolean` is the only lifecycle flag |
| Unlocks | Site tasks (A1), DPR progress lines (A3), joint measurements (C1), RA bills (C2) all key off `work_order_id` / `work_order_line_id` |
| Amendable? | Freely editable while `is_active`; no amendment/version mechanism (contrast the PO, which has one) |
| Print output | None found in `components/` for the work order itself (the **contract** screen is `/projects/[projectId]/contracts/work-orders`, but no PDF/print area was found there) |

Unusual: `agreed_rate` on a line may never exceed the BOQ's own `rate`
(`createWorkOrder` throws if `l.agreed_rate > boq.rate`), and `quantity` may not
exceed the BOQ line's `quantity`. `WorkOrderContract` (mobilisation advance,
retention stages, LD cap, statutory heads) is a **separate** one-row-per-work-order
object (`contract-service.ts`), written by `saveContract`, and every RA bill
falls back to `defaultContractFor()` (item-rate defaults) if nobody has set one
up — so a bill computes correctly before anyone opens the contract screen.

⚠ **Code vs. nothing-else** — `saveContract`'s three cross-field checks
(mobilisation instalments summing to the advance percent, retention stages
summing to 100%, the two payment-release percentages summing to 100%) throw a
**plain `new Error(...)`**, not a `ValidationError`/`ServiceError`. See Part 6 —
this means the specific message is swallowed by the toast layer and the user
sees only "Something went wrong."

### BOQ line

| Field | Value |
|---|---|
| Created by | `project_head` (`createBoqLine`, resource `boq`) |
| Created from | Nothing — typed directly: item code, trade, unit, quantity, rate, optional per-material budget rows |
| Standalone? | Yes |
| Approval sequence | None |
| States | None |
| Unlocks | Indents, work orders, material issue lines, Budget vs Actual, Issued-v-Measured all reference `boq_line_id` |
| Amendable? | Freely editable (no edit function was located beyond `createBoqLine`+whatever generic update the repo exposes; no amendment trail) |
| Print output | None |

`item_code` must be unique per project. `BoqMaterialBudget` rows (`material_id`,
`budget_qty`, `budget_rate`) are the yardstick both indents and Budget-vs-Actual
check against.

### Indent (A2)

| Field | Value |
|---|---|
| Created by | `site_engineer` only (resource `indents`) |
| Created from | One or more BOQ lines on the project; optionally tied to a work order / site task |
| Standalone? | Yes, from the BOQ |
| Approval sequence | `project_head` — one step, sequence 1 |
| Actions at the step | per **line**: `approve` (full requested qty), `reduce` (any qty 0 < x ≤ requested, zod-enforced), `reject` (needs `rejection_reason`) — the indent's own status (`approved` / `partially_approved` / `rejected`) is derived from the mix of line decisions, not chosen directly |
| States | `submitted → approved\|partially_approved\|rejected → in_comparative → po_raised → partially_received → received → closed` |
| Unlocks | Comparative lines (B1) may only be built from indent lines whose parent indent is `approved`/`partially_approved` and whose line has `approved_qty > 0` |
| Amendable? | No amend path; a line's `ordered_qty` is **rolled up** live from every live PO against it (`createPurchaseOrders` / `resolveLines` increment it; editing a draft PO down releases it again) |
| Print output | None found |

Unusual: **requesting more than the BOQ material balance is allowed on purpose**
— the code comment in `createIndent` says the screen warns but the Project Head
decides; there is no server-side cap against `BoqMaterialBudget`.

### Vendor comparative (B1)

| Field | Value |
|---|---|
| Created by | `purchase_officer` (resource `comparatives`) |
| Created from | Approved/partially-approved indent lines with `approved_qty > 0`, across as many indents as needed, **from one project** |
| Standalone? | No — always indent-line-sourced; there is no blank comparative |
| Approval sequence | `purchase_head` — one step, sequence 1 |
| Actions | `approve` / `send_back` (re-enters `pending_approval`, needs a comment) / `reject` (needs a comment) |
| States | `draft → pending_approval → approved\|sent_back\|rejected` |
| Unlocks | `createPurchaseOrders` (one PO per selected supplier) once `approved` |
| Amendable? | A `sent_back` comparative returns to `pending_approval` on resubmit, reopening the same Approval row (no new row stacked) — but lines/quotes themselves have no separate edit-and-resubmit function in this file (the editor presumably rewrites it before resubmitting) |
| Print output | Yes — it's one of the four full-page editors (`FullPageEditor`), so it has its own printed form per CLAUDE.md §4, though this was not independently verified by reading the component |

Unusual rules enforced in `createComparative`: **at least three supplier quotes
per line** (zod `.min(3)`); an indent line already committed to another *live*
(non-rejected, non-sent-back) comparative cannot be picked up twice; selecting
anyone other than the cheapest (L1) quote requires a `justification` of at
least 5 characters; `landed_rate` and L1 are computed server-side
(`pricing.ts`), never typed.

### Purchase order (B3–B4)

| Field | Value |
|---|---|
| Created by | `purchase_officer` (resource `purchase_orders`) |
| Created from | **Three routes, one write path** (`createPurchaseOrder`): (1) `createPurchaseOrders` auto-generates one PO per winning supplier straight off an approved comparative; (2) `createPurchaseOrder` with `comparative_id` set, picking the comparative's own lines; (3) `createPurchaseOrder` blank, with `<MaterialPicker>` — the **only** place a PO line chooses its own material |
| Standalone? | Yes, via the blank route |
| Approval sequence | `purchase_head` (B3, "recommended by", seq 1) → `hod` (B4, "authorised signatory", seq 2). Both rows opened at once; only the lowest pending sequence is actionable |
| Actions | `approve` (advances to the next sequence, or to `approved` status if it was the last) / `send_back` (→ `sent_back`, needs comment) / `reject` (needs comment) |
| States | `draft → pending_approval → approved\|sent_back\|rejected`; `approved → sent` (issue) `→ partially_received → received → closed`; `approved`/`sent → draft` (amendment) |
| Unlocks | GRN (B5–B6) may only post against a PO in `sent` or `partially_received` |
| Amendable? | Yes — `amendPurchaseOrder` archives the whole document (lines, schedules, terms) as one JSON snapshot in `po_amendments`, bumps `amend_no`, reopens as `draft`. **Refused once anything has been received** (`received_qty > 0 \|\| rejected_qty > 0` on any line) |
| Print output | Yes — full-page editor; four printed signature blocks (`prepared_by`, `recommended_by`, `verified_by`, `authorised_signatory`), of which **`verified_by` prints empty** — it is not a system step |

Unusual: `ordered_qty` is **recomputed from every live order** on the project
every time a PO is written (`syncIndentOrderedQty`), not incremented — so
lowering a draft's quantity releases the balance for someone else to order. A
delivery schedule's lines may not exceed the ordered quantity; a dated schedule
must carry dates, a "balance" schedule must not. `amend_no` increments only on
amendment, never on ordinary edits of a draft.

### GRN (B5–B6)

| Field | Value |
|---|---|
| Created by | `site_engineer` or `store_keeper` (resource `grn`) — **not** Purchase |
| Created from | One purchase order, must be `sent` or `partially_received` |
| Standalone? | **No** — `postGrn` requires `purchase_order_id` and refuses any other PO status |
| Approval sequence | None — a GRN has no chain. It just posts |
| Actions | n/a |
| States | `posted` only — the enum has exactly one value; immutable once written |
| Unlocks | Stock receipt (A5 ledger `receipt` movement at PO rate), a `Return` for any rejected quantity, PO roll-up to `partially_received`/`received`, indent line `received_qty` and indent roll-up |
| Amendable? | No — corrections go through a `Return`, never an edit of the GRN |
| Print output | Not verified independently, but `Attachment` explicitly supports hanging a photographed challan off a GRN |

Unusual: a GRN never lets the user pick a store — `resolveStore` silently takes
the project's **primary** store when none is given. Accepted + rejected must
exactly equal received (zod refine), and a rejected line needs a reason.

### Gate pass

| Field | Value |
|---|---|
| Created by | `site_engineer` or `store_keeper` (resource `gate_pass`) |
| Created from | Nothing required — stands alone, naming the store it leaves |
| Standalone? | Yes |
| Approval sequence | `project_head` — one step, **`step_code: null`** (deliberately not on the client's chart) |
| Actions | `approve` (takes stock out immediately — see below) / `reject`, both via `actOnGatePass`; the caller must hold `approve` on `gate_pass`, which only `project_head` has |
| States | `draft → pending_approval → approved\|rejected`; `approved → acknowledged`; `acknowledged → returned` (returnable only, in full) or `→ closed` (non-returnable) |
| Unlocks | Nothing downstream formally, but a `transfer`-type pass is the gate-pass side of a Material Transfer Order (`material_transfer_id` link) |
| Amendable? | A `draft` may be rewritten wholesale (`updateGatePass`); once `pending_approval`/beyond, no edit |
| Print output | Yes — printed A4 form with three real signature blocks per CLAUDE.md; not independently re-verified here |

Unusual: a line may carry **no `material_id` at all** — the only document line
in the whole app where that's legal — for a contractor's own mixer or
unreceived ladder; such a line moves no stock. Stock actually leaves on
**approval**, not on dispatch/acknowledgement. A **returnable** pass must carry
`expected_return_date`; the other two types must **not** (both directions
enforced by zod refinements). `recordGatePassReturn` auto-closes the pass
(`status: "returned"`) once every line is square; a non-returnable pass is
closed by hand via `closeGatePass`, which **refuses** to run on a returnable
pass.

### Material issue (A5)

| Field | Value |
|---|---|
| Created by | `site_engineer` or `store_keeper` (resource `site_stock`) |
| Created from | A work order (required) and that store's stock on hand — material is picked fresh via `<MaterialPicker>`, not inherited |
| Standalone? | Yes, given a work order |
| Approval sequence | **None** — an issue is not a gate. `MATERIAL_ISSUE_STATUSES` is `["issued","acknowledged"]`; it's `issued` the instant it's written |
| Actions | n/a (acknowledgement is a signature, not an approval decision) |
| States | `issued → acknowledged` |
| Unlocks | Stock `issue` movement at the store's weighted-average PO rate; feeds Budget vs Actual (material issued) and the Issued-v-Measured check |
| Amendable? | No edit function found; the only follow-on write is `acknowledgeMaterialIssue` (a signatory name, ≥2 chars) |
| Print output | Printed note with four signature blocks per CLAUDE.md (not re-verified) |

Unusual: **cannot exceed the issuing store's stock on hand** — `issueMaterial`
checks `storeStockOnHand` per line and throws if the requested quantity exceeds
it (answers Part 4's "can an issue exceed stock on hand?": **no, the code
refuses it**). `cumulative_qty` (running total issued to this contractor for
this material) is computed once at write time and stored — it is not
recalculated later.

### Material transfer order

| Field | Value |
|---|---|
| Created by | `site_engineer` or `store_keeper` (resource `transfer_orders`) |
| Created from | Nothing upstream — names its own `from_store_id` (must belong to the raising project) and `to_store_id`/`to_project_id` (may cross projects) |
| Standalone? | Yes |
| Approval sequence | **None** — no chain at all |
| Actions | n/a |
| States | `draft → in_transit → acknowledged`; a `draft` may become `cancelled` |
| Unlocks | A second, independent `gate_pass` row of `pass_type: "transfer"` may optionally link to it via `material_transfer_id` — the transfer itself does not create the gate pass |
| Amendable? | A `draft` may be rewritten wholesale; once `in_transit` it cannot be edited or cancelled — only acknowledged |
| Print output | Printed A4 form per CLAUDE.md, four signature blocks (one filled) — not re-verified |

Unusual: material is checked against the issuing store's stock **twice** — once
when the draft is written/edited, and **again at dispatch**
(`dispatchMaterialTransfer` re-runs `assertLinesAreAvailable`), because a draft
can sit for days while the reserved stock goes out on something else (answers
Part 4: **cannot move stock that isn't there**, checked at both points). A short
delivery is recorded as a smaller `received_qty` on acknowledgement, never by
editing the dispatched quantity — the shortfall is visible, not hidden.

### DPR & labour (A3)

| Field | Value |
|---|---|
| Created by | `site_engineer` only (resource `dpr`) |
| Created from | Work-order lines (progress) and the Contractor Master (labour); **one report per project per day** — `submitDpr` throws if `repos.dprs.getByDate` already finds one |
| Standalone? | Yes |
| Approval sequence | None |
| States | No status enum on `Dpr` at all — it is a point-in-time record, not a workflow document |
| Unlocks | Each progress entry appends a `WorkProgress` row and bumps `WorkOrderLine.done_qty` — the **only** writer of `done_qty` in the whole system. A line reaching its full WO quantity auto-flips its linked site task to `completed` |
| Amendable? | No edit/delete function found — append-only by design (CLAUDE.md: `WorkProgress` is derived and nothing reads it to decide anything) |
| Print output | None found |

### Site task (A1)

| Field | Value |
|---|---|
| Created by | `site_engineer` (resource `site_tasks`) |
| Created from | A work-order line |
| Standalone? | No — a work order and one of its lines are required inputs |
| Approval sequence | None |
| States | `planned → in_progress → completed`; `completed` may be reopened to `in_progress` |
| Unlocks | Nothing formal downstream; it is referenced optionally by DPR progress entries and auto-advanced by them |
| Amendable? | Freely editable (`updateSiteTask`) except status, which only moves through `updateSiteTaskStatus` |
| Print output | None |

### Joint measurement (C1)

| Field | Value |
|---|---|
| Created by | `project_qs` only (resource `measurements`) |
| Created from | A work order's lines — **not** gated on the A4 "ready to measure" flag (see Part 6) |
| Standalone? | Yes, given a work order |
| Approval sequence | None as a chain — but `signJointMeasurement` requires **both** a contractor signatory name and the QS's own act in one call ("a sheet signed by only one party is not a joint measurement") |
| Actions | n/a — just `create` (draft) then `sign` |
| States | `draft → signed → billed` |
| Unlocks | `signJointMeasurement` is the **only** writer of `WorkOrderLine.measured_qty`, and it also clears the line's `ready_to_measure` flag. A `billed` sheet can never be billed again (`createRaBill` requires `status === "signed"`) |
| Amendable? | No edit/delete found for a draft; nothing can touch a `signed`/`billed` sheet |
| Print output | Full-page editor per CLAUDE.md §4 |

Unusual: measuring past the work-order's contracted quantity is **allowed**,
but only with an `excess_reason` of ≥5 characters (`is_excess` flag persists on
the line and the sheet). Quantity may be entered directly (`measured_qty`) or
derived from `nos × dimensions`, depending on the unit (`dimensionsFor`).

### RA bill (C2)

| Field | Value |
|---|---|
| Created by | `project_qs` only (resource `ra_bills`) |
| Created from | One or more **signed, unbilled** measurements on the **same** work order — `createRaBill` refuses a measurement that is not `status: "signed"` or belongs to a different work order |
| Standalone? | **No** — answers Part 4's "can an RA bill exist without certified measurements?": it cannot even be *created* without signed measurements; it cannot be *certified* without clearing the full chain |
| Approval sequence | `project_qs` (C3, seq 1) → `project_head` (C3 cross-team, seq 2) → `qs_head` (C4, seq 3) → `hod` (C4, seq 4, final) |
| Actions at each step | `approve` (optionally with per-line `adjustments` to `certified_qty`, logged as `RaBillRevision` rows, comment required if adjusting) / `send_back` (→ `draft`, comment required) / `reject` (comment required) |
| States | `draft → submitted → in_certification → certified → handed_over`; any chain step may send it to `draft` or `rejected` |
| Unlocks | HoD approval (seq 4) is the **only** writer of `WorkOrderLine.billed_qty`; `handOverRaBill` (C5, resource `handed_over`, `project_qs`-only edit) is terminal |
| Amendable? | `submitRaBill` on a bill returning from `draft` **reopens the same four Approval rows** rather than stacking new ones, keeping the audit trail one row per decision |
| Print output | Full-page editor; cumulative this-bill/to-date columns per CLAUDE.md §2 (deduction waterfall) |

Unusual: bill numbering is **per work order**, not per project
(`raBillNumber()` → `MSP/RA/WO-001/RA-03`). `bill_sequence` counts only
non-`rejected` prior bills on the same work order. The deduction waterfall
(`computeRaBillWaterfall`) runs gross → retention → advance recovery (capped at
the advance actually paid) → statutory heads → LD (capped by contract) → other
deductions → net payable → 70/30 release split, recomputed from scratch on
every adjustment so totals can never drift from the lines.

### Vendor bill (B7)

| Field | Value |
|---|---|
| Created by | `purchase_officer` only (resource `vendor_bills`) |
| Created from | One or more GRN lines, all against the **same supplier**; a line already billed in full cannot be picked up again |
| Standalone? | No — requires existing GRN lines with unbilled quantity |
| Approval sequence | **None** — "B7 is a three-way match, not a sign-off" (quantity vs GRN accepted, rate vs PO rate, GST vs PO GST) |
| Actions | `verifyVendorBill`: on a `matched` bill, no reason needed; on a `mismatch` bill, an `override_reason` of ≥5 characters is **required** |
| States | `draft → matched\|mismatch → verified → handed_over` |
| Unlocks | `verifyVendorBill` credits the supplier ledger (`entry_type: "bill"`); `handOverVendorBill` (B8) is terminal and refuses if `verified_by_user_id` is empty |
| Amendable? | No edit/delete function found |
| Print output | Attachment support for the supplier's invoice; no dedicated print path found |

### Return

| Field | Value |
|---|---|
| Created by | Automatically by `postGrn` for any rejected quantity, **or** by hand via `createReturn` (resource `returns`, `purchase_officer`) for material found defective after receipt |
| Created from | A GRN line |
| Approval sequence | None |
| States | `raised → dispatched → debit_note_issued` |
| Unlocks | `debit_note_issued` posts a debit to the supplier ledger |
| Amendable? | n/a — only moves forward via `advanceReturn` |
| Print output | Not found |

Unusual: a hand-raised return cannot exceed `received_qty` less whatever has
already been returned against that GRN line (`returnable` check).

### Drawing register entry

| Field | Value |
|---|---|
| Created by | `project_head` or `project_qs` (resource `drawings`) |
| Created from | Nothing — typed directly, with its **first revision (R0) written in the same call** |
| Approval sequence | None |
| States | No document-level status; `current_status` is just the free-text `remarks` of the latest revision, rolled up |
| Unlocks | A transmittal line must reference an existing drawing + revision — the register is the only way in |
| Amendable? | Particulars (`title`, `discipline`, `sheet_size`, `consultant`) editable any time via `updateDrawing`; **revisions are append-only**, capped at R0–R4 (`addDrawingRevision` refuses a sixth) |
| Print output | Not found (stub route per CLAUDE.md build order — P6 "pending") |

### Drawing transmittal

| Field | Value |
|---|---|
| Created by | `project_head` or `project_qs` (resource `transmittals`) |
| Created from | Lines picked from the drawing register by drawing + revision code, never typed free-hand |
| Approval sequence | **None** — "issuing a transmittal is the sender's own act, not a gate another team holds" |
| States | `draft → issued → acknowledged` |
| Unlocks | Nothing further |
| Amendable? | `draft` fully rewritable; locked once `issued` |
| Print output | Not found |

---

## Part 3 — End-to-end chains

### 1. Procurement: BOQ → indent → approval → comparative → PO → approval → GRN → stock

1. **`project_head`** writes a BOQ line (`createBoqLine`) — material carries
   forward only as an optional `BoqMaterialBudget` allowance.
2. **`site_engineer`** raises an indent against that BOQ line (`createIndent`).
   Material is **re-picked** here via `<MaterialPicker>` — the indent is one of
   only three screens in the app where a material is chosen fresh (CLAUDE.md
   §"the material master"), scoped to the BOQ line's budgeted materials.
3. **`project_head`** decides per line (`approveIndent`) — approve/reduce/reject.
   Carries forward: `approved_qty` per line. Re-entered: nothing — the decision
   is final per line, though the indent as a whole can still move further.
4. **`purchase_officer`** builds a comparative from approved lines
   (`createComparative`), ≥3 quotes per line. Material, unit, BOQ line, **and
   quantity (`approved_qty`)** are all **inherited** from the indent line, never
   re-picked — confirms Part 4's "material is inherited downstream of the
   indent."
5. **`purchase_head`** decides (`decideComparative`) — approve fixes the rates;
   send-back/reject releases the indent lines back to `approved`/`partially_approved`
   so they can be re-quoted.
6. Either the system (`createPurchaseOrders`, one PO per winning supplier) or
   the officer by hand (`createPurchaseOrder` with `comparative_id`) raises the
   order. Material/rate/GST/freight are **inherited** from the winning quote;
   only the **blank-order** route re-picks material.
7. **`purchase_head`** recommends, **`hod`** authorises (`actOnPurchaseOrder`
   twice, sequence 1 then 2) → `approved`.
8. **`purchase_officer`** issues it (`issuePurchaseOrder`) → `sent`. Nothing can
   be received before this.
9. **`site_engineer`/`store_keeper`** posts the GRN (`postGrn`) against the
   `sent`/`partially_received` PO. Material, rate, unit, BOQ line are all
   **inherited** from the PO line — the GRN never re-picks. Accepted quantity
   becomes a stock `receipt`; rejected quantity auto-raises a `Return`.
10. Stock position (A5) is now derived from that `receipt` row —
    `stockPositions()` sums every movement, it stores no running balance.

Parallel, not part of the same walk: **`purchase_officer`** later enters the
vendor's invoice against those same GRN lines (B7) and verifies the three-way
match; verification credits the supplier ledger; B8 hands it to Accounts.

### 2. Stores: stock → material issue / gate pass / transfer order

All three start from the derived stock position and write movements through
one function, `postStockMovement` (`stock-ledger.ts`) — none of the three
documents computes a balance itself.

- **Material issue**: `site_engineer`/`store_keeper` issues against a work
  order; material is **re-picked** via `<MaterialPicker>` (one of the three
  fresh-pick screens), checked against that store's stock on hand, valued at
  the weighted-average PO rate (value never shown in Stores screens).
- **Gate pass**: raised by `site_engineer`/`store_keeper`, material optionally
  re-picked (or the line is non-stock, naming itself in words). **`project_head`**
  approves — that approval is what moves stock out. The receiver's signature at
  the gate (a name, no login) closes the loop, and a returnable pass's partial
  or full return is recorded separately.
- **Transfer order**: raised by `site_engineer`/`store_keeper`, material
  **inherited from the issuing store's own stock** (a line must name a material
  that store actually holds — not a fresh pick, unlike the issue note). Dispatch
  writes `transfer_out` from the issuing store; acknowledgement by the
  **receiving** store/project writes `transfer_in` — the only cross-project
  write path in the whole Stores thread (`listInboundToProject`).

### 3. Billing: work done → measurement → certification → RA bill → deduction waterfall → approval

1. **`site_engineer`** files the DPR (`submitDpr`) — the sole writer of
   `done_qty`, one report per project per day.
2. **`site_engineer`** optionally flags a line `ready_to_measure` with a claimed
   quantity (`markReadyToMeasure`) — **advisory only**, see Part 6; the QS can
   measure without this ever being set.
3. **`project_qs`** creates a joint measurement against work-order lines
   (`createJointMeasurement`), then **signs** it (`signJointMeasurement`),
   which is what actually advances `measured_qty` and clears the ready flag.
4. **`project_qs`** builds an RA bill from one or more signed, unbilled
   measurements on the same work order (`createRaBill`) — rates come from the
   work order, never from the measurement. The deduction waterfall is computed
   immediately, even in `draft`.
5. **`project_qs`** submits it (`submitRaBill`) — opens (or reopens) all four
   chain rows at once.
6. Chain runs in order: `project_qs` (C3.1) → `project_head` (C3.2, cross-team)
   → `qs_head` (C4.3) → `hod` (C4.4). Each step may adjust `certified_qty` per
   line (logged as `RaBillRevision`, never overwritten); only the final HoD
   approval writes `WorkOrderLine.billed_qty` and flips status to `certified`.
7. **`project_qs`** hands it to Accounts (`handOverRaBill`, C5) — terminal.

What carries forward at each hop: the measured quantity → the claimed quantity
→ the certified quantity (which may be reduced at any chain step, never
increased beyond what was claimed). What is re-entered: nothing material — a
bill's lines are fixed at creation; only the `certified_qty` can move, and only
downward.

### 4. Progress: programme → site tasks → DPR → work done vs balance

The **programme** (`programme-service.ts`) is a separate WBS import/tree with
its own `programmeTaskState()`; nothing in `site-service.ts` or
`measurement-service.ts` reads from it — it does not feed site tasks, DPR, or
work-done-vs-balance programmatically. It appears to be informational only
(and is marked a stub route, `/progress/programme`, in CLAUDE.md's build order).
Site tasks (A1) are created directly off a work-order line, independent of the
programme. DPR entries reference a site task only optionally
(`site_task_id: nullable`), and when present, auto-advance that task's status.
`workDoneVsBalance()` (A4) is a pure read model over `WorkOrderLine` — it writes
nothing itself; it is fed entirely by `submitDpr` (`done_qty`),
`signJointMeasurement` (`measured_qty`), `actOnRaBill` (`billed_qty`), and
`markReadyToMeasure`/`clearReadyToMeasure` (`ready_qty`).

---

## Part 4 — Direction of flow, answered from the code

- **Can an indent be created from a purchase order?** No. `createIndent` takes
  only a project, optional work order/site task, and lines — there is no path
  from a PO back to an indent. Only forward: indent → comparative → PO.
- **Can a PO exist without an indent?** **Yes.** The "blank" route in
  `createPurchaseOrder` requires neither `comparative_id` nor any
  `indent_line_id` on its lines — `material_id` and `boq_line_id` are supplied
  directly. This is the one PO route where material is hand-picked.
- **Can a GRN exist without a PO?** **No.** `postGrn` requires
  `purchase_order_id` and throws unless that PO is `sent` or
  `partially_received`.
- **Can an RA bill exist without certified measurements?** It cannot even be
  **created** without **signed** (not yet certified-by-the-full-chain)
  measurements — `createRaBill` checks `m.status !== "signed"` and throws. It
  certainly cannot be *certified* (status `certified`) without clearing the
  whole four-step chain. So: no, at either reading of "exist."
- **Can a material issue exceed stock on hand?** **No** — checked per line
  against `storeStockOnHand` in `issueMaterial`, with lines of the same
  material pooled before the check.
- **Can a transfer order move stock that is not there?** **No** — checked at
  write time (`createMaterialTransfer`/`updateMaterialTransfer`) **and again**
  at dispatch (`dispatchMaterialTransfer`), specifically because a draft can
  sit stale while the stock it reserved is consumed elsewhere.
- **Can a gate pass be closed without recording a return?** Depends on type:
  a **returnable** pass can only be closed by `recordGatePassReturn` reaching
  100% returned (there is no "force close" bypass) — so no. A
  **non-returnable** pass is closed by `closeGatePass`, which has nothing to
  return by definition, and that function explicitly **refuses** to run on a
  returnable one. So the two paths cannot be crossed; there's no way to force a
  returnable pass closed without squaring every line.

One place the code *allows something that probably shouldn't be allowed*:
**requesting more than the BOQ material balance on an indent** has no
server-side check against `BoqMaterialBudget` — only a screen-level warning per
the code comment, with the Project Head left to catch it by eye at approval
time. See also Part 6 for the `ready_to_measure` gap.

---

## Part 5 — Test script

A reproducible walkthrough, one document type at a time, in dependency order.
Run `resetDemo()` first (Reset Demo in the user menu) so document numbers are
predictable and every balance starts from the seed.

1. **Switch to Senior Project Manager (`project_head`)**, project **Manas
   Sapphire**. Go to *Budget → BOQ*. Click "Add BOQ line" if you want a fresh
   line, or just note an existing item code and its quantity — you'll indent
   against it.
2. **Switch to Project Engineer (`site_engineer`)**, same project (this role is
   single-project, so no switcher). Go to *Procurement → Indents* → "Raise
   indent." Pick the BOQ line from step 1, pick any material, set a quantity,
   submit. You should land back on the indent list with a new row in
   `submitted`, step badge **A2**.
3. **Switch back to `project_head`**. Go to *Procurement → Indent approval*.
   Open the indent, approve the line in full. Status should flip to
   `approved` and the item disappears from your Approvals queue.
4. **Switch to Purchase Officer (`purchase_officer`)**. Go to *Procurement →
   Comparatives* → "Prepare comparative" (full-page editor). Pick the approved
   indent line, enter three supplier quotes, pick one (non-L1 needs a
   justification), submit straight to approval. You should see the comparative
   at `pending_approval`, step **B1→B2**.
5. **Switch to Manager Procurement (`purchase_head`)**. Go to *Procurement →
   Approval*. Approve it. The comparative becomes `approved`; the underlying
   indent moves to `in_comparative`-derived state.
6. **Back to `purchase_officer`**. Go to *Procurement → Purchase orders* →
   generate from the approved comparative (or "Raise purchase order" full-page
   editor with the comparative selected). Submit for sign-off
   (`submitPurchaseOrder`).
7. **`purchase_head`** recommends it (step B3) from *Procurement → Purchase
   orders* or the Approvals inbox.
8. **Switch to GM/Management (`hod`)**. Authorise it (step B4) from
   *Approvals*. Status becomes `approved`.
9. **Back to `purchase_officer`**. Open the PO, "Issue" it → `sent`.
10. **Switch to `site_engineer`** (or Manager – Stores, `store_keeper`). Go to
    *Procurement → GRN* → "Record GRN" against the now-`sent` PO. Enter
    challan/vehicle numbers, receive the full quantity, accept it. You should
    see: the PO move to `received`/`partially_received`, a new stock `receipt`
    row, and the indent line's `received_qty` move.
11. Still as `site_engineer`/`store_keeper`: go to *Stores → Stock position*
    and confirm the material you just received shows the new on-hand quantity
    for that store.
12. **Material issue**: *Stores → Material issue* ("Issue material"). Pick a
    work order, pick the material just received (must have stock), issue a
    quantity ≤ on hand. Confirm the stock position drops by that amount.
13. **Gate pass**: *Stores → Gate pass* → "Raise gate pass." Pick type
    `non_returnable`, a material with stock, submit for approval.
14. **Back to `project_head`**: *Approvals* → approve the gate pass. Confirm
    stock drops again (approval, not dispatch, is what moves it).
15. **Back to `site_engineer`/`store_keeper`**: acknowledge the gate pass at
    the gate (a receiver name), then close it (non-returnable — no return to
    record).
16. **Transfer order**: *Stores → Transfer orders* → "Raise transfer order"
    from this project's store to another project's store (pick any second
    seeded project/store). Dispatch it → `in_transit`.
17. **Switch to the receiving project** (same role, use the project switcher
    if multi-project, or `site_engineer`/`store_keeper` posted there).
    Acknowledge the transfer, optionally short-delivering one line. Confirm
    the receiving store's stock position increases by what you actually
    entered as received, not the dispatched quantity.
18. **DPR**: as `site_engineer`, *Progress → Daily report* → file today's
    report with at least one progress line against a work-order line.
19. **Switch to QS (`project_qs`)**. *Progress → Work done* confirms the line's
    done quantity moved. *Billing → Measurements* → "Record measurement" (full
    page editor) against that work-order line, enter dimensions or a direct
    quantity, create, then sign it (both signatures in one call). Confirm
    `measured_qty` moved and, if you'd set a `ready_to_measure` flag earlier,
    it clears.
20. Still as `project_qs`: *Billing → RA bills* → "Prepare RA bill," pick the
    signed measurement, enter the bill date, submit.
21. **Chain**: `project_qs` approves step 1 (QS verification) from *Billing →
    Certification* or *Approvals*. **Switch to `project_head`**, approve step 2
    (cross-team). **Switch to Billing Head (`qs_head`)**, approve step 3.
    **Switch to `hod`**, approve step 4 — this is what finally sets
    `billed_qty` and status `certified`.
22. **Back to `project_qs`**: *Billing → Handed over* → hand the bill to
    Accounts.
23. **Vendor bill** (parallel thread, any time after step 10):
    **`purchase_officer`**, *Procurement → Vendor bills* → "Enter vendor bill"
    against the GRN line from step 10, matching quantity/rate/GST exactly to
    see `matched`, or deliberately mismatching one field to see `mismatch` and
    the required override reason on verification. Verify it, then hand it
    over.
24. **Drawings** (any time, as `project_head` or `project_qs`): *Drawings →
    Register* → log a new drawing (writes R0 automatically). *Drawings →
    Transmittals* → create one, picking that drawing/revision as a line,
    issue it, then record its receipt.
25. **Returns**: if step 10's GRN rejected any quantity, a `Return` was
    auto-raised — find it at *Procurement → Returns* as `purchase_officer` and
    advance it `dispatched → debit_note_issued`; confirm a debit note appears
    against the supplier in *Ledgers → Suppliers*.

---

## Part 6 — Gaps and inconsistencies

1. **`approval-service.ts` is entirely dead code.** `openApprovalChain`,
   `approveStep`, `rejectStep`, and `currentStep` are all `notImplemented()`
   stubs that would throw `WorkflowError` if ever called. Nothing calls them —
   `services/index.ts` re-exports the module, but grepping the whole `src/`
   tree for any import of these four names outside the file itself returns
   nothing. Every real chain (`indent`, `comparative`, `purchase_order`,
   `gate_pass`, `ra_bill`) duplicates the same "create pending row(s) /
   find-the-lowest-pending / update it" logic inline inside
   `indent-service.ts`, `purchase-service.ts`, `po-service.ts`,
   `gate-pass-service.ts`, and `billing-service.ts` respectively. The "shared
   approval engine" described in the file's own doc-comment does not exist in
   practice — it's five independent copies of the same pattern.
2. **`saveContract`'s validation errors are unreachable to the user.** Its
   three business-rule checks (instalments vs. advance percent, retention
   stages vs. 100%, payment split vs. 100%) throw a bare `new Error(...)`
   rather than a `ValidationError`/`WorkflowError`. `errorCopy()` only
   special-cases subclasses of `ServiceError`; a plain `Error` falls through to
   the generic `"Something went wrong" / "Refresh the page and try again."`
   toast, discarding the specific, actionable message the service author wrote
   (e.g. "Mobilisation instalments total 97%, not the advance's 100%."). This
   is the one spot in all the service files surveyed where a thrown error
   won't reach the screen as written.
3. **`ROLE_TAB_ACCESS` and `PROJECT_NAV` are two independently-maintained
   lists with no code tying them together**, and `/masters/permissions` only
   edits the former. Turning a tab on for a role there does not add that tab's
   pages to the role's `PROJECT_NAV`, so an admin enabling (say) Billing for
   `purchase_officer` via the matrix screen gets a visible-but-empty tab rather
   than the pages they probably meant to grant. This is a real trap for anyone
   using the "editable matrix" the way its own page probably implies it works.
4. **A4's "ready to measure" flag is advisory, not a gate.**
   `createJointMeasurement` never checks `WorkOrderLine.ready_to_measure` or
   `ready_qty` — a QS can measure any work-order line at any time, whether or
   not the site ever flagged it ready. The flag exists purely to drive a
   worklist/notification; nothing in the measurement service enforces the A4
   → C1 sequence the workflow chart implies. Whether this is intentional
   (site flags are a nudge, not a lock) or a missed guard is a product
   decision, but the chart's arrow from A4 to C1 reads as a hard dependency
   and the code does not enforce one.
5. **No server-side cap on indenting beyond the BOQ's material allowance.**
   The code comment in `createIndent` says this is deliberate ("the screen
   warns, the Project Head decides"), but it is worth flagging as a
   policy choice, not an oversight, in case the demo audience expects a hard
   stop.
6. **QA/QC is a phantom role.** It exists only as a `{ role: null }` entry in
   `CLIENT_ROLES` so the permissions-matrix screen can render a ninth row for
   the client's org chart. There is no `Role` enum value, no seed user, no
   grants, and nothing in any service references it. It cannot be switched to
   and has no content anywhere — confirmed consistent with CLAUDE.md's own
   description of it as unbuilt, not a discovered bug, but worth stating
   plainly for the demo: **do not attempt to show this role; it does not
   exist as a session state.**
7. **The programme (Gantt/WBS) is wired to nothing.** `programme-service.ts`
   has its own tree-building and state functions, and the project carries
   `programme` as a resource/tab, but no other service (`site-service.ts`,
   `measurement-service.ts`, `budget-service.ts`) reads from it. It cannot
   currently drive or be driven by site tasks, DPR, or billing — it is an
   island. This matches CLAUDE.md's own listing of `/progress/programme` as a
   stub, so not a new finding, but worth stating for the test script: don't
   expect programme data to affect anything else you test.
8. **The work order has no state machine at all.** Every other document
   surveyed has a `*_STATUSES` + `*_TRANSITIONS` pair in `enums.ts`; the work
   order has neither — only `is_active: boolean`. This is consistent
   (CLAUDE.md never claims otherwise) but stands out structurally: it's the
   one node on the chart that is pure master data with no lifecycle, despite
   being the parent of two entire chains (A1/A3 progress and C1/C2 billing).
   No print output was found for the work order document itself either,
   despite `WorkOrderContract` (its commercial terms) being a first-class,
   heavily-modeled object.
9. **No print/PDF output was located for**: the work order, the BOQ line, the
   DPR, the site task, the return, the vendor bill, the drawing register entry,
   or the transmittal. CLAUDE.md's print rule (`data-print-area` +
   `<PrintButton>`) is generic and could be present in a component not grepped
   here by name, so this is reported as "not found by search," not "confirmed
   absent" — worth a quick visual check before the demo on anything you plan
   to print live.
10. **Accounts Handover is confirmed read-only**, matching CLAUDE.md: no
    `GRANTS` entry anywhere gives any role `create`/`edit`/`delete` on
    `accounts_handover`, and no service file writes to an accounts-handover
    table — `handOverRaBill` and `handOverVendorBill` both just flip their own
    document's status; nothing downstream in Accounts is written at all. The
    `/accounts-handover` page is therefore a pure read view with nothing
    behind it to misfire — not a gap, but worth confirming before the demo so
    you don't go looking for an action button that was never meant to exist.
