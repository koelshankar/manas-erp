"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, NativeSelect, Qty, SectionHeading, Warning } from "@/components/common";
import { SubmitButton } from "@/components/ui-app";
import { MaterialPicker } from "@/components/material/material-picker";
import {
  EditorTotal,
  FullPageEditor,
  cellProps,
  useAutosave,
  useGridKeys,
} from "@/components/editor";
import {
  useAccess,
  useActor,
  useAllRows,
  useLookups,
  useProjectRows,
  useServiceAction,
} from "@/lib/hooks";
import {
  createPurchaseOrder,
  submitPurchaseOrder,
  updatePurchaseOrder,
  type PurchaseOrderInput,
} from "@/lib/services/po-service";
import { poCharges, scheduledBalance } from "@/lib/services/po-math";
import { composePoTerms, PO_VARIABLE_DEFAULTS } from "@/lib/services/po-terms";
import { countOf, formatInr, formatNumber, rupeesInWords } from "@/lib/format";
import { today } from "@/lib/clock";
import type {
  BoqLine,
  Comparative,
  ComparativeLine,
  Indent,
  IndentLine,
  Material,
  PoClause,
  PoDeliverySchedule,
  PoDeliveryScheduleLine,
  PoLine,
  PoTerm,
  PurchaseOrder,
  Quote,
  Supplier,
} from "@/lib/domain";
import { poVariableFieldLabel } from "@/config/labels";
import { cn } from "cn";

/**
 * B3 — the purchase order editor, full page.
 *
 * A PO is the longest document in the build: a header, an indent list, a priced
 * line grid, an additional-charges block, one or more delivery schedules and a
 * numbered clause list. None of that fits a dialog capped at 90vh, so it joins
 * the comparative, the measurement sheet and the RA bill as a full-page editor.
 *
 * Three routes in, all three the same editor:
 *
 *   indents       consolidate approved indent lines — one order may carry many
 *   comparative   an approved comparative's winning vendor and rates
 *   blank         nothing above it, so it is the only route that picks its own
 *                 material and BOQ line
 *
 * Where a line has a document above it the material, unit and BOQ attribution
 * are inherited and shown read-only. That is the Phase 3 rule: a PO line never
 * re-picks what the site indented.
 */

type Source = "indents" | "comparative" | "blank";

type LineDraft = {
  key: string;
  indent_line_id: string | null;
  comparative_line_id: string | null;
  /** Only a blank line carries its own; otherwise inherited. */
  material_id: string;
  boq_line_id: string;
  ordered_qty: string;
  rate: string;
  gst_percent: string;
  freight_amount: string;
};

type ScheduleDraft = {
  key: string;
  title: string;
  is_balance: boolean;
  note: string;
  lines: Array<{ key: string; line_key: string; quantity: string; delivery_date: string }>;
};

let seq = 0;
const nextKey = () => `d${++seq}`;

function blankLine(): LineDraft {
  return {
    key: nextKey(),
    indent_line_id: null,
    comparative_line_id: null,
    material_id: "",
    boq_line_id: "",
    ordered_qty: "",
    rate: "",
    gst_percent: "18",
    freight_amount: "0",
  };
}

export function PoEditor({
  projectId,
  /** The draft being edited, or undefined for a new order. */
  existing,
}: {
  projectId: string;
  existing?: PurchaseOrder;
}) {
  const access = useAccess("purchase_orders");
  const router = useRouter();
  const lookup = useLookups();
  const actor = useActor();
  const { run, pending } = useServiceAction();
  const onKeyDown = useGridKeys();

  const indents = useProjectRows("indents", projectId) as Indent[];
  const indentLines = useProjectRows("indent_lines", projectId) as IndentLine[];
  const comparatives = useProjectRows("comparatives", projectId) as Comparative[];
  const comparativeLines = useProjectRows("comparative_lines", projectId) as ComparativeLine[];
  const quotes = useProjectRows("quotes", projectId) as Quote[];
  const poRows = useProjectRows("purchase_orders", projectId) as PurchaseOrder[];
  const poLines = useProjectRows("po_lines", projectId) as PoLine[];
  const storedSchedules = useProjectRows("po_delivery_schedules", projectId) as PoDeliverySchedule[];
  const storedScheduleLines = useProjectRows(
    "po_delivery_schedule_lines",
    projectId,
  ) as PoDeliveryScheduleLine[];
  const storedTerms = useProjectRows("po_terms", projectId) as PoTerm[];
  const suppliers = useAllRows("suppliers") as Supplier[];
  const materials = useAllRows("materials") as Material[];
  const boqLines = useProjectRows("boq_lines", projectId) as BoqLine[];
  const clauses = useAllRows("po_clauses") as PoClause[];

  const [source, setSource] = useState<Source>("indents");
  const [supplierId, setSupplierId] = useState("");
  const [comparativeId, setComparativeId] = useState("");
  const [poDate, setPoDate] = useState(today());
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [schedules, setSchedules] = useState<ScheduleDraft[]>([]);
  const [transport, setTransport] = useState("0");
  const [freightGst, setFreightGst] = useState("18");
  const [address, setAddress] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [validity, setValidity] = useState("");
  const [warranty, setWarranty] = useState("");
  const [brandTerms, setBrandTerms] = useState("");
  const [clauseIds, setClauseIds] = useState<string[]>([]);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  /** The id once a new order has been saved as a draft, so a second save edits it. */
  const [savedId, setSavedId] = useState<string | null>(existing?.id ?? null);

  const live = savedId ? (poRows.find((p) => p.id === savedId) ?? null) : null;

  /* --- loading an existing draft back into the form -------------------- */
  const loadedFor = existing?.id ?? "";
  useEffect(() => {
    if (!existing) return;
    const own = poLines.filter((l) => l.purchase_order_id === existing.id);
    if (own.length === 0) return;
    setSource(existing.comparative_id ? "comparative" : own.some((l) => l.indent_line_id) ? "indents" : "blank");
    setSupplierId(existing.supplier_id);
    setComparativeId(existing.comparative_id ?? "");
    setPoDate(existing.po_date);
    setTransport(String(existing.transportation_charge));
    setFreightGst(String(existing.freight_gst_percent));
    setAddress(existing.delivery_address);
    setContactName(existing.delivery_contact_name);
    setContactPhone(existing.delivery_contact_phone);
    setPaymentTerms(existing.payment_terms);
    setValidity(existing.po_validity);
    setWarranty(existing.warranty);
    setBrandTerms(existing.brand_terms);

    const keyByLineId = new Map<string, string>();
    setLines(
      own.map((l) => {
        const key = nextKey();
        keyByLineId.set(l.id, key);
        return {
          key,
          indent_line_id: l.indent_line_id,
          comparative_line_id: l.comparative_line_id,
          material_id: l.material_id,
          boq_line_id: l.boq_line_id,
          ordered_qty: String(l.ordered_qty),
          rate: String(l.rate),
          gst_percent: String(l.gst_percent),
          freight_amount: String(l.freight_amount),
        };
      }),
    );
    setSchedules(
      storedSchedules
        .filter((s) => s.purchase_order_id === existing.id)
        .sort((a, b) => a.sequence - b.sequence)
        .map((s) => ({
          key: nextKey(),
          title: s.title,
          is_balance: s.is_balance,
          note: s.note,
          lines: storedScheduleLines
            .filter((l) => l.po_delivery_schedule_id === s.id)
            .map((l) => ({
              key: nextKey(),
              line_key: keyByLineId.get(l.po_line_id) ?? "",
              quantity: String(l.quantity),
              delivery_date: l.delivery_date ?? "",
            })),
        })),
    );
    const own_terms = storedTerms.filter((t) => t.purchase_order_id === existing.id);
    setClauseIds(own_terms.map((t) => t.po_clause_id).filter((x): x is string => Boolean(x)));
    setOverrides(
      Object.fromEntries(
        own_terms
          .filter((t) => t.is_overridden && t.po_clause_id)
          .map((t) => [t.po_clause_id as string, t.text]),
      ),
    );
    // Loading happens once per draft; the row arrays change identity on any write.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedFor]);

  /* --- defaults from the library and the project ----------------------- */
  const activeClauses = useMemo(
    () => [...clauses].filter((c) => c.is_active).sort((a, b) => a.sequence - b.sequence),
    [clauses],
  );
  useEffect(() => {
    if (existing || activeClauses.length === 0 || clauseIds.length > 0) return;
    setClauseIds(activeClauses.filter((c) => c.is_default).map((c) => c.id));
    setPaymentTerms((v) => v || PO_VARIABLE_DEFAULTS.payment_terms);
    setValidity((v) => v || PO_VARIABLE_DEFAULTS.po_validity);
    setWarranty((v) => v || PO_VARIABLE_DEFAULTS.warranty);
    setBrandTerms((v) => v || PO_VARIABLE_DEFAULTS.brand);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClauses, existing]);

  /* --- what each source offers ---------------------------------------- */

  /** Approved indent lines with quantity still to order. */
  const availableIndentLines = useMemo(() => {
    const ready = new Set(
      indents
        .filter((i) =>
          ["approved", "partially_approved", "in_comparative", "po_raised", "partially_received"].includes(
            i.status,
          ),
        )
        .map((i) => i.id),
    );
    return indentLines.filter((l) => {
      if (!ready.has(l.indent_id)) return false;
      const approved = l.approved_qty ?? 0;
      return approved > 0 && approved - l.ordered_qty > 0.0005;
    });
  }, [indents, indentLines]);

  const approvedComparatives = useMemo(
    () => comparatives.filter((c) => c.status === "approved"),
    [comparatives],
  );

  /** Suppliers the chosen comparative awarded lines to. */
  const comparativeSuppliers = useMemo(() => {
    if (!comparativeId) return [];
    const ids = new Set(
      comparativeLines
        .filter((l) => l.comparative_id === comparativeId && l.selected_supplier_id)
        .map((l) => l.selected_supplier_id as string),
    );
    return suppliers.filter((s) => ids.has(s.id));
  }, [comparativeId, comparativeLines, suppliers]);

  /** Pulls the winning lines for the chosen comparative and supplier. */
  function loadFromComparative(comparative_id: string, supplier_id: string) {
    const quoteById = new Map(quotes.map((q) => [q.id, q]));
    const won = comparativeLines.filter(
      (l) => l.comparative_id === comparative_id && l.selected_supplier_id === supplier_id,
    );
    setLines(
      won.map((l) => {
        const quote = l.selected_quote_id ? quoteById.get(l.selected_quote_id) : undefined;
        return {
          key: nextKey(),
          indent_line_id: l.indent_line_id,
          comparative_line_id: l.id,
          material_id: l.material_id,
          boq_line_id: l.boq_line_id,
          ordered_qty: String(l.quantity),
          rate: String(quote?.rate ?? ""),
          gst_percent: String(quote?.gst_percent ?? 18),
          freight_amount: String(quote?.freight_amount ?? 0),
        };
      }),
    );
    setSchedules([]);
  }

  function addIndentLine(indent_line_id: string) {
    const il = indentLines.find((l) => l.id === indent_line_id);
    if (!il) return;
    const material = materials.find((m) => m.id === il.material_id);
    setLines((d) => [
      ...d,
      {
        key: nextKey(),
        indent_line_id,
        comparative_line_id: null,
        material_id: il.material_id,
        boq_line_id: il.boq_line_id,
        ordered_qty: String(Math.round(((il.approved_qty ?? 0) - il.ordered_qty) * 1000) / 1000),
        rate: "",
        gst_percent: String(material?.gst_percent ?? 18),
        freight_amount: "0",
      },
    ]);
  }

  function patchLine(key: string, change: Partial<LineDraft>) {
    setLines((d) => d.map((l) => (l.key === key ? { ...l, ...change } : l)));
  }

  function removeLine(key: string) {
    setLines((d) => d.filter((l) => l.key !== key));
    setSchedules((s) =>
      s.map((sch) => ({ ...sch, lines: sch.lines.filter((l) => l.line_key !== key) })),
    );
  }

  /* --- the numbers ----------------------------------------------------- */
  const supplier = suppliers.find((s) => s.id === supplierId);
  const charges = poCharges(
    lines.map((l) => ({
      ordered_qty: Number(l.ordered_qty) || 0,
      rate: Number(l.rate) || 0,
      gst_percent: Number(l.gst_percent) || 0,
      freight_amount: Number(l.freight_amount) || 0,
    })),
    {
      transportation_charge: Number(transport) || 0,
      freight_gst_percent: Number(freightGst) || 0,
      supplier_state: supplier?.state ?? "Goa",
    },
  );

  const balances = scheduledBalance(
    lines.map((l) => ({ id: l.key, ordered_qty: Number(l.ordered_qty) || 0 })),
    schedules.flatMap((s) =>
      s.lines.map((l) => ({ po_line_id: l.line_key, quantity: Number(l.quantity) || 0 })),
    ),
  );
  const overScheduled = lines.filter((l) => (balances.get(l.key)?.balance_qty ?? 0) < -0.0005);
  const unscheduled = lines.filter((l) => (balances.get(l.key)?.balance_qty ?? 0) > 0.0005);

  const previewTerms = composePoTerms(
    activeClauses.filter((c) => clauseIds.includes(c.id)),
    {
      payment_terms: paymentTerms,
      po_validity: validity,
      warranty: warranty,
      brand: brandTerms,
    },
    overrides,
  );

  /* --- validity -------------------------------------------------------- */
  const invalidReason = useMemo(() => {
    if (!access.canCreate) return "Only the Purchase Officer raises a purchase order.";
    if (!supplierId) return "Pick the supplier this order goes to.";
    if (lines.length === 0) return "Add at least one line.";
    for (const [i, l] of lines.entries()) {
      if (!(Number(l.ordered_qty) > 0)) return `Line ${i + 1} needs a quantity.`;
      if (access.showValues && !(Number(l.rate) > 0)) return `Line ${i + 1} needs a rate.`;
      if (!l.indent_line_id && !l.comparative_line_id) {
        if (!l.material_id) return `Line ${i + 1} needs a material.`;
        if (!l.boq_line_id) return `Line ${i + 1} needs the BOQ line it is against.`;
      }
    }
    if (overScheduled.length > 0) {
      return "A delivery schedule promises more than the order carries.";
    }
    for (const s of schedules) {
      if (s.is_balance) continue;
      if (s.lines.some((l) => !l.delivery_date)) return "Every dated schedule line needs a date.";
    }
    return undefined;
  }, [access.canCreate, access.showValues, supplierId, lines, overScheduled, schedules]);

  /* --- saving ---------------------------------------------------------- */
  function payload(): PurchaseOrderInput {
    const index = new Map(lines.map((l, i) => [l.key, i]));
    return {
      project_id: projectId,
      supplier_id: supplierId,
      comparative_id: source === "comparative" && comparativeId ? comparativeId : null,
      po_date: poDate,
      lines: lines.map((l) => ({
        indent_line_id: l.indent_line_id,
        comparative_line_id: l.comparative_line_id,
        material_id: l.material_id,
        boq_line_id: l.boq_line_id,
        ordered_qty: Number(l.ordered_qty) || 0,
        rate: Number(l.rate) || 0,
        gst_percent: Number(l.gst_percent) || 0,
        freight_amount: Number(l.freight_amount) || 0,
      })),
      schedules: schedules.map((s) => ({
        title: s.title,
        is_balance: s.is_balance,
        note: s.note,
        lines: s.lines
          .filter((l) => index.has(l.line_key) && Number(l.quantity) > 0)
          .map((l) => ({
            line_index: index.get(l.line_key) as number,
            quantity: Number(l.quantity),
            delivery_date: s.is_balance ? null : l.delivery_date || null,
          })),
      })),
      transportation_charge: Number(transport) || 0,
      freight_gst_percent: Number(freightGst) || 0,
      delivery_address: address,
      delivery_contact_name: contactName,
      delivery_contact_phone: contactPhone,
      payment_terms: paymentTerms,
      po_validity: validity,
      warranty: warranty,
      brand_terms: brandTerms,
      clause_ids: clauseIds,
      clause_overrides: overrides,
    };
  }

  const backHref = `/projects/${projectId}/procurement/purchase-orders`;

  async function saveDraft(): Promise<string | null> {
    if (invalidReason) return null;
    let id: string | null = savedId;
    await run(
      async () => {
        const result = savedId
          ? await updatePurchaseOrder(savedId, payload(), actor)
          : await createPurchaseOrder(payload(), actor);
        id = result.purchase_order.id;
        setSavedId(id);
        return result;
      },
      {
        success: (r) => `${r.purchase_order.po_number} saved as a draft`,
        view: backHref,
      },
    );
    return id;
  }

  async function submit() {
    const id = await saveDraft();
    if (!id) return;
    await run(() => submitPurchaseOrder(id, actor), {
      success: (r) => `${r.purchase_order.po_number} sent for approval`,
      view: backHref,
      onDone: () => router.push(backHref),
    });
  }

  const { savedAt, saving } = useAutosave(lines.length > 0, () => {
    try {
      window.localStorage.setItem(
        `manas-erp-po-draft:${projectId}:${savedId ?? "new"}`,
        JSON.stringify(payload()),
      );
    } catch {
      // Blocked storage only costs the reader the recovery.
    }
  });

  const unusedIndentLines = availableIndentLines.filter(
    (l) => !lines.some((d) => d.indent_line_id === l.id),
  );

  return (
    <FullPageEditor
      backHref={backHref}
      backLabel="Purchase orders"
      crumbs={[
        { label: "Projects", href: "/projects" },
        { label: "Purchase & Stores", href: backHref },
        { label: live ? live.po_number : "New purchase order" },
      ]}
      documentNumber={live?.po_number ?? "New purchase order"}
      title="Material, rates, charges, delivery schedule and the terms printed overleaf"
      party={supplier?.name}
      status={live?.status}
      team="purchase_stores"
      savedAt={savedAt}
      saving={saving}
      totals={
        <>
          <EditorTotal label="Lines" value={countOf(lines.length, "line")} />
          {/* A value-blind role gets the quantity it can act on and no rupees. */}
          {access.showValues ? (
            <>
              <EditorTotal label="Material value" value={formatInr(charges.material_value)} />
              <EditorTotal label="Tax" value={formatInr(charges.tax_amount)} />
              <EditorTotal label="Grand total" value={formatInr(charges.total_amount)} emphasis />
            </>
          ) : (
            <EditorTotal label="Scheduled" value={countOf(schedules.length, "schedule")} />
          )}
        </>
      }
      actions={
        <>
          <Button variant="ghost" size="sm" onClick={() => router.push(backHref)}>
            Cancel
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={pending || Boolean(invalidReason)}
            onClick={() => void saveDraft()}
          >
            Save draft
          </Button>
          <SubmitButton
            type="button"
            onClick={submit}
            submitting={pending}
            busyLabel="Submitting…"
            invalidReason={invalidReason}
            label="Submit for approval"
          />
        </>
      }
    >
      <div className="space-y-6">
        {!access.canCreate ? (
          <Card className="border-l-2 border-l-[var(--team-purchase)] px-5 py-4">
            <p className="text-sm leading-relaxed text-muted-foreground">
              Purchase orders are owned by Purchase &amp; Stores. You can read how one is put
              together; raising it is the Purchase Officer&rsquo;s.
            </p>
          </Card>
        ) : null}

        <SourcePanel
          source={source}
          onSource={(s) => {
            setSource(s);
            setLines([]);
            setSchedules([]);
            setComparativeId("");
          }}
          disabled={Boolean(existing)}
        />

        <Card className="px-5 py-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {source === "comparative" ? (
              <Field label="Approved comparative" required>
                <NativeSelect
                  value={comparativeId}
                  onChange={(e) => {
                    setComparativeId(e.target.value);
                    setSupplierId("");
                    setLines([]);
                  }}
                >
                  <option value="">Select a comparative</option>
                  {approvedComparatives.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.comparative_number}
                      {access.showValues ? ` — ${formatInr(c.total_selected_value)}` : ""}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            ) : null}

            <Field
              label="Supplier"
              required
              hint={
                supplier
                  ? supplier.state === "Goa"
                    ? "Intra-state — CGST and SGST"
                    : `Inter-state from ${supplier.state} — IGST`
                  : undefined
              }
            >
              <NativeSelect
                value={supplierId}
                onChange={(e) => {
                  setSupplierId(e.target.value);
                  if (source === "comparative" && comparativeId && e.target.value) {
                    loadFromComparative(comparativeId, e.target.value);
                  }
                }}
                disabled={source === "comparative" && !comparativeId}
              >
                <option value="">Select a supplier</option>
                {(source === "comparative" ? comparativeSuppliers : suppliers)
                  .filter((s) => s.is_active || s.id === supplierId)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} — {s.city}
                    </option>
                  ))}
              </NativeSelect>
            </Field>

            <Field label="PO date">
              <Input type="date" value={poDate} onChange={(e) => setPoDate(e.target.value)} />
            </Field>

            <Field label="Site contact" hint="Who the driver rings at the gate.">
              <Input
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Site engineer"
              />
            </Field>
            <Field label="Site contact number">
              <Input
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="+91 …"
              />
            </Field>
          </div>

          <Field className="mt-4" label="Delivery address" hint="Defaults to the project's site office.">
            <Textarea
              rows={2}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Leave blank for the project site office"
            />
          </Field>
        </Card>

        {/* --- lines ----------------------------------------------------- */}
        <section>
          <SectionHeading
            title="Material details"
            description={
              source === "blank"
                ? "Nothing sits above this order, so each line names its own material and the BOQ line it is against."
                : "Material, unit and BOQ line come from the document above and cannot be changed here."
            }
          />
          <Card className="overflow-hidden py-0">
            {source === "indents" ? (
              <div className="border-b border-border bg-muted/40 px-4 py-3">
                <Field label="Add an approved indent line">
                  <NativeSelect
                    value=""
                    onChange={(e) => e.target.value && addIndentLine(e.target.value)}
                    disabled={unusedIndentLines.length === 0}
                  >
                    <option value="">
                      {unusedIndentLines.length === 0
                        ? "Every approved line is already ordered"
                        : `Select a line — ${countOf(unusedIndentLines.length, "line")} available`}
                    </option>
                    {unusedIndentLines.map((l) => (
                      <option key={l.id} value={l.id}>
                        {lookup.indentNumber(l.indent_id)} · {lookup.material(l.material_id)} —{" "}
                        {formatNumber((l.approved_qty ?? 0) - l.ordered_qty, 2)} {l.unit} to order
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              </div>
            ) : null}

            {lines.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-muted-foreground">
                {source === "comparative"
                  ? "Pick the comparative and the supplier whose lines this order carries."
                  : source === "indents"
                    ? "Add an approved indent line. One order may consolidate lines from many indents."
                    : "Add a line."}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" onKeyDown={onKeyDown}>
                  <thead>
                    <tr className="border-b border-border text-xs text-muted-foreground">
                      <th className="px-3 py-2 text-left font-medium">Sl</th>
                      <th className="px-3 py-2 text-left font-medium">Material</th>
                      <th className="px-3 py-2 text-left font-medium">Brand</th>
                      <th className="px-2 py-2 text-left font-medium">UOM</th>
                      <th className="px-2 py-2 text-right font-medium">Quantity</th>
                      {access.showValues ? (
                        <>
                          <th className="px-2 py-2 text-right font-medium">Rate</th>
                          <th className="px-2 py-2 text-right font-medium">GST %</th>
                          <th className="px-2 py-2 text-right font-medium">Freight</th>
                          <th className="px-3 py-2 text-right font-medium">Net amount</th>
                        </>
                      ) : null}
                      <th className="w-10 px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l, i) => {
                      const material = materials.find((m) => m.id === l.material_id);
                      const basic = (Number(l.ordered_qty) || 0) * (Number(l.rate) || 0);
                      const net =
                        basic +
                        (Number(l.freight_amount) || 0) +
                        ((basic + (Number(l.freight_amount) || 0)) * (Number(l.gst_percent) || 0)) /
                          100;
                      const inherited = Boolean(l.indent_line_id || l.comparative_line_id);
                      return (
                        <tr key={l.key} className="border-b border-border/50 last:border-0">
                          <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                          <td className="min-w-[14rem] px-3 py-2">
                            {inherited ? (
                              <>
                                <span className="block font-medium">
                                  {lookup.material(l.material_id)}
                                </span>
                                <span className="block text-xs text-muted-foreground">
                                  {l.indent_line_id
                                    ? `From ${lookup.indentNumber(
                                        indentLines.find((x) => x.id === l.indent_line_id)
                                          ?.indent_id ?? null,
                                      )}`
                                    : "From the comparative"}{" "}
                                  · {lookup.boqItem(l.boq_line_id)}
                                </span>
                              </>
                            ) : (
                              <div className="space-y-2">
                                <MaterialPicker
                                  value={l.material_id || null}
                                  onChange={(id) =>
                                    patchLine(l.key, {
                                      material_id: id,
                                      gst_percent: String(
                                        materials.find((m) => m.id === id)?.gst_percent ?? 18,
                                      ),
                                    })
                                  }
                                  label="Material"
                                  required
                                />
                                <NativeSelect
                                  value={l.boq_line_id}
                                  onChange={(e) => patchLine(l.key, { boq_line_id: e.target.value })}
                                  aria-label="BOQ line"
                                >
                                  <option value="">BOQ line this is against</option>
                                  {boqLines.map((b) => (
                                    <option key={b.id} value={b.id}>
                                      {b.item_code} — {b.description}
                                    </option>
                                  ))}
                                </NativeSelect>
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {material?.brand || "—"}
                          </td>
                          <td className="px-2 py-2">{material?.unit ?? "—"}</td>
                          {(
                            access.showValues
                              ? ([
                                  ["ordered_qty", "w-24"],
                                  ["rate", "w-24"],
                                  ["gst_percent", "w-20"],
                                  ["freight_amount", "w-24"],
                                ] as const)
                              : ([["ordered_qty", "w-24"]] as const)
                          ).map(([key, width], ci) => (
                            <td key={key} className="px-2 py-2">
                              <Input
                                {...cellProps(i, ci)}
                                type="number"
                                step="any"
                                min={0}
                                value={l[key]}
                                onChange={(e) => patchLine(l.key, { [key]: e.target.value })}
                                className={cn(width, "text-right")}
                                aria-label={`${key.replace(/_/g, " ")} on line ${i + 1}`}
                              />
                            </td>
                          ))}
                          {access.showValues ? (
                            <td className="num px-3 py-2 text-right">
                              {net > 0 ? formatInr(net) : "—"}
                            </td>
                          ) : null}
                          <td className="px-2 py-2">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Remove line ${i + 1}`}
                              onClick={() => removeLine(l.key)}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {access.showValues ? (
                    <tfoot>
                      <tr className="border-t border-border bg-muted/40">
                        <td colSpan={8} className="px-3 py-2 text-right text-xs font-medium">
                          Taxable total
                        </td>
                        <td className="num px-3 py-2 text-right font-semibold">
                          {formatInr(charges.material_value + charges.transportation_charge)}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  ) : null}
                </table>
              </div>
            )}

            {source === "blank" ? (
              <div className="border-t border-border px-4 py-3">
                <Button variant="outline" size="sm" onClick={() => setLines((d) => [...d, blankLine()])}>
                  <Plus className="size-3.5" /> Add line
                </Button>
              </div>
            ) : null}
          </Card>
        </section>

        {access.showValues ? (
          <ChargesPanel
            charges={charges}
            transport={transport}
            onTransport={setTransport}
            freightGst={freightGst}
            onFreightGst={setFreightGst}
          />
        ) : null}

        <SchedulePanel
          lines={lines}
          schedules={schedules}
          setSchedules={setSchedules}
          balances={balances}
          materialLabel={(id) => lookup.material(id)}
          unitOf={(id) => materials.find((m) => m.id === id)?.unit ?? ""}
          unscheduled={unscheduled.length}
          overScheduled={overScheduled.length > 0}
        />

        <TermsPanel
          clauses={activeClauses}
          clauseIds={clauseIds}
          setClauseIds={setClauseIds}
          overrides={overrides}
          setOverrides={setOverrides}
          paymentTerms={paymentTerms}
          setPaymentTerms={setPaymentTerms}
          validity={validity}
          setValidity={setValidity}
          warranty={warranty}
          setWarranty={setWarranty}
          brandTerms={brandTerms}
          setBrandTerms={setBrandTerms}
          preview={previewTerms}
        />
      </div>
    </FullPageEditor>
  );
}

/* ------------------------------------------------------------------ */

function SourcePanel({
  source,
  onSource,
  disabled,
}: {
  source: Source;
  onSource: (s: Source) => void;
  disabled: boolean;
}) {
  const options: Array<{ key: Source; label: string; hint: string }> = [
    {
      key: "indents",
      label: "From approved indents",
      hint: "Consolidate approved indent lines — one order may carry many indents.",
    },
    {
      key: "comparative",
      label: "From an approved comparative",
      hint: "The winning vendor and rates come across automatically.",
    },
    {
      key: "blank",
      label: "Blank order",
      hint: "Nothing above it, so each line names its own material and BOQ line.",
    },
  ];
  if (disabled) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onSource(o.key)}
          className={cn(
            "min-h-11 rounded-xl border px-4 py-3 text-left transition-colors",
            source === o.key
              ? "border-primary bg-secondary/50 ring-1 ring-primary/30"
              : "border-border bg-card hover:bg-muted/50",
          )}
        >
          <span className="block text-sm font-semibold">{o.label}</span>
          <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
            {o.hint}
          </span>
        </button>
      ))}
    </div>
  );
}

function ChargesPanel({
  charges,
  transport,
  onTransport,
  freightGst,
  onFreightGst,
}: {
  charges: ReturnType<typeof poCharges>;
  transport: string;
  onTransport: (v: string) => void;
  freightGst: string;
  onFreightGst: (v: string) => void;
}) {
  return (
    <section>
      <SectionHeading
        title="Additional charges"
        description="Freight quoted inside a line is already taxed at that line's rate; a charge added here is taxed at its own."
      />
      <Card className="px-5 py-4">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Transportation charge">
              <Input
                type="number"
                step="any"
                min={0}
                value={transport}
                onChange={(e) => onTransport(e.target.value)}
                className="text-right"
              />
            </Field>
            <Field label="GST on freight %">
              <Input
                type="number"
                step="any"
                min={0}
                max={28}
                value={freightGst}
                onChange={(e) => onFreightGst(e.target.value)}
                className="text-right"
              />
            </Field>
          </div>

          <dl className="space-y-1.5 text-sm">
            <ChargeRow label="Material value" value={charges.material_value} />
            <ChargeRow label="Transportation charge" value={charges.transportation_charge} />
            <ChargeRow label="GST on freight" value={charges.freight_tax_amount} />
            {charges.is_interstate ? (
              <ChargeRow label="IGST" value={charges.igst_amount} />
            ) : (
              <>
                <ChargeRow label="CGST" value={charges.cgst_amount} />
                <ChargeRow label="SGST" value={charges.sgst_amount} />
              </>
            )}
            <div className="flex items-center justify-between border-t border-border pt-1.5 font-semibold">
              <dt>Total cost</dt>
              <dd className="num">{formatInr(charges.total_amount)}</dd>
            </div>
            <p className="pt-1 text-xs leading-relaxed text-muted-foreground">
              {rupeesInWords(charges.total_amount)}
            </p>
          </dl>
        </div>
      </Card>
    </section>
  );
}

function ChargeRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between text-muted-foreground">
      <dt>{label}</dt>
      <dd className="num text-foreground">{formatInr(value)}</dd>
    </div>
  );
}

function SchedulePanel({
  lines,
  schedules,
  setSchedules,
  balances,
  materialLabel,
  unitOf,
  unscheduled,
  overScheduled,
}: {
  lines: LineDraft[];
  schedules: ScheduleDraft[];
  setSchedules: React.Dispatch<React.SetStateAction<ScheduleDraft[]>>;
  balances: ReturnType<typeof scheduledBalance>;
  materialLabel: (id: string) => string;
  unitOf: (id: string) => string;
  unscheduled: number;
  overScheduled: boolean;
}) {
  function addSchedule(is_balance: boolean) {
    setSchedules((s) => [
      ...s,
      {
        key: nextKey(),
        title: "",
        is_balance,
        note: "",
        lines: is_balance
          ? lines
              .filter((l) => (balances.get(l.key)?.balance_qty ?? 0) > 0.0005)
              .map((l) => ({
                key: nextKey(),
                line_key: l.key,
                quantity: String(balances.get(l.key)?.balance_qty ?? 0),
                delivery_date: "",
              }))
          : [],
      },
    ]);
  }

  return (
    <section>
      <SectionHeading
        title="Delivery schedule"
        description="Staggered delivery lives on the order, not the indent. An order may carry several schedules, and a balance schedule carries no dates."
      />
      <div className="space-y-4">
        {overScheduled ? (
          <Warning>
            A schedule promises more than the order carries. Reduce it, or raise the ordered
            quantity.
          </Warning>
        ) : null}

        {schedules.map((s, si) => (
          <Card key={s.key} className="overflow-hidden py-0">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/40 px-4 py-2.5">
              <div className="flex min-w-0 flex-wrap items-center gap-3">
                <p className="text-sm font-semibold">
                  {s.title || `Delivery Schedule ${si + 1}`}
                  {s.is_balance ? (
                    <span className="ml-2 rounded-full bg-info-soft px-1.5 py-0.5 text-xs font-semibold text-info ring-1 ring-info/30">
                      Balance
                    </span>
                  ) : null}
                </p>
                <Input
                  value={s.title}
                  onChange={(e) =>
                    setSchedules((d) =>
                      d.map((x, i) => (i === si ? { ...x, title: e.target.value } : x)),
                    )
                  }
                  placeholder={`Delivery Schedule ${si + 1}`}
                  className="h-9 w-56"
                  aria-label={`Title for schedule ${si + 1}`}
                />
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove schedule ${si + 1}`}
                onClick={() => setSchedules((d) => d.filter((_, i) => i !== si))}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>

            {s.is_balance ? (
              <p className="border-b border-border bg-card px-4 py-2 text-xs leading-relaxed text-muted-foreground">
                Prints: &ldquo;Delivery schedule for this will be confirmed as per site
                requirement.&rdquo;
              </p>
            ) : null}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="px-3 py-2 text-left font-medium">Material</th>
                    <th className="px-2 py-2 text-left font-medium">UOM</th>
                    <th className="px-2 py-2 text-right font-medium">Quantity</th>
                    {s.is_balance ? null : (
                      <th className="px-2 py-2 text-left font-medium">Delivery date</th>
                    )}
                    <th className="w-10 px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {s.lines.length === 0 ? (
                    <tr>
                      <td
                        colSpan={s.is_balance ? 4 : 5}
                        className="px-3 py-6 text-center text-sm text-muted-foreground"
                      >
                        Add an instalment.
                      </td>
                    </tr>
                  ) : (
                    s.lines.map((l, li) => {
                      const line = lines.find((x) => x.key === l.line_key);
                      return (
                        <tr key={l.key} className="border-b border-border/50 last:border-0">
                          <td className="min-w-[12rem] px-3 py-2">
                            <NativeSelect
                              value={l.line_key}
                              onChange={(e) =>
                                setSchedules((d) =>
                                  d.map((x, i) =>
                                    i !== si
                                      ? x
                                      : {
                                          ...x,
                                          lines: x.lines.map((y, j) =>
                                            j === li ? { ...y, line_key: e.target.value } : y,
                                          ),
                                        },
                                  ),
                                )
                              }
                              aria-label="Order line"
                            >
                              <option value="">Select an ordered line</option>
                              {lines.map((o, oi) => (
                                <option key={o.key} value={o.key}>
                                  {oi + 1}. {materialLabel(o.material_id)}
                                </option>
                              ))}
                            </NativeSelect>
                          </td>
                          <td className="px-2 py-2">
                            {line ? unitOf(line.material_id) || "—" : "—"}
                          </td>
                          <td className="px-2 py-2">
                            <Input
                              type="number"
                              step="any"
                              min={0}
                              value={l.quantity}
                              onChange={(e) =>
                                setSchedules((d) =>
                                  d.map((x, i) =>
                                    i !== si
                                      ? x
                                      : {
                                          ...x,
                                          lines: x.lines.map((y, j) =>
                                            j === li ? { ...y, quantity: e.target.value } : y,
                                          ),
                                        },
                                  ),
                                )
                              }
                              className="w-24 text-right"
                              aria-label="Scheduled quantity"
                            />
                          </td>
                          {s.is_balance ? null : (
                            <td className="px-2 py-2">
                              <Input
                                type="date"
                                value={l.delivery_date}
                                onChange={(e) =>
                                  setSchedules((d) =>
                                    d.map((x, i) =>
                                      i !== si
                                        ? x
                                        : {
                                            ...x,
                                            lines: x.lines.map((y, j) =>
                                              j === li
                                                ? { ...y, delivery_date: e.target.value }
                                                : y,
                                            ),
                                          },
                                    ),
                                  )
                                }
                                className="w-40"
                                aria-label="Delivery date"
                              />
                            </td>
                          )}
                          <td className="px-2 py-2">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label="Remove instalment"
                              onClick={() =>
                                setSchedules((d) =>
                                  d.map((x, i) =>
                                    i !== si
                                      ? x
                                      : { ...x, lines: x.lines.filter((_, j) => j !== li) },
                                  ),
                                )
                              }
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="border-t border-border px-4 py-3">
              <Button
                variant="outline"
                size="sm"
                disabled={lines.length === 0}
                onClick={() =>
                  setSchedules((d) =>
                    d.map((x, i) =>
                      i !== si
                        ? x
                        : {
                            ...x,
                            lines: [
                              ...x.lines,
                              {
                                key: nextKey(),
                                line_key: lines[0]?.key ?? "",
                                quantity: "",
                                delivery_date: "",
                              },
                            ],
                          },
                    ),
                  )
                }
              >
                <Plus className="size-3.5" /> Add instalment
              </Button>
            </div>
          </Card>
        ))}

        <Card className="px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={lines.length === 0}
              onClick={() => addSchedule(false)}
            >
              <Plus className="size-3.5" /> Add delivery schedule
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={unscheduled === 0}
              onClick={() => addSchedule(true)}
            >
              <Plus className="size-3.5" /> Add balance schedule
            </Button>
          </div>

          {lines.length > 0 ? (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="px-3 py-2 text-left font-medium">Line</th>
                    <th className="px-2 py-2 text-right font-medium">Ordered</th>
                    <th className="px-2 py-2 text-right font-medium">Scheduled</th>
                    <th className="px-2 py-2 text-right font-medium">Unscheduled balance</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => {
                    const b = balances.get(l.key);
                    const unit = unitOf(l.material_id);
                    return (
                      <tr key={l.key} className="border-b border-border/50 last:border-0">
                        <td className="px-3 py-2">
                          {i + 1}. {materialLabel(l.material_id)}
                        </td>
                        <td className="num px-2 py-2 text-right">
                          <Qty value={b?.ordered_qty ?? 0} unit={unit} />
                        </td>
                        <td className="num px-2 py-2 text-right">
                          <Qty value={b?.scheduled_qty ?? 0} unit={unit} />
                        </td>
                        <td
                          className={cn(
                            "num px-2 py-2 text-right",
                            (b?.balance_qty ?? 0) < -0.0005 && "font-semibold text-destructive",
                          )}
                        >
                          <Qty value={b?.balance_qty ?? 0} unit={unit} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </Card>
      </div>
    </section>
  );
}

function TermsPanel({
  clauses,
  clauseIds,
  setClauseIds,
  overrides,
  setOverrides,
  paymentTerms,
  setPaymentTerms,
  validity,
  setValidity,
  warranty,
  setWarranty,
  brandTerms,
  setBrandTerms,
  preview,
}: {
  clauses: PoClause[];
  clauseIds: string[];
  setClauseIds: React.Dispatch<React.SetStateAction<string[]>>;
  overrides: Record<string, string>;
  setOverrides: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  paymentTerms: string;
  setPaymentTerms: (v: string) => void;
  validity: string;
  setValidity: (v: string) => void;
  warranty: string;
  setWarranty: (v: string) => void;
  brandTerms: string;
  setBrandTerms: (v: string) => void;
  preview: ReturnType<typeof composePoTerms>;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const fields: Array<{ field: string; value: string; set: (v: string) => void }> = [
    { field: "payment_terms", value: paymentTerms, set: setPaymentTerms },
    { field: "po_validity", value: validity, set: setValidity },
    { field: "warranty", value: warranty, set: setWarranty },
    { field: "brand", value: brandTerms, set: setBrandTerms },
  ];

  return (
    <section>
      <SectionHeading
        title="Terms and conditions"
        description="From the library in Masters. Four of them read differently on every order, so their words come from here."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="px-5 py-4">
          <p className="mb-3 text-sm font-semibold">This order&rsquo;s words</p>
          <div className="space-y-4">
            {fields.map((f) => (
              <Field key={f.field} label={poVariableFieldLabel(f.field)}>
                <Textarea rows={2} value={f.value} onChange={(e) => f.set(e.target.value)} />
              </Field>
            ))}
          </div>
        </Card>

        <Card className="px-5 py-4">
          <p className="mb-3 text-sm font-semibold">
            Clauses carried
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {clauseIds.length} of {clauses.length}
            </span>
          </p>
          <ul className="max-h-96 space-y-2 overflow-y-auto pr-1">
            {clauses.map((c) => {
              const on = clauseIds.includes(c.id);
              const overridden = overrides[c.id] !== undefined;
              return (
                <li key={c.id} className="rounded-lg border border-border px-3 py-2">
                  <label className="flex min-h-11 items-start gap-2.5">
                    <input
                      type="checkbox"
                      className="mt-1 size-4 shrink-0"
                      checked={on}
                      onChange={(e) =>
                        setClauseIds((ids) =>
                          e.target.checked ? [...ids, c.id] : ids.filter((x) => x !== c.id),
                        )
                      }
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">
                        {c.title}
                        {c.variable_field ? (
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            words from this order
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                        {overrides[c.id] ?? c.text}
                      </span>
                    </span>
                  </label>
                  {on ? (
                    <div className="mt-1 flex flex-wrap items-center gap-2 pl-7">
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => setEditing(editing === c.id ? null : c.id)}
                      >
                        {editing === c.id ? "Done" : overridden ? "Edit wording" : "Reword on this order"}
                      </Button>
                      {overridden ? (
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() =>
                            setOverrides((o) => {
                              const next = { ...o };
                              delete next[c.id];
                              return next;
                            })
                          }
                        >
                          Back to the library wording
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                  {editing === c.id ? (
                    <Textarea
                      rows={3}
                      className="mt-2"
                      value={overrides[c.id] ?? c.text}
                      onChange={(e) =>
                        setOverrides((o) => ({ ...o, [c.id]: e.target.value }))
                      }
                      aria-label={`Wording for ${c.title}`}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <Card className="mt-4 px-5 py-4">
        <p className="mb-3 text-sm font-semibold">As it prints</p>
        <ol className="space-y-1.5">
          {preview.map((t) => (
            <li key={t.sequence} className="flex gap-2 text-sm leading-relaxed">
              <span className="num w-6 shrink-0 text-right text-muted-foreground">
                {t.sequence}.
              </span>
              <span className="min-w-0">{t.text}</span>
            </li>
          ))}
        </ol>
      </Card>
    </section>
  );
}
