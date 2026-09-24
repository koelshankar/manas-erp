"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { FormDialog } from "@/components/ui-app";
import { Field, NativeSelect, Qty } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { BoqLine, Contractor } from "@/lib/domain";
import { tradeLabel } from "@/config/labels";
import { formatInr } from "@/lib/format";
import { today, daysAheadDate } from "@/lib/clock";
import { createWorkOrder } from "@/lib/services";
import {
  useActor,
  useAllRows,
  useNewParam,
  useScopedRows,
  useServiceAction,
} from "@/lib/hooks";
import { cn } from "cn";

type DraftLine = { boq_line_id: string; quantity: string; agreed_rate: string };

/**
 * Raise a work order: a contractor, the BOQ lines they are engaged on, and the
 * rate agreed for each.
 *
 * The BOQ lines offered are the ones matching the contractor's trade, because
 * that is how the work is actually let. Each row shows the BOQ rate beside the
 * agreed one, so the margin is visible while it is being typed — and the
 * service refuses an agreed rate above the BOQ's.
 */
export function WorkOrderDialog({ projectId }: { projectId: string }) {
  const [open, setOpen] = useNewParam();
  const [contractorId, setContractorId] = useState("");
  const [title, setTitle] = useState("");
  const [scope, setScope] = useState("");
  const [issued, setIssued] = useState(today());
  const [start, setStart] = useState(today());
  const [end, setEnd] = useState(daysAheadDate(120));
  const [retention, setRetention] = useState("5");
  const [lines, setLines] = useState<Record<string, DraftLine>>({});

  const contractors = useAllRows("contractors") as Contractor[];
  const boqLines = useScopedRows("boq_lines") as BoqLine[];
  const actor = useActor();
  const { run, pending } = useServiceAction();

  const contractor = contractors.find((c) => c.id === contractorId);

  // The lines worth offering: this contractor's trade, on this project.
  const candidates = useMemo(
    () =>
      contractor
        ? boqLines.filter((l) => l.project_id === projectId && l.trade === contractor.trade)
        : [],
    [boqLines, contractor, projectId],
  );

  // Switching contractor changes the trade, so the selection cannot carry over.
  useEffect(() => {
    setLines({});
    if (contractor) setRetention(String(contractor.default_retention_percent));
  }, [contractorId, contractor]);

  const chosen = Object.values(lines).filter((l) => l.boq_line_id);
  const orderValue = chosen.reduce(
    (sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.agreed_rate) || 0),
    0,
  );
  const boqValue = chosen.reduce((sum, l) => {
    const boq = candidates.find((c) => c.id === l.boq_line_id);
    return sum + (Number(l.quantity) || 0) * (boq?.rate ?? 0);
  }, 0);
  const dirty = Boolean(contractorId || title || chosen.length > 0);

  const invalidReason = useMemo(() => {
    if (!contractorId) return "Pick the contractor this order is for.";
    if (title.trim().length < 4) return "Give the order a title.";
    if (chosen.length === 0) return "Add at least one BOQ line.";
    for (const l of chosen) {
      const boq = candidates.find((c) => c.id === l.boq_line_id)!;
      if (!(Number(l.quantity) > 0)) return `${boq.item_code} needs a quantity.`;
      if (!(Number(l.agreed_rate) > 0)) return `${boq.item_code} needs an agreed rate.`;
      if (Number(l.agreed_rate) > boq.rate) {
        return `${boq.item_code} is agreed above its BOQ rate of ${boq.rate}.`;
      }
      if (Number(l.quantity) > boq.quantity) {
        return `${boq.item_code} is ordered above its BOQ quantity of ${boq.quantity}.`;
      }
    }
    if (end < start) return "The order cannot end before it starts.";
    return undefined;
  }, [contractorId, title, chosen, candidates, end, start]);

  function toggle(boq: BoqLine, on: boolean) {
    setLines((prev) => {
      const next = { ...prev };
      if (!on) delete next[boq.id];
      // Default the agreed rate to 92% of the BOQ rate, the seed's own margin.
      else
        next[boq.id] = {
          boq_line_id: boq.id,
          quantity: String(boq.quantity),
          agreed_rate: String(Math.round(boq.rate * 0.92)),
        };
      return next;
    });
  }

  async function submit() {
    await run(
      () =>
        createWorkOrder(
          {
            project_id: projectId,
            contractor_id: contractorId,
            title: title.trim(),
            scope_summary: scope.trim(),
            issued_date: issued,
            start_date: start,
            end_date: end,
            retention_percent: Number(retention) || 0,
            lines: chosen.map((l) => ({
              boq_line_id: l.boq_line_id,
              quantity: Number(l.quantity),
              agreed_rate: Number(l.agreed_rate),
            })),
          },
          actor,
        ),
      {
        success: (r) => `${r.workOrder.wo_number} raised`,
        view: `/projects/${projectId}/budget/work-orders`,
        onDone: () => {
          setContractorId("");
          setTitle("");
          setScope("");
          setLines({});
          setOpen(false);
        },
      },
    );
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-3.5" /> New work order
      </Button>

      <FormDialog
        open={open}
        onOpenChange={setOpen}
        size="xl"
        title="Raise a work order"
        context="The contractor's scope and agreed rates. Measurements and RA bills are priced off these lines."
        dirty={dirty}
        invalidReason={invalidReason}
        submitLabel="Raise work order"
        submitting={pending}
        onSubmit={submit}
        footerInfo={
          chosen.length === 0
            ? "Pick a contractor, then the BOQ lines they are engaged on."
            : `${chosen.length} line${chosen.length === 1 ? "" : "s"} · order value ${formatInr(orderValue)} · margin ${formatInr(boqValue - orderValue)}`
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Contractor" required>
            <NativeSelect
              value={contractorId}
              onChange={(e) => setContractorId(e.target.value)}
            >
              <option value="">Select a contractor</option>
              {contractors.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {tradeLabel(c.trade)}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field
            label="Retention %"
            required
            hint="Held back from every RA bill until handover."
          >
            <Input
              type="number"
              step="any"
              min={0}
              max={20}
              value={retention}
              onChange={(e) => setRetention(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Title" required>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="RCC works — Tower B, plinth to fourth slab"
          />
        </Field>

        <Field label="Scope summary">
          <Textarea
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            placeholder="Shuttering, reinforcement and concreting. Material issued from site stock."
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Issued on" required>
            <Input type="date" value={issued} onChange={(e) => setIssued(e.target.value)} />
          </Field>
          <Field label="Start" required>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="Finish by" required>
            <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        </div>

        <section>
          <h3 className="mb-2 text-[0.9375rem] font-semibold">
            BOQ lines
            {contractor ? (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {tradeLabel(contractor.trade)} lines on this project
              </span>
            ) : null}
          </h3>

          {!contractor ? (
            <p className="rounded-lg bg-muted/40 px-3 py-4 text-center text-xs text-muted-foreground">
              Pick a contractor first — the BOQ lines shown are the ones in their trade.
            </p>
          ) : candidates.length === 0 ? (
            <p className="rounded-lg bg-warning-soft px-3 py-4 text-center text-xs text-warning">
              This project has no {tradeLabel(contractor.trade)} lines on its BOQ yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="w-8 py-2" />
                    <th className="py-2 pr-3 text-left font-medium">BOQ</th>
                    <th className="py-2 pr-3 text-left font-medium">Description</th>
                    <th className="py-2 pr-3 text-right font-medium">BOQ qty</th>
                    <th className="py-2 pr-3 text-right font-medium">BOQ rate</th>
                    <th className="py-2 pr-3 text-right font-medium">Quantity</th>
                    <th className="py-2 pr-3 text-right font-medium">Agreed rate</th>
                    <th className="py-2 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((boq) => {
                    const draft = lines[boq.id];
                    const on = Boolean(draft);
                    const over = on && Number(draft.agreed_rate) > boq.rate;
                    const amount =
                      on ? (Number(draft.quantity) || 0) * (Number(draft.agreed_rate) || 0) : 0;
                    return (
                      <tr key={boq.id} className="border-b border-border/50 last:border-0">
                        <td className="py-2">
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={(e) => toggle(boq, e.target.checked)}
                            aria-label={`Include ${boq.item_code}`}
                            className="size-4 accent-[var(--primary)]"
                          />
                        </td>
                        <td className="py-2 pr-3 font-mono text-xs whitespace-nowrap">
                          {boq.item_code}
                        </td>
                        <td className="min-w-40 py-2 pr-3">{boq.description}</td>
                        <td className="py-2 pr-3 text-right">
                          <Qty value={boq.quantity} unit={boq.unit} />
                        </td>
                        <td className="num py-2 pr-3 text-right text-muted-foreground">
                          {formatInr(boq.rate)}
                        </td>
                        <td className="py-2 pr-3 text-right">
                          <Input
                            type="number"
                            step="any"
                            min={0}
                            disabled={!on}
                            value={draft?.quantity ?? ""}
                            onChange={(e) =>
                              setLines((p) => ({
                                ...p,
                                [boq.id]: { ...p[boq.id], quantity: e.target.value },
                              }))
                            }
                            className="w-24 text-right"
                            aria-label={`Quantity for ${boq.item_code}`}
                          />
                        </td>
                        <td className="py-2 pr-3 text-right">
                          <Input
                            type="number"
                            step="any"
                            min={0}
                            disabled={!on}
                            value={draft?.agreed_rate ?? ""}
                            onChange={(e) =>
                              setLines((p) => ({
                                ...p,
                                [boq.id]: { ...p[boq.id], agreed_rate: e.target.value },
                              }))
                            }
                            aria-invalid={over || undefined}
                            className={cn("w-28 text-right", over && "border-destructive")}
                            aria-label={`Agreed rate for ${boq.item_code}`}
                          />
                        </td>
                        <td className="num py-2 text-right">
                          {on ? formatInr(amount) : <span className="text-muted-foreground">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </FormDialog>
    </>
  );
}
