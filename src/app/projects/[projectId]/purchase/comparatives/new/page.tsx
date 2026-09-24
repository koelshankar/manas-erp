"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, NativeSelect, Qty, Warning } from "@/components/common";
import { SubmitButton } from "@/components/ui-app";
import { EditorTotal, FullPageEditor, cellProps, useAutosave, useGridKeys } from "@/components/editor";
import {
  useAccess,
  useActor,
  useAllRows,
  useLookups,
  useProjectId,
  useProjectRows,
  useServiceAction,
} from "@/lib/hooks";
import { createComparative } from "@/lib/services/purchase-service";
import { landedCost } from "@/lib/services/pricing";
import type {
  Indent,
  IndentLine,
  Material,
  Supplier,
  SupplierRate,
} from "@/lib/domain";
import { countOf, formatInr } from "@/lib/format";
import { cn } from "cn";

type QuoteDraft = {
  supplier_id: string;
  rate: string;
  gst_percent: string;
  freight_amount: string;
  delivery_days: string;
  payment_terms: string;
};

type LineDraft = {
  indent_line_id: string;
  quotes: QuoteDraft[];
  selected_supplier_id: string;
  justification: string;
};

/**
 * B1 — the vendor comparative, full page.
 *
 * Three quotes on each of several indent lines is a grid that never fitted a
 * dialog (audit C6). L1 is decided on landed cost — rate plus freight plus tax
 * — and the saving against the next-best quote is the number the Purchase Head
 * is approving, so it sits in the action bar rather than three scrolls down.
 */
export default function NewComparativePage() {
  const projectId = useProjectId();
  const access = useAccess("comparatives");
  const router = useRouter();
  const lookup = useLookups();
  const actor = useActor();
  const { run, pending } = useServiceAction();

  const [remarks, setRemarks] = useState("");
  const [drafts, setDrafts] = useState<LineDraft[]>([]);

  const indents = useProjectRows("indents", projectId) as Indent[];
  const indentLines = useProjectRows("indent_lines", projectId) as IndentLine[];
  const comparativeLines = useProjectRows("comparative_lines", projectId);
  const comparatives = useProjectRows("comparatives", projectId);
  const suppliers = useAllRows("suppliers") as Supplier[];
  const rates = useAllRows("supplier_rates") as SupplierRate[];
  const materials = useAllRows("materials") as Material[];
  const onKeyDown = useGridKeys();

  /** Approved lines not already committed to a live comparative. */
  const available = useMemo(() => {
    const live = new Set(
      comparatives.filter((c) => c.status !== "rejected" && c.status !== "sent_back").map((c) => c.id),
    );
    const committed = new Set(
      comparativeLines.filter((l) => live.has(l.comparative_id)).map((l) => l.indent_line_id),
    );
    const eligible = new Set(
      indents.filter((i) => i.status === "approved" || i.status === "partially_approved").map((i) => i.id),
    );
    return indentLines.filter(
      (l) => eligible.has(l.indent_id) && (l.approved_qty ?? 0) > 0 && !committed.has(l.id),
    );
  }, [comparatives, comparativeLines, indentLines, indents]);

  function suppliersFor(material_id: string): Supplier[] {
    const carded = rates.filter((r) => r.material_id === material_id).map((r) => r.supplier_id);
    return suppliers.filter((s) => carded.includes(s.id));
  }

  function addLine(indent_line_id: string) {
    const line = indentLines.find((l) => l.id === indent_line_id);
    if (!line) return;
    const material = materials.find((m) => m.id === line.material_id);
    const quotes: QuoteDraft[] = suppliersFor(line.material_id)
      .slice(0, 3)
      .map((s) => {
        const card = rates.find((r) => r.supplier_id === s.id && r.material_id === line.material_id);
        return {
          supplier_id: s.id,
          rate: String(card?.rate ?? ""),
          gst_percent: String(material?.gst_percent ?? 18),
          freight_amount: "0",
          delivery_days: String(card?.lead_time_days ?? 5),
          payment_terms: `${s.payment_terms_days} days from GRN`,
        };
      });
    setDrafts((d) => [...d, { indent_line_id, quotes, selected_supplier_id: "", justification: "" }]);
  }

  function patchQuote(li: number, qi: number, change: Partial<QuoteDraft>) {
    setDrafts((d) =>
      d.map((line, i) =>
        i !== li ? line : { ...line, quotes: line.quotes.map((q, j) => (j === qi ? { ...q, ...change } : q)) },
      ),
    );
  }

  function priced(line: LineDraft) {
    const indentLine = indentLines.find((l) => l.id === line.indent_line_id);
    const quantity = indentLine?.approved_qty ?? 0;
    const rows = line.quotes.map((q) => ({
      ...q,
      ...landedCost(quantity, Number(q.rate) || 0, Number(q.gst_percent) || 0, Number(q.freight_amount) || 0),
    }));
    const valid = rows.filter((r) => r.landed_rate > 0);
    const sorted = [...valid].sort((a, b) => a.landed_rate - b.landed_rate);
    const l1 = sorted[0] ?? null;
    const l2 = sorted[1] ?? null;
    const selected = rows.find((r) => r.supplier_id === line.selected_supplier_id) ?? null;
    return { indentLine, quantity, rows, l1, l2, selected };
  }

  /* --- the two figures the Purchase Head is approving ----------------- */
  const selectedValue = drafts.reduce((sum, d) => sum + (priced(d).selected?.landed_amount ?? 0), 0);
  const l1Value = drafts.reduce((sum, d) => sum + (priced(d).l1?.landed_amount ?? 0), 0);
  const savingVsL2 = drafts.reduce((sum, d) => {
    const p = priced(d);
    return sum + (p.l2 && p.l1 ? p.l2.landed_amount - p.l1.landed_amount : 0);
  }, 0);
  const offL1 = drafts.filter((d) => {
    const p = priced(d);
    return p.selected && p.l1 && p.selected.supplier_id !== p.l1.supplier_id;
  });

  const dirty = drafts.length > 0;

  const invalidReason = useMemo(() => {
    if (!access.canCreate) return "Only the Purchase Officer prepares a comparative.";
    if (drafts.length === 0) return "Add at least one approved indent line.";
    for (const d of drafts) {
      const p = priced(d);
      const quoted = p.rows.filter((r) => Number(r.rate) > 0);
      if (quoted.length < 3) {
        return `${lookup.material(p.indentLine?.material_id ?? "")} needs at least three quotes.`;
      }
      if (!d.selected_supplier_id) {
        return `Select a supplier for ${lookup.material(p.indentLine?.material_id ?? "")}.`;
      }
      const isL1 = p.l1?.supplier_id === d.selected_supplier_id;
      if (!isL1 && d.justification.trim().length < 5) {
        return "Choosing other than L1 needs a justification.";
      }
    }
    return undefined;
    // priced() reads `drafts`, which is in the dependency list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [access.canCreate, drafts, lookup]);

  const { savedAt, saving } = useAutosave(dirty, () => {
    try {
      window.localStorage.setItem(
        `manas-erp-comparative-draft:${projectId}`,
        JSON.stringify({ remarks, drafts }),
      );
    } catch {
      // Blocked storage only costs the reader the recovery.
    }
  });

  async function submit() {
    await run(
      () =>
        createComparative(
          {
            project_id: projectId,
            remarks,
            submit: true,
            lines: drafts.map((line) => ({
              indent_line_id: line.indent_line_id,
              quotes: line.quotes.map((q) => ({
                supplier_id: q.supplier_id,
                rate: Number(q.rate),
                gst_percent: Number(q.gst_percent),
                freight_amount: Number(q.freight_amount) || 0,
                delivery_days: Number(q.delivery_days) || 0,
                payment_terms: q.payment_terms,
              })),
              selected_supplier_id: line.selected_supplier_id,
              justification: line.justification,
            })),
          },
          actor,
        ),
      {
        view: `/projects/${projectId}/purchase/comparatives`,
        success: (r) => `${r.comparative.comparative_number} sent to the Purchase Head`,
        onDone: () => router.push(`/projects/${projectId}/purchase/comparatives`),
      },
    );
  }

  const backHref = `/projects/${projectId}/purchase/comparatives`;
  const unused = available.filter((l) => !drafts.some((d) => d.indent_line_id === l.id));

  return (
    <FullPageEditor
      backHref={backHref}
      backLabel="Comparatives"
      crumbs={[
        { label: "Projects", href: "/projects" },
        { label: "Purchase & Stores", href: backHref },
        { label: "New comparative" },
      ]}
      documentNumber="New comparative"
      title="Vendor quotes per indent line — L1 is decided on landed cost, not the bare rate"
      team="purchase_stores"
      stepCodes={["B1"]}
      savedAt={savedAt}
      saving={saving}
      totals={
        <>
          <EditorTotal label="Lines" value={countOf(drafts.length, "line")} />
          <EditorTotal label="Selected value" value={formatInr(selectedValue)} emphasis />
          <EditorTotal
            label="Saving against L2"
            value={<span className="text-success">{formatInr(savingVsL2)}</span>}
          />
          <EditorTotal
            label="Off L1"
            value={
              offL1.length === 0 ? (
                "None"
              ) : (
                <span className="text-warning">
                  {offL1.length} (+{formatInr(selectedValue - l1Value)})
                </span>
              )
            }
          />
        </>
      }
      actions={
        <>
          <Button variant="ghost" size="sm" onClick={() => router.push(backHref)}>
            Cancel
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
      <div className="space-y-5">
        <Card className="px-5 py-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <Field label="Add an approved indent line" className="min-w-0 flex-1">
              <NativeSelect
                value=""
                onChange={(e) => e.target.value && addLine(e.target.value)}
                disabled={unused.length === 0}
              >
                <option value="">
                  {unused.length === 0
                    ? "Every approved line is already on a comparative"
                    : `Select a line — ${countOf(unused.length, "line")} available`}
                </option>
                {unused.map((l) => (
                  <option key={l.id} value={l.id}>
                    {lookup.material(l.material_id)} — {l.approved_qty} {l.unit}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Remarks" className="min-w-0 flex-1">
              <Input
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Quotes collected by phone and email, 12–14 Sep."
              />
            </Field>
          </div>
        </Card>

        {drafts.length === 0 ? (
          <Card className="border-dashed px-5 py-10 text-center text-sm text-muted-foreground">
            Add an approved indent line to start quoting. Lines from several indents can share one
            comparative.
          </Card>
        ) : (
          drafts.map((line, li) => {
            const p = priced(line);
            const isL1 = p.l1?.supplier_id === line.selected_supplier_id;
            return (
              <Card key={line.indent_line_id} className="overflow-hidden py-0">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/40 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">
                      {lookup.material(p.indentLine?.material_id ?? "")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <Qty value={p.quantity} unit={p.indentLine?.unit ?? ""} /> approved
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Remove line"
                    onClick={() => setDrafts((d) => d.filter((_, i) => i !== li))}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm" onKeyDown={onKeyDown}>
                    <thead>
                      <tr className="border-b border-border/70 text-xs text-muted-foreground">
                        <th className="w-10 px-3 py-2" />
                        <th className="px-3 py-2 text-left font-medium">Supplier</th>
                        <th className="px-2 py-2 text-right font-medium">Rate</th>
                        <th className="px-2 py-2 text-right font-medium">GST %</th>
                        <th className="px-2 py-2 text-right font-medium">Freight</th>
                        <th className="px-2 py-2 text-right font-medium">Days</th>
                        <th className="px-3 py-2 text-right font-medium">Landed rate</th>
                        <th className="px-4 py-2 text-right font-medium">Landed total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.rows.map((q, qi) => {
                        const isBest = p.l1?.supplier_id === q.supplier_id && q.landed_rate > 0;
                        return (
                          <tr
                            key={q.supplier_id}
                            className={cn(
                              "border-b border-border/40 last:border-0",
                              line.selected_supplier_id === q.supplier_id && "bg-secondary/40",
                            )}
                          >
                            <td className="px-3 py-2">
                              <input
                                type="radio"
                                name={`select-${li}`}
                                checked={line.selected_supplier_id === q.supplier_id}
                                onChange={() =>
                                  setDrafts((d) =>
                                    d.map((l, i) =>
                                      i === li ? { ...l, selected_supplier_id: q.supplier_id } : l,
                                    ),
                                  )
                                }
                                aria-label={`Select ${lookup.supplier(q.supplier_id)}`}
                                className="size-4 accent-[var(--primary)]"
                              />
                            </td>
                            <td className="px-3 py-2">
                              {lookup.supplier(q.supplier_id)}
                              {isBest ? (
                                <span className="ml-2 rounded-full bg-success-soft px-1.5 py-0.5 text-[10px] font-semibold text-success ring-1 ring-success/30">
                                  L1
                                </span>
                              ) : null}
                            </td>
                            {(
                              [
                                ["rate", "w-24"],
                                ["gst_percent", "w-20"],
                                ["freight_amount", "w-24"],
                                ["delivery_days", "w-16"],
                              ] as const
                            ).map(([key, width], ci) => (
                              <td key={key} className="px-2 py-2">
                                <Input
                                  {...cellProps(li * 10 + qi, ci)}
                                  type="number"
                                  step="any"
                                  min={0}
                                  value={q[key]}
                                  onChange={(e) => patchQuote(li, qi, { [key]: e.target.value })}
                                  className={cn(width, "text-right")}
                                  aria-label={`${key} for ${lookup.supplier(q.supplier_id)}`}
                                />
                              </td>
                            ))}
                            <td className="num px-3 py-2 text-right">
                              {q.landed_rate > 0 ? formatInr(q.landed_rate) : "—"}
                            </td>
                            <td
                              className={cn(
                                "num px-4 py-2 text-right",
                                isBest && "font-semibold text-success",
                              )}
                            >
                              {q.landed_amount > 0 ? formatInr(q.landed_amount) : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {line.selected_supplier_id && !isL1 ? (
                  <div className="border-t border-border px-4 py-3">
                    <Field
                      label="Why not L1?"
                      required
                      error={
                        line.justification.trim().length < 5
                          ? "A justification is required before this can be submitted."
                          : undefined
                      }
                      hint={
                        p.l1 && p.selected
                          ? `${formatInr(p.selected.landed_amount - p.l1.landed_amount)} above ${lookup.supplier(p.l1.supplier_id)}.`
                          : undefined
                      }
                    >
                      <Input
                        value={line.justification}
                        onChange={(e) =>
                          setDrafts((d) =>
                            d.map((l, i) => (i === li ? { ...l, justification: e.target.value } : l)),
                          )
                        }
                        placeholder="L1 cannot deliver before the pour date; selected supplier can."
                      />
                    </Field>
                  </div>
                ) : null}
              </Card>
            );
          })
        )}

        {available.length === 0 && drafts.length === 0 ? (
          <Warning>
            Nothing is approved and waiting to be quoted. Approved indent lines arrive here from
            the Project Head&apos;s A2 queue.
          </Warning>
        ) : null}
      </div>
    </FullPageEditor>
  );
}
