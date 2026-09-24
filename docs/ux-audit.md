# UX audit — Manas Developers ERP

Against the screenshots in `screenshots/`, captured by `npm run screenshots`:
seven roles at 1440×900, plus the Site Engineer at 390×844, covering every
enabled top-bar route, every page of each role's project workspace, and each
role's create dialogs.

**Status as of the cross-cutting fix pass.** Each finding carries its outcome
directly under the heading: ✅ fixed, 🟡 partly fixed, ⬜ not fixed with the
reason. The cross-cutting findings (C1–C9) were the scope of that pass and are
all closed; role-specific flows are later prompts, and the findings that depend
on them say so.

The screenshots referenced below are the originals that produced the findings.
`npm run screenshots` regenerates them against the current build.

Two things in the pictures are not the app: the dark circle marked *N* floating
at the left edge is Next.js's dev-mode indicator (the capture ran against
`next dev`), and any `?new=1` in the address is how the harness opens a create
dialog.

---

## Cross-cutting — every role

### C1. The Site Engineer is shown money he is not allowed to see

> ✅ **Fixed.** Value-blindness moved to the data layer. `redactMoney` at `queries/index.ts` strips every monetary field from a payload whose role fails `can(role, "view", "rates")` — removed, not zeroed, so `"value" in row` is false. 12 monetary fields across 21 queries were reaching a Site Engineer and now do not. The project header takes its figures from `getProjectHeaderStats`, which returns progress, days to target, open indents and deliveries due instead of budget and spend, so the header has no money to leak. `useMoneyLeakCheck` shouts in dev if any of it comes back, and `value-blindness.test.ts` fails the build if it does.
`screenshots/site_engineer/*` — every project page

The pinned project header prints **BUDGET ₹6.31 Cr · SPENT ₹3.02 Cr** to the
Site Engineer. `VALUE_BLIND` covers `rates`, `suppliers`, `comparatives`, POs,
vendor bills, the supplier ledger, GRN and stock — but the project header card
is not gated by anything, so the single largest number in the app leaks on
every screen he opens. The value-blindness rule is either real or it is not.

### C2. Quantities are summed across units and printed without one

> ✅ **Fixed.** A `<Qty>` component that cannot render a unit-less number, and `<LineCount>` for the mixed-unit case: the indents list shows "6 lines" with "120 bag · 42.5 cum · 900 rmt" on hover, and the same on measurements. Every column on the stock table now carries its unit.
`site_engineer/nav-indents.png`, `project_qs/nav-measurements.png`,
`site_engineer/nav-stock.png`

- Indents list, **REQUESTED 266 / 2,747 / 5,674** — the sum of bags, brass and
  rmt on one indent. The number is arithmetically valid and physically
  meaningless.
- Measurements, **MEASURED 2,096.4 / 243.6** — cum and sqm added together.
- Stock, **RECEIVED / ISSUED / REORDER LEVEL** carry no unit while **ON SITE**
  does, in the same row.

The design rule is "quantities always with unit". Either show the unit or show
a line count instead of a sum.

### C3. Six rows of chrome before the first datum on a project page

> ✅ **Fixed.** The breadcrumb is gone from every page inside the project workspace — the tab strips already say where it is — and survives only on masters, ledgers and the full-page editors. Title, step badge and owner tag merged into one row with the description as helper text; the project header collapses to a 48px sticky bar on scroll, carrying the tabs with it. **Measured at 1440×900: first table row 669px → 544px on Measurements, 590px → 442px on RA bills.** The audit overstated this one: the first row was above the fold before, but only about 4 rows fit; about 7 do now.
`project_qs/nav-measurements.png`, `site_engineer/nav-stock.png`

Project header card → workspace tabs → page tabs → breadcrumb → step badge and
team tag → h1 → description. The breadcrumb repeats the workspace tabs word for
word (*Projects › Manas Sapphire › Billing & Certification › Joint
Measurements* sits directly under tabs reading the same). On a 900px viewport
the table starts below the fold.

### C4. Zero is painted as good news

> ✅ **Fixed.** A `success` tone on a KPI now requires a positive figure; a zero falls back to neutral muted. Warning and destructive keep their thresholds, because zero is the *good* outcome for those.
`hod/nav-dashboard.png`, `qs_head/nav-dashboard.png`

**CERTIFIED THIS MONTH 0 / ₹0** and **SENT TO ACCOUNTS 0 / ₹0** render in
`success` green. Nothing certified this month is not a success; status colour
is supposed to mean good / attention / wrong, and a zero here means neither.

### C5. No create dialog behind two primary buttons

> ✅ **Fixed.** `createBoqLine` and `createWorkOrder` services, and the two dialogs behind them. The BOQ form carries the material allowances the line needs to be indentable; the work-order form lists the BOQ lines in the contractor's trade with the BOQ rate beside the agreed one, and refuses a rate above it.
`project_head/dialog-boq.png`, `project_head/dialog-work_orders.png`

"Add BOQ line" and "New work order" appear in the "+ New" menu and as page
actions, and neither opens anything — the screenshots are of an unchanged list.
A primary action that does nothing is worse than an absent one.

### C6. The full-page editors called for are still modals

> ✅ **Fixed.** All three are full-page editors now: `/purchase/comparatives/new`, `/billing/measurements/new`, `/billing/ra-bills/new`. Shared `FullPageEditor` shell — compact header, full-width line grid, sticky action bar with live totals left and actions right. Enter adds a row, arrows move between cells, Tab still moves across fields. Drafts autosave every 20 seconds with a "Saved 12:04" indicator.
`purchase_officer/dialog-comparatives.png`, `project_qs/dialog-measurements.png`,
`project_qs/dialog-ra_bills.png`

Comparative, Joint Measurement and RA Bill are the three documents with line
items, running totals and several minutes of data entry. All three still open
in a dialog capped at 90vh, so the line grid scrolls inside a box inside a
page. They were specified as full-page editors with a sticky totals bar.

### C7. Disabled submit gives no reason where the form is not a `FormDialog`

> ✅ **Fixed.** `SubmitButton` — the reason-on-hover control that was inside `FormDialog` — is exported and used by the hand-built footers too. Every disabled primary action in the app now says why.
`purchase_officer/dialog-comparatives.png`

"Submit for approval" is disabled on an empty comparative with nothing saying
why. `FormDialog` carries the reason tooltip, but the migrated forms kept their
own footers and so lost it. The same applies to the GRN, vendor bill and
measurement dialogs.

### C8. Status chip and gate chip say the same thing twice

> ✅ **Fixed.** One `PositionChip` replaces the Status + gate pair: it says where the record actually is ("With Project Head") with the step code as small type inside the chip.
`site_engineer/nav-indents.png`, `project_head/workspace-indent_approval.png`

Every indent row carries **STATUS: Awaiting approval** and, two columns later,
**A2 GATE: Pending**. Two chips, one fact, and on the mobile card they stack
directly on top of each other.

### C9. Document numbers wrap mid-token

> ✅ **Fixed.** `whitespace-nowrap` on every document-number column, and `Qty` never wraps either.
`project_qs/nav-measurements.png`

`MSP/JM/26-` / `27/0010` across two lines in a narrow column. A document number
is a single atom to anyone scanning for one.

---

## Site Engineer — the only role on a phone

### S1. Status tabs wrap into three rows at 390px

> ✅ **Fixed.** `ScrollStrip` owns the behaviour: one row, no wrap, a fade on whichever edge has more content, and the active tab scrolled into view on mount.
`site_engineer-mobile/nav-indents.png`

`All 8 · Awaiting approval 2 · Approved 2 · With purchase 4 · Received 0 ·
Rejected 0` wraps to three lines and pushes the list another 90px down.
`ListPage` sets both `flex-wrap` and `overflow-x-auto`; wrap wins, so the
intended horizontal scroll never happens.

### S2. Workspace tab strip is clipped with no scroll affordance

> ✅ **Fixed.** Same component on both workspace strips, so the active tab is never the one clipped.
`site_engineer-mobile/*`

"Site Execu…" runs off the right edge. The strip does scroll, but nothing on
screen says so — no fade, no chevron, and the active tab is the one being cut.

### S3. Empty tabs are offered as destinations

> ✅ **Fixed.** A zero-count tab renders dimmed and `disabled`. The tab you are standing on stays clickable at zero, or there would be no way out of it.
`site_engineer-mobile/nav-indents.png`

"Received 0" and "Rejected 0" are tappable and lead to an empty table. On a
phone, where every tap costs a screen, a zero tab should be dimmed or dropped.

### S4. "Today" is the dashboard, and does not look like a day

> ⬜ **Not fixed.** Role-specific dashboard design is a later prompt. "Today" still lands on the standard dashboard.
`site_engineer/nav-today.png`

The bar item is labelled *Today* and lands on the same portfolio-style
dashboard every other role gets — KPI row, action list, widget grid. Nothing on
it is organised by today: no "DPR not filed yet", no deliveries expected this
morning, no tasks running now, at the top.

### S5. Daily Reports is hidden but DPR is the role's core daily job

> ⬜ **Not fixed.** Needs a cross-project Daily Reports route, which does not exist yet.
Hidden per the nav config, so filing a DPR is only reachable by going Material →
… no — by opening the project workspace and finding the DPR tab. The one thing
this role does every single evening takes four taps from the bar.

---

## Project Head

### P1. "Variance 97.0%" is labelled two different things

> 🟡 **Partly fixed.** The tone no longer lies — 97% budget-remaining is not painted as success unless it is positive (C4). The label still reads "Variance" over a caption reading "Budget remaining"; renaming it belongs with the dashboard redesign.
`project_head/nav-dashboard.png`

The tile header reads **VARIANCE**, the figure reads **97.0%** in success green,
and the caption underneath reads **Budget remaining**. Variance and budget
remaining are not the same quantity, and a reader cannot tell which the 97% is.

### P2. BOQ overrun rows do not say which project they are on

> ⬜ **Not fixed.** The widget still omits the project name. Project-head dashboard widgets are a later prompt.
`project_head/nav-dashboard.png`

"BOQ lines over budget" lists **BOQ-14 Internal plumbing…** twice — once at
156% and once at 113%. They are the same line on two different projects, and
the widget shows neither name. The Project Head is posted to two projects; this
is the one widget where the project matters most.

### P3. "Issued vs measured" reports 100% overrun where nothing was measured

> ✅ **Fixed.** A line with `measured_qty = 0` is `state: "not_measured"` — `variance_qty` and `variance_percent` are null and `is_flagged` is false. A line with `issued_qty = 0` is excluded outright.
`project_head/nav-dashboard.png`, `project_qs/nav-measurements.png`

`480 vs 0 rmt`, `380 vs 0 rmt`, `600 vs 0 bag` all render as **100%** with a
destructive icon. Measured is zero because the work has not been measured yet,
not because material was wasted. Four genuine flags are buried among these.

### P4. The full Issued-vs-measured panel lists every BOQ line

> ✅ **Fixed.** The panel is a `ListPage` with Flagged / Not yet measured / Within tolerance tabs, paginated at 25, and under-consumption is behind a "Show all lines" toggle that is off by default. The caption counts exactly the flagged rows.
`project_qs/nav-measurements.png`

The panel caption says "4 materials drawn more than 5% above the measured work"
and then prints 28 rows, 24 of them at **−100.0%** — lines where nothing has
been issued at all. Using less than budgeted is explicitly good news and should
not be on screen. No pagination either; the panel is not a `ListPage`.

### P5. Budget menu is three pages deep for the role's own work

> ⬜ **Not fixed.** Nav ordering is a later prompt.
`project_head/nav-boq.png`

BOQ, Work Orders and Budget vs Actual sit behind a dropdown, while Contractors —
a master the Project Head touches far less often — has a top-level slot.

---

## Purchase Officer

### PO1. Seven nav items do not fit the bar at 1440px

> ✅ **Fixed.** The bar scrolls rather than wraps, and `ScrollStrip`'s edge fade now says there is more.
`purchase_officer/nav-vendor-bills.png`

The bar now scrolls instead of wrapping (the earlier capture had "Vendor Bills"
and "My Requests" broken across two lines inside a 56px bar), but "My Requests"
is still clipped to "My Req" at 1440px, and the clip has no affordance — no
fade, no chevron. The Purchase Officer is the widest bar in the app: six items
plus the project switcher, "+ New", search, bell, role and avatar.

### PO2. "1 bills failing the three-way match"

> ✅ **Fixed.** `countOf` / `countVerb` in `format.ts`, applied to the captions that were counting wrong.
`purchase_officer/nav-vendor-bills.png`

Table caption, unpluralised. The same pattern appears in the indents, returns
and measurements captions.

### PO3. Purchase Desk is hidden, so the role's main queue has no home

> ⬜ **Not fixed.** Needs the cross-project Purchase Desk route.
Comparatives, Approval to Purchase and Purchase Orders are only reachable
through a project workspace, one project at a time. The Purchase Officer is
posted to the whole portfolio; there is no screen that answers "what is waiting
for me to buy, anywhere".

### PO4. "Deliveries" points at another team's page with no explanation

> ⬜ **Not fixed.** Role-specific nav is a later prompt.
`purchase_officer/nav-deliveries.png`

The bar item lands on the GRN page, which is owned by Site Execution and opens
read-only under an "Owned by Site Execution" tag. The reader clicked their own
menu and arrived somewhere they cannot act.

### PO5. L1 column shows "—" on most rows with no legend

> ✅ **Fixed.** The column reads "L1 on every line", "Not L1 on 2 lines (+₹4,200)" or "Not evaluated" — never a bare dash.
`purchase_officer/nav-vendor-bills.png`, comparatives list

A column headed **NOT L1** full of em-dashes. Nothing says whether "—" means
"is L1", "not evaluated" or "no quotes".

---

## Purchase Head

### PH1. The role has five items and three of them are read-only

> ⬜ **Not fixed.** Depends on the Purchase Desk and Spend routes.
Dashboard, Approvals, Suppliers (master + ledger) — and Purchase Desk and Spend
are both hidden. The only thing this role can actually do is approve, and
approving is reachable in one place. The bar is mostly decoration.

### PH2. No spend view at all

> ⬜ **Not fixed.** Same.
`purchase_head/nav-dashboard.png`

The dashboard carries "Spend by category" and "L1 adherence" widgets, and the
Spend nav item is hidden, so there is no way to go deeper on either. Both
widgets are dead ends.

---

## Project QS

### Q1. The "Sign" action is a permanent column, not a quick action

> ✅ **Fixed.** One row-action pattern everywhere: a primary quick action where the row is actionable, ghost "Open" otherwise, and always visible — never hover-only, which was invisible on a touch screen.
`project_qs/nav-measurements.png`

A primary-filled **Sign** button sits in the last column of row 1 while every
other row shows a ghost **Open**. Elsewhere in the app row actions appear on
hover. Two patterns for the same slot, and the most consequential button in the
billing thread is the one that breaks the rule.

### Q2. "Not billed" and a bill number share a column

> ✅ **Fixed.** Split into a Status chip and an "RA bill no." column.
`project_qs/nav-measurements.png`

**BILLED ON** holds either `MSP/RA/WO-003/RA-02` or the words "Not billed". A
status and an identifier in one column cannot be sorted or scanned.

### Q3. Excess flag has no magnitude

> ✅ **Fixed.** The flag carries its magnitude — "+12%" — rather than "Yes".
`project_qs/nav-measurements.png`

**EXCESS: ⚠ Yes** — against what, and by how much? The reader has to open the
sheet to find out whether it is 1% or 60%.

### Q4. Contractors dropdown for a role that measures

> ⬜ **Not fixed.** Nav ordering is a later prompt.
Measurements and RA Bills are top-level, correctly. But Contractor Master sits
in a dropdown with Contractor Ledger, and the QS reads the ledger far more often
than they edit the master — the less-used page is the dropdown's default target.

---

## QS Head

### QH1. "Bills" holds three pages that are three views of one thing

> ⬜ **Not fixed.** Merging the three bill views is a later prompt.
`qs_head/nav-ra-bills.png`, `nav-certification.png`, `nav-handed-over.png`

RA Bills, Certification and Handed Over are the same bills at three statuses.
Now that RA Bills and Certification both carry status tabs, the three pages
overlap almost completely — a bill appears on all three.

### QH2. Approvals inbox and the Certification page are the same queue

> ⬜ **Not fixed.** Same.
`qs_head/nav-approvals.png` vs `nav-certification.png`

Both open on "what is waiting on the QS Head", with different columns and
different actions. Nothing says which one to use.

### QH3. No project column on a portfolio role's bill list

> ✅ **Fixed.** "All my projects" is the default for every multi-project role, and the switcher filters rather than restricts. `useScopedRows` widens the list and `useProjectColumn` adds the Project column; single-project roles get neither switcher nor column.
`qs_head/nav-ra-bills.png`

The QS Head covers all three projects, and the RA Bills page resolves to
whichever project the switcher last pointed at, with no "all projects" option
and no project column. Bills from the other two are simply absent, silently.

---

## HoD

### H1. The portfolio bars cannot show the data they are given

> ✅ **Fixed.** One progress bar per project, measured against its own budget, with material and certified stacked inside it and the percentage beside the amounts — no shared axis, so a 0.3% ratio is no longer a one-pixel stub. The seed also has real depth now: Manas Sapphire 66.7% consumed, Manas Greens 28.9%, Manas Heights 8.3%, against targets of 65 / 30 / 8.
`hod/nav-dashboard.png`

Manas Sapphire: budget ₹7.45 Cr, material ₹4.88 L, certified ₹19.88 L. The
budget bar runs the full width; material and certified are one-pixel stubs. The
ratio is roughly 0.3%, which no bar chart on a shared axis can render. The
figures beside them are doing all the work.

### H2. The KPI row and "Needs your action" carry the same number

> ⬜ **Not fixed.** Dashboard layout is a later prompt.
`hod/nav-dashboard.png`

**AWAITING MY APPROVAL 3** sits directly above **Needs your action — 3 items**.
The second is the useful one; the first costs a quarter of the KPI row.

### H3. "Stuck over 7 days" is twelve rows and no way to act

> 🟡 **Partly fixed.** Every queue row now carries its age through `AgeChip`, amber past 3 days and red past 7. The rows still have no action on them; reassignment is a later prompt.
`hod/nav-dashboard.png`

Twelve bills, ages 19–40 days, each naming who is holding it — and no way to
nudge, reassign or even open the holder's queue from the row. The most
actionable information on the HoD's screen has no action.

### H4. Accounts Handover is filed under "Ledgers"

> ⬜ **Not fixed.** Nav grouping is a later prompt.
`hod/nav-ledgers.png`

It is a handover queue, not a ledger. The dropdown is the only place an HoD can
find it, under the wrong noun.

### H5. Reports is hidden, and three of the HoD's five items are inboxes

> ⬜ **Not fixed.** Needs the Reports route.
Dashboard, Approvals, Projects, Ledgers — for the role that is meant to read
across the portfolio, there is no report, no trend, and no period comparison
anywhere.

---

## Summary by weight

| # | Finding | Outcome |
|---|---|---|
| 1 | C1 Budget and spend leak to the value-blind Site Engineer | ✅ Fixed at the data layer; 12 fields across 21 queries were leaking |
| 2 | C2 Quantities summed across units, printed without one | ✅ Fixed — `Qty` / `LineCount` |
| 3 | P3/P4 Issued-vs-measured drowns 4 real flags in 24 false ones | ✅ Fixed — unmeasured lines carry no variance |
| 4 | C5 Two primary buttons open nothing | ✅ Fixed — BOQ line and work order services + dialogs |
| 5 | C6 The three long-form documents are still modals | ✅ Fixed — three full-page editors |
| 6 | S1/S2 Phone: tabs wrap, workspace strip clipped | ✅ Fixed — `ScrollStrip` |
| 7 | H1 Portfolio bars cannot render a 0.3% ratio | ✅ Fixed — per-project progress bars, and real seed depth |
| 8 | QH3 Portfolio roles see one project with no way to widen | ✅ Fixed — "All my projects" is the default |
| 9 | C3 Six rows of chrome before the first datum | ✅ Fixed — 669px → 544px to the first row |
| 10 | PO3/PH1 Purchase roles have no cross-project queue | ⬜ Needs the Purchase Desk route |
| 11 | C4 Zero rendered as success | ✅ Fixed |
| 12 | P1 "Variance" labelled "Budget remaining" | 🟡 Tone fixed, label still wrong |
| 13 | C7 Disabled submit with no stated reason | ✅ Fixed — `SubmitButton` everywhere |
| 14 | C8 Status and gate chips duplicate | ✅ Fixed — `PositionChip` |
| 15 | H3/QH2 Stuck-bill and approval queues have no action | 🟡 Age now shown; actions are a later prompt |

## What this pass added beyond the audit

Three things the audit did not cover, because they were absent rather than
wrong:

- **Attachments.** An `Attachment` entity and an upload control on the GRN
  (challan photograph), DPR (site photographs), vendor bill (supplier invoice),
  joint measurement (signed sheet) and comparative (vendor quotes). The demo
  records a file's name, type and size and stores no bytes — every row says
  "demo: not stored" rather than offering a download that would 404.
- **Print.** `data-print-area` and a shared `PrintButton`, so comparatives,
  measurement sheets and both ledger statements print as well as the PO and RA
  bill already did.
- **Sent-back work, everywhere.** It already reached the bell and My Requests;
  it now opens the raiser's dashboard as a banner with the decision comment
  readable without opening the record.
