# Live Demo Script — Manas ERP Walkthrough

Verified against the actual source (exact labels, seed data, role wiring). All
six workflows are fully built end to end, so nothing was dropped.

## Pre-demo checklist

1. **User menu (avatar, top-right) → Reset demo → "Reset demo data"** — do this
   once before the client arrives. Full deterministic reseed.
2. You land as **Project Head**, viewing the portfolio. Start from
   **Dashboard** (`/`).
3. Confirm the active project is **Manas Sapphire** — Site Engineer and
   Project QS are hard-pinned to this one project (no switcher for them), so
   stay on it the whole demo.
4. Don't hit Reset Demo again mid-demo — it wipes anything you create live.

## Do-not-click list

- **Today's DPR a second time** — one report per project per day; a repeat
  errors. You get one live take.
- Nav items you don't see (Daily Reports, Reports, Spend, Purchase Desk)
  aren't broken — they're simply not built yet; the same data lives in the
  project workspace pages you're already using.
- Don't open **"New comparative" / "New measurement sheet" / "New RA bill"**
  live — full-page line-grid editors, several minutes of typing. Use existing
  seeded records instead (built into the script below).
- Don't scroll with your cursor resting on a certified-quantity field in
  Certification (a real bug earlier today — now blocked, but avoid as habit).

## Order (~22 min)

| # | Workflow | Role(s) | Est. |
|---|---|---|---|
| 1 | DPR & Labour | Site Engineer | 3 min |
| 2 | Site Indent & Approval | Site Engineer → Project Head | 4 min |
| 3 | Procurement / PO | Purchase Officer → Purchase Head → Purchase Officer | 5 min |
| 4 | GRN & Inventory | Site Engineer | 3 min |
| 5 | Measurement & Bill Certification | Project QS → Project Head | 4 min |
| 6 | Budget vs Actual (closing) | Project Head | 3 min |

Follows the real flow: site reports → material request → buying → receiving →
contractor billing → closes on the number the owner actually watches.

---

## 1. DPR & Labour — Site Engineer

| Step | Click | You should see |
|---|---|---|
| 1 | Land on dashboard (`/`) | Card: **"Today's report is not filed yet"** |
| 2 | **Record DPR & Labour** | Dialog: "Daily progress report" |
| 3 | Set Weather, type a Remark (optional) | — |
| 4 | **Progress**: pick a Work-order line, type Done qty (e.g. `12`) | Line shows work order/done-to-date/balance |
| 5 | **Labour strength**: pick a Contractor, type Head count (e.g. `10`) | — |
| 6 | **File report** | Toast "Report filed for `<date>`"; card disappears |

**Talking point:** 30 seconds a day, and it's the only source everything
downstream (work-done %, billing) is built on.
**Seed:** none — today is never pre-filed.
**Fallback:** close the form, open **Site Execution → DPR** and show the
14-day streak calendar instead.

## 2. Site Indent & Approval — Site Engineer → Project Head

| Step | Click | You should see |
|---|---|---|
| 1 | **Site Execution → Indents** | List, tab "Awaiting approval" |
| 2 | **Raise indent** | Dialog opens |
| 3 | Pick work order, BOQ line, material (e.g. OPC 53 Grade Cement), Quantity `50`, Required by (near date) | Budget/Indented/Balance shown per line |
| 4 | Remarks: "Needed for slab pour next week" | — |
| 5 | **Raise indent** (footer) | Toast "Indent raised" |
| 6 | Role pill → **Project & Budget → Project Head** | — |
| 7 | **Approvals** | Indent sits in "Waiting on you — Project Head" |
| 8 | Click indent / **Review** | Decision sheet, defaults to "Approve as requested" |
| 9 | **Record decision** | Toast "Indent decision recorded" |

**Talking point:** every material request is checked against BOQ budget before
Purchase ever sees it.
**Seed:** none needed; a pending indent already sits in the queue on reset.
**Fallback:** skip raising, go straight to Approvals and approve the
pre-seeded one.

## 3. Procurement / PO — Purchase Officer → Purchase Head → Purchase Officer

| Step | Click | You should see |
|---|---|---|
| 1 | Role pill → **Purchase & Stores → Purchase Officer** | — |
| 2 | **Purchase & Stores → Comparatives** | Row pending approval (seeded) |
| 3 | Role pill → **Purchase Head** | — |
| 4 | **Approvals** → click comparative / **Review** | Vendor rate lines |
| 5 | **Approve** | Toast "Approved — rates are now fixed" |
| 6 | Role pill → **Purchase Officer** | — |
| 7 | **Purchase Orders** → **Generate POs** | Dialog |
| 8 | Pick the approved comparative → **Generate** | Toast "`<PO number>` created" |

**Talking point:** Purchase never picks the vendor alone — a second person
signs off on rate before any order goes out.
**Seed:** a `pending_approval` comparative always exists on reset (CMP-1).
**Fallback:** open Purchase Orders and point at an already-`sent` PO, narrate
the chain verbally.

## 4. GRN & Inventory — Site Engineer

| Step | Click | You should see |
|---|---|---|
| 1 | Role pill → **Site Engineer** | — |
| 2 | **Site Execution → GRN** | "Goods Receipt (GRN)" page |
| 3 | **Receive material** | Dialog |
| 4 | Pick the PO just generated (or any open one) | Line cards: Ordered/Received/Pending |
| 5 | Challan `CH-2026/118`, Vehicle `GA 03 AB 1234`, Received on = today | — |
| 6 | Enter Received qty matching Ordered on one line | Accepted auto-fills |
| 7 | **Post GRN** | Toast "`<GRN number>` posted and added to site stock" |
| 8 | Sub-nav **Stock** | Balance visibly higher |

**Talking point:** stock updates the moment material is signed for at the
gate — this is what the next indent is checked against.
**Seed:** an open PO — the one just made, or always-present seeded ones.
**Fallback:** if no PO in the dropdown, open **Stock** directly and point at
existing balances/low-stock flags.

## 5. Measurement & Bill Certification — Project QS → Project Head

| Step | Click | You should see |
|---|---|---|
| 1 | Role pill → **Project QS** | — |
| 2 | **Certification** | "Waiting on you — Project QS", one bill |
| 3 | Click bill / **Review** | Claimed vs certified lines, matching — don't touch qty fields |
| 4 | **Approve** | Toast "Approved — now with Project Head" |
| 5 | Role pill → **Project Head** | — |
| 6 | **Approvals** → bill / **Review** | Same bill, cross-team marked purple |
| 7 | **Approve** | Toast "Approved — now with QS Head" |

**Stop here** — don't chase it to QS Head/HoD, adds nothing visual.
**Talking point:** a contractor's bill moves through four separate checks,
each logged permanently; disputed quantities need a mandatory comment and
stay in the record forever.
**Seed:** none — a bill at Project QS's step always exists on reset.
**Fallback:** open **RA Bills**, pick any `in_certification` bill, narrate
against whatever step it's actually on.

## 6. Budget vs Actual (closing) — Project Head

| Step | Click | You should see |
|---|---|---|
| 1 | **Project & Budget → Budget vs Actual** | KPI row, tabs Total/Material/Contractor |
| 2 | **Needs attention (N)** | Filters to over/near-budget lines |
| 3 | **Open** on a flagged row | Budget/actual breakdown detail |

**Talking point:** every rupee committed via a work order or spent on
material rolls up here live, against the original BOQ. Amber past 80%, red
past budget.
**Seed:** none — Manas Sapphire is seeded at 65% consumed, real variance
already exists.
**Fallback:** none needed — pure read page, nothing to fail.
