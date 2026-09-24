# Manas Developers ERP — working agreement

A clickable demo **developer ERP** (builder-side: projects, contractors, site,
purchase, billing) for Manas Developers, Goa. There is no backend yet — all data
is seeded into localStorage — but the same codebase is intended to get a Supabase
backend. **Every architectural rule below exists so that becomes a swap, not a
rewrite.** Follow them.

The client-approved workflow chart is `docs/manas-workflow-chart.pdf`. Its colours
denote which team holds authority for each step, and its step codes (A1–A5,
B1–B8, C1–C5) must appear in the UI **exactly** as written there.

---

## 1. Architecture rules

```
src/
  config/
    permissions.ts        Single source of truth for authority, plus TOP_NAV
                          (the per-role bar) and createActionsFor. See §2.
    labels.ts             Plain words for every internal value that reaches a
                          screen — entity types, trades, movements. No
                          snake_case is ever rendered.
    teams.ts              Team metadata + STEP_LABELS (chart text, verbatim).
    team-styles.ts        Static Tailwind class strings per team.
  lib/
    clock.ts              now() / today() / ageing. The only place that asks
                          what day it is.
    domain/               Zod schemas + inferred types. The source of truth.
    data/
      database.ts         DemoDatabase — one key per future Postgres table.
      repositories/       One interface per aggregate. ALL methods async.
      local/              localStorage implementation (Zustand + persist).
      seed/               Deterministic seed + resetDemo().
      index.ts            getRepositories(), selected by NEXT_PUBLIC_DATA_SOURCE.
    services/             Workflow services: ALL business rules and cascades.
                          guards.ts (assertCan / parseInput / assertTransition),
                          numbering.ts, pricing.ts (pure, seed reuses it).
      queries/            Read services for dashboards, the workflow chart and
                          the record trail. One function per widget.
                          index.ts wraps every one in redactMoney — see §2.
                          redaction.ts is where value-blindness is enforced.
    session/              Mock session provider (useSession).
    hooks/                Repository-backed read hooks + useAccess.
    format.ts             ₹ en-IN and "21 Sep 2026" formatting.
  components/
    ui/                   shadcn primitives. Do not hand-edit.
    ui-app/               The modal system: AppDialog, FormDialog,
                          ConfirmDialog, RecordDialog, SubmitButton. No side
                          sheets exist.
    editor/               FullPageEditor: the shell for Comparative, Joint
                          Measurement and RA Bill. Grid keys + autosave.
    common/               PageHeader, ListPage, DataTable, StatusChip,
                          PositionChip, AgeChip, Qty, ScrollStrip, Attachments,
                          PrintButton, EmptyState, Field, ResourcePage, …
    shell/                Top bar: role nav, project switcher, + New, global
                          search, notifications, role switcher, user menu.
    project/              Pinned project header + workspace tabs.
    material/             The A2 -> B8 thread: dialogs and sheets.
    billing/              The A1 -> C5 thread: dialogs and sheets.
    budget/               BOQ line and work order dialogs.
    dashboard/            Role dashboards: primitives + widgets/registry.
  app/                    Routes. See §4.
```

### Hard rules

1. **Components NEVER import the Zustand store.** They read through the hooks in
   `src/lib/hooks` and write through the services in `src/lib/services`.
   `src/lib/data/local/store.ts` is imported only by `local/crud.ts`, the hooks,
   and the Reset Demo button.
2. **No business logic in components.** A cascade (approve → update status →
   write the next Approval row → roll up the BOQ line) belongs in a service.
   Components call one service function and render the result.
3. **Every repository method returns a Promise**, even though the local
   implementation is synchronous. Never "optimise" this away.
4. **Domain field names are snake_case** and match the intended Postgres
   columns. ids are uuid strings, timestamps are ISO strings. Every entity has
   `id`, `created_at`, `updated_at`; project-scoped entities also have
   `project_id`.
5. **Status values are const enums** in `src/lib/domain/enums.ts`. Never inline
   a status string literal in a component.
6. **Guard hydration.** localStorage-backed data must not render until
   `useIsHydrated()` is true. Wrap data in `<HydrationGate>` or return `[]`
   before hydration — this is what `useAllRows` already does.
7. **Permissions only through `can()`.** No component, service or route may
   compare a role name inline. `useAccess(resource)` is the component-side
   wrapper.
8. **Seed data is reproducible, anchored to today, and has depth.** Each
   project in `PROJECT_CATALOG` carries a `consumed` target — Manas Sapphire
   0.65, Manas Greens 0.30, Manas Heights 0.08 — and the seed works backwards
   from it: `seedConsumptionHistory` lays down the closed purchase orders,
   receipts and issues that a project seventeen months in has behind it, and
   `HISTORY_BILLS` adds the run of settled RA bills. History deliberately stops
   short of what the site has reported done, or the seven showcase bills have
   nothing left to measure and every queue comes up empty.
   `src/lib/data/seed/ids.ts`
   gives uuid-shaped ids from table+row numbers, and every date is an offset
   from `today()` — so "today's DPR is not filed yet" and the ageing colours are
   true whenever the demo is given. The offsets are fixed, which is what keeps
   it reproducible: the same structure every time, on a different day. Never
   call `Date.now()`, `new Date()` or `Math.random()` inside the seed — go
   through `src/lib/clock.ts` — and never import the data layer from it;
   `pricing.ts`, `ra-bill-math.ts` and `document-number.ts` are pure precisely
   so the seed can share the services' arithmetic without a cycle.
9. **Services are atomic.** One exported function = one business action, taking
   `(input, actor)` and returning a typed result. It opens with `assertCan`,
   parses input with zod through `parseInput`, checks the state machine with
   `assertTransition`, then writes. Each one is shaped to become a Supabase RPC
   or server action unchanged.
10. **Writes go through `useServiceAction()`.** It turns `ServiceError`s into
    toasts, so no screen imports the error classes or try/catches a service.
11. **Hooks must return stable identities.** `useAllRows` / `useProjectRows`
    memoise, because a fresh array each render silently resets any `useEffect`
    that depends on them (this bit the GRN dialog once already).
12. **A sheet that writes must read the live row**, not the snapshot the list
    handed it — look the record up by id from the store, or the footer keeps
    showing the pre-write state.
13. **Nothing asks the OS what time it is except `src/lib/clock.ts`.** Services,
    the seed and every ageing calculation call `now()` / `today()` /
    `ageInDays()`. `freezeClock()` exists for tests. Parsing a date that is
    already a string is not the clock's business.
14. **Dashboard figures come from `src/lib/services/queries/`**, one typed
    function per widget; components only render. They are written to become SQL
    views or RPCs, so they never reach for anything a query could not.
15. **A grid item needs `min-w-0`** when a child truncates, or the track sizes
    to the content and the page scrolls sideways on a phone.
16. **Value-blindness is enforced in `queries/index.ts`, never in a component.**
    Every scope-taking query is re-exported there wrapped in `redactMoney`, so a
    role failing `can(role, "view", "rates")` receives a payload with the
    monetary fields **removed** — not zeroed, not null, absent. Adding a query
    means adding it to that file, and it is guarded from its first call. A
    screen that decides for itself whether to print a rupee figure will get it
    wrong the first time someone adds a column, which is exactly what happened
    to the project header. `useMoneyLeakCheck` is the dev tripwire and
    `value-blindness.test.ts` is the build-time one.
17. **Never render a unit-less quantity, and never sum across units.** `<Qty>`
    takes a value *and* a unit; `<LineCount>` is what a list column shows in
    place of a mixed-unit sum, with the per-unit breakdown on hover.
    `totalsByUnit` does the arithmetic. 266 is not a quantity when the lines
    are bags, brass and rmt.
18. **Bump `SCHEMA_VERSION` in `src/lib/data/local/store.ts` whenever anything in
    `src/lib/domain` changes** — a new column, a renamed field, a new table. The
    demo persists to localStorage, so a browser that has run an older build
    rehydrates rows of the older shape and current code reads `undefined` off
    them. On a version mismatch the store discards the snapshot and rebuilds from
    the seed; there is no user-authored data worth migrating field by field. The
    store also rebuilds when `seeded_on` is not today, because seed dates are
    relative to `today()` (rule 8) and yesterday's snapshot would date everything
    wrongly.

---

## 2. Teams, roles and the authority matrix

### Teams (colours match the chart legend)

| Team | Colour | Token |
|---|---|---|
| `project_budget` | purple `#6F66B8` | `--team-budget` |
| `site_execution` | amber `#C7812F` | `--team-site` |
| `purchase_stores` | green `#3A7D5C` | `--team-purchase` |
| `billing_certification` | teal `#2A7F86` | `--team-billing` |
| `accounts` | slate `#4A5561` | `--team-accounts` |

These are the chart's five hues, muted to sit as accents on a warm ground.
Tokens are defined light + dark in `src/app/globals.css`. Use the class strings
in `src/config/team-styles.ts` — never build a Tailwind class by interpolation,
and see §4 for the rule that team colour is an accent and never a surface.

### Authority matrix

`C` create · `E` edit · `D` delete · `A` approve · `R` read-only · `—` read-only,
money hidden. Every role can **view** every page; nothing in the nav is ever
disabled.

| Resource (step codes) | Owner team | project_head | site_engineer | purchase_officer | purchase_head | project_qs | qs_head | hod |
|---|---|---|---|---|---|---|---|---|
| BOQ & Budget | Project & Budget | C E D | R | R | R | R | R | R |
| Work Orders & Rates | Project & Budget | C E D | R | R | R | R | R | R |
| Contractor Master | Project & Budget | C E D | R | R | R | R | R | R |
| Indent Approval (A2) | Project & Budget | **A** | R | R | R | R | R | R |
| Budget vs Actual | Project & Budget | R | R | R | R | R | R | R |
| Site Tasks (A1) | Site Execution | R | C E D | R | R | R | R | R |
| Indents (A2) | Site Execution | R | C E D | R | R | R | R | R |
| DPR & Labour (A3) | Site Execution | R | C E | R | R | R | R | R |
| Work Done vs Balance (A4) | Site Execution | R | C E | R | R | R | R | R |
| GRN (B5–B6) | **Site Execution** | R | C E | R | R | R | R | R |
| Site Stock & Issue (A5) | Site Execution | R | C E | R | R | R | R | R |
| Vendor Comparatives (B1) | Purchase & Stores | R | — | C E | R | R | R | R |
| Approval to Purchase (B2) | Purchase & Stores | R | — | R | **A** | R | R | R |
| Purchase Orders (B3–B4) | Purchase & Stores | R | — | C E | R | R | R | R |
| Vendor Bill Check (B7) | Purchase & Stores | R | — | C E | R | R | R | R |
| Returns | Purchase & Stores | R | R | C E | R | R | R | R |
| Material Master | Purchase & Stores | R | R | C E D | R | R | R | R |
| Supplier Master & Rates | Purchase & Stores | R | — | C E D | R | R | R | R |
| Supplier Ledger | Purchase & Stores | R | — | R | R | R | R | R |
| Joint Measurements (C1) | Billing & Certification | R | R | R | R | C E | R | R |
| RA Bills (C2) | Billing & Certification | R | R | R | R | C E | R | R |
| Certification (C3–C4) | Billing & Certification | **A** | R | R | R | **A** | **A** | **A** |
| Handed Over (C5) | Billing & Certification | R | R | R | R | C E | R | R |
| Contractor Ledger | Billing & Certification | R | R | R | R | R | R | R |
| Accounts Handover (B8/C5) | Accounts | R | R | R | R | R | R | R |

**Notes**

- **GRN (B5–B6) is owned by Site Execution, not Purchase.** The chart colours it
  green; the client confirmed the site records it, so it is recoloured orange
  here and lives under the Site Execution tab.
- **The Site Engineer is value-blind** on supplier rates, comparatives, POs,
  vendor bills and the supplier ledger: `can(role, "view_values", resource)`
  returns false, and `<DataTable showValues={false}>` drops every column flagged
  `money`. The pages stay visible and navigable.
- **Accounts is a read-only boundary.** No role has a mutating grant on
  `accounts_handover`.

### Project assignment

`User.assigned_project_ids` is where a user is posted. Site and QS staff sit on
one site, the Project Head covers two, and the purchase and management roles see
the whole portfolio. **Dashboards and the Approvals inbox are scoped by it**;
navigation is not — a page you can reach is still a page you can read.

`scopeFor(user, project_id?)` builds the `QueryScope` every read service runs
under. The dashboard's project filter can only narrow the posting, never widen
it.

### Value-blindness and `rates`

`rates` is a resource but **not a page** — it is the data class covering every
rate, landed cost, PO value and bill amount. Site Execution is denied `view` on
it, which is what `can(role, "view", "rates")` answers on the GRN and Stock
screens. Pages are never listed in `VIEW_DENIED`: navigation is never disabled.

### Dashboards

Three pieces, deliberately separate:

| Piece | Lives in | Job |
|---|---|---|
| Layout | `DASHBOARD_LAYOUTS` in `permissions.ts` | ordered `{ widget_id, size, emphasis? }` per role |
| Registry | `components/dashboard/widgets/registry.tsx` | `widget_id` → component |
| Figures | `lib/services/queries/` | one typed function per widget |

Sizes map onto a four-column grid (`sm` 1, `md` 2, `lg` 3, `full` 4), two
columns at `md`, one on a phone. Adding a widget means a query, a component, a
registry entry and a layout entry — in that order.

"Needs your action" (`getActionItems`) is the one widget every role gets, and it
always sits directly under the KPI row. It pools every queue the role owns,
sorts by age, and bands it: amber over 3 days, red over 7 (`ageBand`). The same
query drives the count badge on the Approvals nav item.

### The live workflow chart

`components/project/workflow-chart.tsx` redraws the approved chart as SVG —
same boxes, arrows and labels, transcribed into
`workflow-chart-layout.ts`. Counts come from one service, `getFlowCounts`, so
the diagram can never disagree with itself. Nodes the current role can act on
are ringed with their count; every node links to its page. Below `md` it becomes
a list grouped by team.

It lives at **`/workflow`**, last in the top bar, with its own project selector
— it reads across the whole process rather than summarising one project, so it
is no longer part of a project's Overview. Boxes sit on the card ground with a
2–3px team rule; arrows are `border`, and the ring on an actionable node is
`primary`.

### The record trail

`getRecordTrail(entity_type, entity_id, role)` returns the chain a record sits
in, upstream and down, as ordered steps of typed nodes. `<RecordTrail>` renders
them as team-coloured chips at the top of every detail sheet; a position holding
several records collapses into one chip with a popover. Values are blanked by
the query for a role that may not see them, so the component has nothing to
hide. This replaces the plain upstream links from the earlier prompts.

### Approval chains

One generic `Approval` row serves every gate, so the table doubles as the audit
trail. Chains live in `APPROVAL_CHAINS` in `permissions.ts`:

| Chain | Steps |
|---|---|
| `indent` | A2 — Project Head |
| `comparative` | B2 — Purchase Head |
| `ra_bill` | C3 Project QS → C3 Project Head → C4 QS Head → C4 HoD |

B7 (vendor bill check) is a three-way match, **not** a sign-off, so it has no
chain.

**The RA bill chain is four rows, not four statuses.** `submitRaBill` opens all
four at once and every one starts `pending`; only the *lowest* pending sequence
is actionable, and only by the role that holds it. `RaBill.current_sequence` /
`current_step_code` mirror that row so a list can show where a bill sits without
a join. The Project Head's step is marked `cross_team: true` — it is the one
step another team holds, and the screens label it in Project & Budget purple.

A step may `approve` (optionally adjusting certified quantities), `send_back`
(bill returns to `draft`, chain rows are reopened on resubmit) or `reject`.
Every quantity change is appended to `RaBillRevision` — that table is never
updated or deleted.

### State machines

Declared as `*_TRANSITIONS` next to their enum in `src/lib/domain/enums.ts` and
enforced by `assertTransition` in the services. Never move a status by writing
the field directly.

| Entity | Machine |
|---|---|
| Indent | `submitted → approved \| partially_approved \| rejected → in_comparative → po_raised → partially_received → received → closed` |
| Comparative | `draft → pending_approval → approved \| sent_back \| rejected` (sent_back re-enters pending_approval) |
| PurchaseOrder | `draft → sent → partially_received → received → closed` |
| Grn | `posted` only — immutable; corrections go through a Return |
| VendorBill | `draft → matched \| mismatch → verified → handed_over` (verifying a mismatch needs an override reason) |
| Return | `raised → dispatched → debit_note_issued` |
| SiteTask | `planned → in_progress → completed` (a completed task may be reopened) |
| JointMeasurement | `draft → signed → billed` — a draft moves nothing; signing is what advances `measured_qty` |
| RaBill | `draft → submitted → in_certification → certified → handed_over`; any chain step may send it back to `draft` or `reject` it |

### Document numbering

One home: `src/lib/services/numbering.ts`, format
`<PROJECT_SHORT>/<KIND>/<FY>/<SEQ>` — e.g. `MSP/IND/26-27/0014`. FY is the
Indian 1 Apr – 31 Mar year. Kinds: `IND CMP PO GRN ISS RTN DN VB JM`. The
sequence is derived by counting existing documents, so it needs no counter table
and survives `resetDemo()`; in Postgres, swap the count for a sequence.

RA bills are the one exception: they are numbered **inside their work order**,
`MSP/RA/WO-001/RA-03`, via `raBillNumber()` in `document-number.ts`.

### Tax

`splitTax()` in `pricing.ts`: a Goa supplier is CGST + SGST, anyone else is
IGST. `HOME_STATE` in `enums.ts` is the single place that says where we are
registered.

### Material budget

`BoqMaterialBudget` (`boq_line_id`, `material_id`, `budget_qty`, `budget_rate`)
is the allowance a BOQ line carries for a material. It is the yardstick for two
things and both read the same calculation, `materialPosition()` /
`materialPositions()` in `budget-position.ts`:

- indents are checked against it (budget less already indented / issued)
- Budget vs Actual measures issued value against it

Issues are valued at the weighted average of receipts at PO rate.

### Work done, measured, billed

`WorkOrderLine` carries four roll-ups and each has exactly one writer:

| Column | Written by | Meaning |
|---|---|---|
| `done_qty` | `submitDpr` (A3) | summed from DPR progress entries — nothing else |
| `measured_qty` | `signJointMeasurement` (C1) | a draft sheet moves nothing |
| `billed_qty` | `actOnRaBill` on HoD approval (C4) | only a certified bill counts |
| `ready_to_measure` / `ready_qty` | `markReadyToMeasure` (A4), cleared on signing | what the site is claiming is ready |

`WorkProgress` is **derived** — an append-only trail of how `done_qty` got
where it is. Nothing reads it to decide anything.

### Attachments and print

`Attachment` hangs a file off a GRN (the challan photographed at the gate), a
DPR (site photographs), a vendor bill (the supplier's invoice), a joint
measurement (the signed sheet) or a comparative (the vendor quotes). The demo
stores no bytes — it records the name, type and size, which is what a Supabase
Storage row will hold — and every row says "demo: not stored" rather than
offering a download that would 404. Attaching takes the `edit` grant on the
record's own resource; nobody has a general "upload" grant.

Printing is one attribute: mark the element `data-print-area` and drop in
`<PrintButton>`. Everything else on the page is hidden, buttons inside the area
are dropped, and `.print-page` breaks a multi-part document onto its own sheets.

### Issued v. Measured

The dashed line on the chart. `getIssuedVsMeasured()` compares material issued
against a BOQ line with what the *measured* work should have consumed:

```
theoretical = measured_qty × (BoqMaterialBudget.budget_qty ÷ BoqLine.quantity)
```

Each row is in one of three states, and only one of them is a flag:

| State | When | Variance |
|---|---|---|
| `flagged` | measured, and over tolerance | a number |
| `within_tolerance` | measured, at or under tolerance | a number |
| `not_measured` | `measured_qty` is zero | **null** |

A line with `issued_qty` of zero is excluded outright. **An unmeasured line has
no denominator, so it has no variance and is never a flag** — reporting it as a
100% overrun buried four real flags under twenty-four false ones. Using less
than budgeted is good news and lives behind the panel's "Show all lines"
toggle, off by default.

### TDS

`TDS_PERCENT` in `enums.ts`, from the contractor's constitution: 1% for an
individual or HUF, 2% for a firm or company (s.194C). Retention comes from the
work order. Both are applied by `computeRaBillTotals()` in `ra-bill-math.ts`,
which is pure so the seed shares it.

---

## 3. Route map

```
/                                          role-based dashboard
/projects                                  project cards
/projects/[projectId]                      → redirects to /overview
/projects/[projectId]/overview
/projects/[projectId]/budget/boq
/projects/[projectId]/budget/work-orders
/projects/[projectId]/budget/indent-approval
/projects/[projectId]/budget/budget-vs-actual
/projects/[projectId]/site/tasks
/projects/[projectId]/site/indents
/projects/[projectId]/site/dpr
/projects/[projectId]/site/work-done
/projects/[projectId]/site/grn
/projects/[projectId]/site/stock
/projects/[projectId]/purchase/comparatives
/projects/[projectId]/purchase/comparatives/new          full-page editor
/projects/[projectId]/purchase/approval
/projects/[projectId]/purchase/purchase-orders
/projects/[projectId]/purchase/vendor-bills
/projects/[projectId]/purchase/returns
/projects/[projectId]/billing/measurements
/projects/[projectId]/billing/measurements/new           full-page editor
/projects/[projectId]/billing/ra-bills
/projects/[projectId]/billing/ra-bills/new               full-page editor
/projects/[projectId]/billing/certification
/projects/[projectId]/billing/handed-over
/approvals                                 inbox for roles that approve
/my-requests                               inbox for roles that raise work
/workflow                                  the live workflow chart, per project
/masters/contractors  /masters/materials  /masters/suppliers
/ledgers/suppliers    /ledgers/contractors
/accounts-handover
/reports/budget-vs-actual
```

The **top bar is per role**: `TOP_NAV` in `permissions.ts` gives each role its
own ordered items, not a shared bar filtered down. An item is either an absolute
`href` or a `project_segment` resolved against the active project (see
`useActiveProject`); `enabled: false` keeps a route that has not been built out
of the bar without showing dev copy. Site Engineer and Project QS are posted to
one site and get no project picker; the portfolio roles get the switcher in the
bar. The five workspace tabs stay in
`src/components/shell/nav-config.ts`. Adding a page means adding it to `TOP_NAV`
or `WORKSPACE_TABS` **and** to `RESOURCES` / `RESOURCE_META` in
`permissions.ts`.

Hidden today, pending later prompts: **Reports** (project_head, qs_head, hod),
**Spend** (purchase_head), **Purchase Desk** (purchase_officer, purchase_head)
and **Daily Reports** (site_engineer). Each needs a cross-project route that
does not exist yet; the project-workspace pages behind them stay reachable
through Projects and through every record link.

---

## 4. Design rules

### Tokens

Every colour, radius and shadow is a CSS variable in `src/app/globals.css`.
`docs/theme.css` is the reference copy the theme was applied from — **keep the
two in step**. Never write a raw colour, a hex value or a Tailwind palette class
(`text-emerald-700`, `bg-amber-50`) anywhere in `src/`.

Three families, and nothing else:

| Family | Tokens | Used for |
|---|---|---|
| Base | `background` `foreground` `card` `popover` `primary` `secondary` `muted` `accent` `border` `input` `ring` | all chrome |
| Status | `success` `warning` `destructive` + `success-soft` `warning-soft` `danger-soft`, and `info` / `info-soft` | state, and only state |
| Team | `team-budget` `team-site` `team-purchase` `team-billing` `team-accounts` | accents, per the rule below |

One deviation from the reference file: next/font sets `--font-sans-face`, not
`--font-sans`, because a custom property cannot refer to itself on the element
that declares it. `--font-sans` and `--font-heading` are both built from it.

### Type

- **Sans-serif everywhere.** Inter via `next/font`, on body, buttons, inputs,
  tables, charts and toasts. `font-mono` (Geist Mono) is kept for document
  numbers and step codes only. There is no serif face in the app.
- **`subsets: ["latin", "latin-ext"]` is required, not optional.** The rupee
  sign U+20B9 sits in Google Fonts' `latin-ext` unicode-range (`U+20AD-20C0`);
  the `latin` subset stops at U+20AC, the euro. Drop `latin-ext` and every ₹ in
  the app silently falls back to the system UI font.
- Body 14px / 1.5. Headings: `h1` 1.75rem/600/-0.02em, `h2` 1.375rem/600/-0.015em,
  `h3` 1.0625rem/600, `h4` 0.9375rem/600 — page title `h1`, section title `h2`,
  card title `h3`. The base layer sizes them, so do not re-size a heading with a
  utility class.
- **Headings take `foreground`, never muted and never a team colour.** Only
  captions, helper text, table headers and timestamps use `muted-foreground`.
- Tables: 14px body, 13px headers in `muted-foreground`, `line-height: 1.5`.
- Every amount, quantity and KPI uses tabular figures (`font-variant-numeric:
  tabular-nums`). Tables get this from the base layer; a standalone figure
  needs the `num` class.

### Colour

- **Status colour is the only colour that carries meaning**, and it means one of
  three things: good (`success`), attention (`warning`), wrong (`destructive`).
  Ageing is amber over 3 days and red over 7; a bill match is success or
  destructive; budget variance is warning at 80–100% and destructive above 100%;
  low stock is warning. Nothing else may be green, amber or red.
- **Team colour is an accent, never a surface.** It is allowed in exactly three
  places: the dot on a team tag, the border and text of a step-code badge, and a
  2–3px rule (a card's left border, an active tab's underline). It may never
  fill a card, tint a page, colour a heading or colour a button. `TEAM_STYLES`
  in `src/config/team-styles.ts` is the only source of those class strings, and
  they are written out in full so the Tailwind scanner sees them.
- **Charts use `chart-1` … `chart-5` in that order.** Never a team colour in a
  chart, and never a status colour except to mark a genuinely bad value.
- **Dark mode is not optional.** Every screen works in both; the toggle lives in
  the user menu and `ThemeScript` applies the saved choice before first paint.

### Shape

- Buttons `rounded-lg`; cards `rounded-xl` with `shadow-card`; dialogs, sheets
  and popovers `rounded-2xl` with `shadow-pop`.
- **One button hierarchy for every role**: primary action `default`
  (`bg-primary`) — approving is a primary action — secondary `outline`,
  tertiary `ghost`, reject and delete `destructive`. No team-coloured and no
  ad-hoc coloured buttons, anywhere.

### Layout

- **Top bar, not a sidebar.** Salesforce-Lightning-style horizontal nav: brand
  left, the role's own items across the middle, and on the right the project
  switcher, "+ New", global search (⌘/Ctrl+K), the notification bell, the role
  switcher and the user menu (theme, Workflow map, Reset demo). The active item
  is `primary` text under a 2px `primary` rule; no team colour in the menu.
- **One modal system, no side sheets.** Everything that is a form or a record
  opens centred through `src/components/ui-app/`: `AppDialog` (sm 420 / md 560 /
  lg 800 / xl 1100, 90vh, sticky header and footer, asks before discarding a
  dirty form), `FormDialog` (Cancel · Save draft · submit, with the reason for a
  disabled submit on hover), `ConfirmDialog` (states the consequence in plain
  words, never "Are you sure?") and `RecordDialog` (xl quick view: number,
  status, team, step, trail, fields, lines, activity, allowed actions, "Open
  full page"). Comparative, Joint Measurement and RA Bill are meant to be
  full-page editors rather than modals.
- **Three documents are full-page editors, not modals**: Comparative, Joint
  Measurement and RA Bill, at `…/new`. They share `FullPageEditor` — compact
  header, full-width line grid, sticky action bar with live totals on the left
  and actions on the right. Enter adds a row, arrows move between grid cells,
  Tab still moves across fields. Drafts autosave every 20 seconds.
- **A project page carries no breadcrumb.** The project header and the two tab
  strips already say where it is. Breadcrumbs survive on masters, ledgers,
  inboxes and the full-page editors, which have no tab strip above them. The
  project header collapses to a 48px sticky bar on scroll, taking the tabs with
  it, so the first table row sits about 540px down at 1440×900.
- **Tab strips never wrap** — `<ScrollStrip>` gives one scrolling row with an
  edge fade and scrolls the active tab into view. A zero-count tab is dimmed
  and inert; the tab you are standing on stays clickable at zero.
- **One chip per row.** `<PositionChip>` says where a record *is* ("With
  Project Head"), with the step code as small type inside it — never a Status
  chip plus an identical gate chip two columns later. Every queue row carries
  `<AgeChip>`: amber past 3 days, red past 7.
- **Zero is never success.** A `success` KPI tone requires a positive figure;
  zero falls back to neutral. Warning and destructive keep their thresholds,
  because zero is the good outcome for those.
- **A multi-project role defaults to "All my projects"**, and the switcher
  filters rather than restricts. `useScopedRows` widens a list to the whole
  posting and `useProjectColumn` adds the Project column; a single-project role
  (Site Engineer, Project QS) gets neither switcher nor column.
- **Row actions are one pattern and always visible**: a primary quick action
  where the row is actionable, ghost "Open" otherwise. Never hover-only — that
  is invisible on a touch screen.
- **Lists go through `<ListPage>`**: status tabs with counts, search, filter
  chips, row click opens the record, quick actions on hover, 25 to a page. An
  empty list renders `<EmptyState>` — an icon, one sentence saying what would
  put something here, and the action that starts it — never a bare "no records".
- **Status labels and tones live in one file**,
  `components/common/status-chip.tsx`. Never render a raw status value, and
  never invent a tone at a call site.
- **Every success toast carries a "View" link** to the record it wrote —
  `useServiceAction`'s `view` option.
- **Every page header** shows a breadcrumb, the title, a one-line description of
  what the page is for, the step-code badge(s) where the chart gives one, the
  owner-team tag, the primary action top-right and an overflow menu for
  secondary actions — `<PageHeader>` / `<ResourcePage>` do this. Pass
  `resource` and the breadcrumb builds itself.
- **Mobile never scrolls horizontally.** `<DataTable>` is a real table from `md`
  up and stacked cards below. Diagrams get their own `overflow-x-auto`.
- **Indian formatting**, always through `src/lib/format.ts`: `₹12,45,000`
  (`formatInr`), `₹1.25 Cr` (`formatInrCompact`), `21 Sep 2026` (`formatDate`).

### What a role sees

Navigation is **relevance-based**, not authority-based:

- `PROJECT_NAV` in `permissions.ts` lists the project pages each role carries in
  its workspace. A tab appears only when the role holds one of its pages, and
  shows only those pages.
- A page left out is **not blocked**. There is no route guard: links from the
  record trail, the Approvals inbox and dashboards all still open it, read-only,
  under a "Viewing <team> record" note (`access.outsideNav` → `<PageHeader>`).
- Pages a role can reach but not change stay fully visible with an
  "Owned by <team>" tag and no create/edit/approve buttons.
- The **Projects list shows only assigned projects** — `assigned_project_ids`.
- **Project Overview is role-specific**: `PROJECT_OVERVIEW_LAYOUTS` in
  permissions.ts, rendered through the same widget registry and the same query
  services as the dashboard, with the scope narrowed to the one project.
- **Each role gets one inbox**, decided by `inboxFor(role)`: an approver gets
  *Approvals* (what waits on them), a role that only raises work gets
  *My Requests* (what they are waiting on, with sent-back and rejected items
  pinned to the top and their comments shown). The nav badge counts actionable
  items for Approvals and sent-back items for My Requests.
- The live workflow chart is its own page, `/workflow`, with a project selector
  — it is a whole-process view, not a project summary.

---

## 5. Build order

Both workflow threads, the dashboards, the live chart and the record trail are
built. Pages not yet reached render a placeholder card instead:

| Prompt | Scope | Status |
|---|---|---|
| 1 | Foundation — architecture, domain, data layer, seed, permissions, shell | done |
| 2 | **The material thread** — A2 indent → A2 approval → B1 comparative → B2 approval → B3–B4 PO → B5–B6 GRN → A5 stock & issue → Budget vs Actual, plus B7 vendor bill → supplier ledger → B8 handover, and Returns | done |
| 3 | **The billing thread** — A1 tasks → A3 DPR → A4 work done → C1 joint measurement → C2 RA bill → C3–C4 certification → C5 handover, plus Issued v. Measured, the contractor running account and the contractor master | done |
| 4 | **Role dashboards, the live workflow chart and the record trail** — seven roles over five layouts, the approved chart drawn live on each project's Overview, and a connected trail on every record | done |
| 5A | **Theme, access and navigation overhaul** — token theme (`docs/theme.css`), status-only colour, team colour as accent, one button hierarchy, dark mode, `/workflow`, relevance-based `PROJECT_NAV`, role-specific Overview, and the Approvals / My Requests split | done |
| 5B | **UX foundations** — Inter and the sans type scale, per-role top bar with + New / search / notifications, the `ui-app` modal system replacing every side sheet, `ListPage` / `PageHeader` / `EmptyState` / `StatusChip`, plain labels for internal values, and the Playwright screenshot audit (`npm run screenshots` → `docs/ux-audit.md`) | done |
| 5C | **Cross-cutting audit fixes** — value-blindness at the data layer, units everywhere, the issued-vs-measured rule, chrome reduction, the status system, BOQ and work-order editing, the three full-page editors, mobile strips, portfolio scope, the portfolio chart and seed depth, attachments, print, and sent-back work surfaced everywhere | done |
| 5D | Role-specific flows — the Site Engineer's "Today", dashboard layouts, nav grouping, and the cross-project Purchase Desk, Daily Reports, Reports and Spend routes | pending |

A route that is not built is hidden with `enabled: false` in `TOP_NAV` rather
than shown behind a placeholder card. There is no dev copy anywhere in the UI —
no prompt numbers, no "coming soon", no "seeded data".

---

## 6. How to add Supabase later

Nothing above the data layer should change.

1. **Repositories.** Create `src/lib/data/supabase/` mirroring
   `src/lib/data/local/`: one `createSupabaseRepositories(client)` returning the
   same `Repositories` interface. Then fill in the `case "supabase":` branch in
   `src/lib/data/index.ts` and set `NEXT_PUBLIC_DATA_SOURCE=supabase`. Because
   every method is already async and the field names already match the columns,
   call sites do not move.
2. **Schema.** Generate the migration from `src/lib/domain/*` — each Zod schema
   is one table, each `*_lines` schema is its child table. Keep snake_case.
3. **Services → server.** Move each function in `src/lib/services/` to a server
   action (or a Postgres RPC where the cascade must be atomic — `postGrn`,
   `approveIndent`, `createComparative`, `createPurchaseOrders`,
   `createVendorBill` and `advanceCertification` all write several tables and
   should be transactional). The exported signatures stay the same, so
   components do not change, and the vitest suite keeps passing against them.
4. **RLS mirrors `permissions.ts`.** `GRANTS`, `VALUE_BLIND` and
   `APPROVAL_CHAINS` are plain data precisely so the policies can be generated
   from them. A role may only `INSERT`/`UPDATE` a table its `GRANTS` entry lists;
   `VALUE_BLIND` becomes a column-level grant or a redacted view; an `Approval`
   row may only be decided by a user holding `required_role` at the current
   `sequence`.
5. **Session.** Replace the internals of `SessionProvider` with
   `supabase.auth.getUser()` plus a `profiles` lookup for the role. Keep
   `useSession(): { user, role, team, setRole, ready }` exactly as it is; the
   role switcher becomes a dev-only affordance.
6. **Reads.** Swap the bodies of `src/lib/hooks/use-repository.ts` for
   react-query or server components. Keep the hook names and return shapes.

---

## 7. Testing

`vitest` covers the services, which is where every rule lives. Each service has
a happy path, a permission failure and a validation failure. Two tests drive a
whole thread end to end:

- `material-thread.test.ts` — A2 → B8, asserting statuses, stock, Budget vs
  Actual and the supplier ledger.
- `billing-thread.test.ts` — A1 → C5, asserting statuses, the revision log, the
  bill arithmetic, the contractor running account and Budget vs Actual.

`queries.test.ts` holds the read services to the seed's own numbers, to project
scoping, and to the rule that a Site Engineer query returns no monetary field at
all. `record-trail.test.ts` walks one full material chain and one full billing
chain from both ends.

`seed.test.ts` holds the seed to its schemas, its reproducibility and its
internal consistency — including that `done_qty` really is the sum of the DPR
entries and that every bill's totals agree with its lines.

Tests start from `resetDemo()`, so they can address seeded records by their
document numbers. Because seed dates follow the clock, tests express dates as
`today()` / `daysAgoDate(n)` rather than literals. Outside the browser the store falls back to an in-memory
`Storage`, so nothing persists between tests.

```bash
npm test          # vitest run
npm run test:watch
```

## 8. Commands

```bash
npm run dev          # next dev --turbopack
npm run build        # must pass with no type errors AND no lint warnings
npm run lint
npm test
npm run screenshots  # Playwright: every role, every screen, to screenshots/
                     # needs `npm run dev` already running; BASE_URL to override
```
