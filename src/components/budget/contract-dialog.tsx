"use client";

import { useEffect, useState } from "react";
import { FileText, Plus, Trash2 } from "lucide-react";
import { FormDialog } from "@/components/ui-app";
import { Field } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Contractor, WorkOrder, WorkOrderContract } from "@/lib/domain";
import { saveContract, defaultContractFor, newContractRowId } from "@/lib/services";
import { useActor, useProjectRows, useServiceAction } from "@/lib/hooks";
import { formatInr } from "@/lib/format";

type HeadDraft = { id: string; label: string; percent: string };

/**
 * The commercial terms behind a work order's RA bills — Phase 7.
 *
 * Mobilisation instalments and retention release stages are fixed at an even
 * split (two of each, as Manas's own work order has them); only the
 * statutory deduction heads are an open list, because that is the one part
 * the brief asks to be configurable rather than hard-coded.
 */
export function ContractDialog({ projectId, workOrder }: { projectId: string; workOrder: WorkOrder }) {
  const [open, setOpen] = useState(false);
  const contracts = useProjectRows("work_order_contracts", projectId) as WorkOrderContract[];
  const contractors = useProjectRows("contractors", projectId) as Contractor[];
  const contractor = contractors.find((c) => c.id === workOrder.contractor_id);
  const existing = contracts.find((c) => c.work_order_id === workOrder.id);
  const actor = useActor();
  const { run, pending } = useServiceAction();

  const seed = existing ?? (contractor ? defaultContractFor(workOrder, contractor) : undefined);

  const [contractValue, setContractValue] = useState("0");
  const [mobAdvance, setMobAdvance] = useState("10");
  const [advRecoveryPct, setAdvRecoveryPct] = useState("12.5");
  const [advCeilingPct, setAdvCeilingPct] = useState("80");
  const [retention, setRetention] = useState("5");
  const [minBillValue, setMinBillValue] = useState("0");
  const [minBillFrom, setMinBillFrom] = useState("3");
  const [release1Pct, setRelease1Pct] = useState("70");
  const [release1Days, setRelease1Days] = useState("7");
  const [release2Days, setRelease2Days] = useState("30");
  const [dlpMonths, setDlpMonths] = useState("12");
  const [ldPctPerWeek, setLdPctPerWeek] = useState("0.5");
  const [ldCapPct, setLdCapPct] = useState("5");
  const [heads, setHeads] = useState<HeadDraft[]>([]);
  const [remarks, setRemarks] = useState("");

  useEffect(() => {
    if (!open || !seed) return;
    setContractValue(String(seed.contract_value));
    setMobAdvance(String(seed.mobilisation_advance_percent));
    setAdvRecoveryPct(String(seed.advance_recovery_percent));
    setAdvCeilingPct(String(seed.advance_recovery_ceiling_percent));
    setRetention(String(seed.retention_percent));
    setMinBillValue(String(seed.minimum_bill_value));
    setMinBillFrom(String(seed.minimum_bill_value_from_sequence));
    setRelease1Pct(String(seed.payment_release_percent_1));
    setRelease1Days(String(seed.payment_release_days_1));
    setRelease2Days(String(seed.payment_release_days_2));
    setDlpMonths(String(seed.defects_liability_months));
    setLdPctPerWeek(String(seed.ld_percent_per_week));
    setLdCapPct(String(seed.ld_cap_percent));
    setHeads(seed.statutory_deduction_heads.map((h) => ({ id: h.id, label: h.label, percent: String(h.percent) })));
    setRemarks(seed.remarks);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, existing?.id]);

  const release2Pct = 100 - (Number(release1Pct) || 0);
  const dirty = true;

  const invalidReason = (() => {
    if (!(Number(contractValue) > 0)) return "Enter the work order value.";
    if (!(Number(release1Pct) >= 0 && Number(release1Pct) <= 100)) return "Release split must be 0-100%.";
    for (const h of heads) {
      if (!h.label.trim()) return "Every statutory head needs a label.";
      if (!(Number(h.percent) >= 0)) return `${h.label || "A head"} needs a rate.`;
    }
    return undefined;
  })();

  async function submit() {
    await run(
      () =>
        saveContract(
          {
            project_id: projectId,
            work_order_id: workOrder.id,
            contract_value: Number(contractValue) || 0,
            contract_type: "item_rate_remeasurable",
            mobilisation_advance_percent: Number(mobAdvance) || 0,
            mobilisation_instalments: [
              {
                id: "mob-1",
                label: "On acceptance",
                percent: (Number(mobAdvance) || 0) / 2,
                released_at: workOrder.issued_date,
              },
              {
                id: "mob-2",
                label: "On milestone completion",
                percent: (Number(mobAdvance) || 0) / 2,
                released_at: workOrder.issued_date,
              },
            ],
            advance_recovery_percent: Number(advRecoveryPct) || 0,
            advance_recovery_ceiling_percent: Number(advCeilingPct) || 0,
            retention_percent: Number(retention) || 0,
            retention_release_stages: [
              { id: "ret-1", label: "On virtual completion", percent: 50 },
              { id: "ret-2", label: "Against bank guarantee (DLP)", percent: 50 },
            ],
            billing_cycle: "monthly_progressive",
            minimum_bill_value: Number(minBillValue) || 0,
            minimum_bill_value_from_sequence: Number(minBillFrom) || 1,
            payment_release_percent_1: Number(release1Pct) || 0,
            payment_release_days_1: Number(release1Days) || 0,
            payment_release_percent_2: release2Pct,
            payment_release_days_2: Number(release2Days) || 0,
            defects_liability_months: Number(dlpMonths) || 0,
            ld_percent_per_week: Number(ldPctPerWeek) || 0,
            ld_cap_percent: Number(ldCapPct) || 0,
            statutory_deduction_heads: heads.map((h) => ({
              id: h.id,
              label: h.label.trim(),
              percent: Number(h.percent) || 0,
            })),
            remarks,
          },
          actor,
        ),
      {
        success: () => `Terms saved for ${workOrder.wo_number}`,
        onDone: () => setOpen(false),
      },
    );
  }

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <FileText className="size-3.5" /> Work order terms
      </Button>

      <FormDialog
        open={open}
        onOpenChange={setOpen}
        size="lg"
        title={`Work order terms — ${workOrder.wo_number}`}
        context="Drives the RA bill deduction waterfall for every bill raised on this work order."
        dirty={dirty}
        invalidReason={invalidReason}
        submitLabel={existing ? "Save changes" : "Set work order terms"}
        submitting={pending}
        onSubmit={submit}
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Work order value" required>
            <Input type="number" step="any" min={0} value={contractValue} onChange={(e) => setContractValue(e.target.value)} />
          </Field>
          <Field label="Mobilisation advance %" hint="Released in two equal instalments.">
            <Input type="number" step="any" min={0} max={100} value={mobAdvance} onChange={(e) => setMobAdvance(e.target.value)} />
          </Field>
          <Field label="Retention %">
            <Input type="number" step="any" min={0} max={100} value={retention} onChange={(e) => setRetention(e.target.value)} />
          </Field>
          <Field label="Advance recovery % of gross" hint="Deducted from every bill until the advance clears.">
            <Input type="number" step="any" min={0} max={100} value={advRecoveryPct} onChange={(e) => setAdvRecoveryPct(e.target.value)} />
          </Field>
          <Field label="Fully recovered by % completion">
            <Input type="number" step="any" min={0} max={100} value={advCeilingPct} onChange={(e) => setAdvCeilingPct(e.target.value)} />
          </Field>
          <Field label="DLP, months">
            <Input type="number" min={0} value={dlpMonths} onChange={(e) => setDlpMonths(e.target.value)} />
          </Field>
          <Field label="LD % per week">
            <Input type="number" step="any" min={0} value={ldPctPerWeek} onChange={(e) => setLdPctPerWeek(e.target.value)} />
          </Field>
          <Field label="LD cap %">
            <Input type="number" step="any" min={0} value={ldCapPct} onChange={(e) => setLdCapPct(e.target.value)} />
          </Field>
          <Field label="Minimum bill value" hint="Exempt for the first two bills.">
            <Input type="number" step="any" min={0} value={minBillValue} onChange={(e) => setMinBillValue(e.target.value)} />
          </Field>
          <Field label="Applies from RA bill #">
            <Input type="number" min={1} value={minBillFrom} onChange={(e) => setMinBillFrom(e.target.value)} />
          </Field>
          <Field label="Release now, %" hint={`Balance (${release2Pct}%) follows in 30 days.`}>
            <Input type="number" step="any" min={0} max={100} value={release1Pct} onChange={(e) => setRelease1Pct(e.target.value)} />
          </Field>
          <Field label="Release now, within days">
            <Input type="number" min={0} value={release1Days} onChange={(e) => setRelease1Days(e.target.value)} />
          </Field>
          <Field label="Balance, within days">
            <Input type="number" min={0} value={release2Days} onChange={(e) => setRelease2Days(e.target.value)} />
          </Field>
        </div>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[0.9375rem] font-semibold">Statutory deduction heads</h3>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setHeads((p) => [...p, { id: newContractRowId(), label: "", percent: "0" }])}
            >
              <Plus className="size-3.5" /> Add head
            </Button>
          </div>
          {heads.length === 0 ? (
            <p className="rounded-lg bg-muted/40 px-3 py-4 text-center text-xs text-muted-foreground">
              No statutory heads configured — add TDS and any other applicable deduction.
            </p>
          ) : (
            <div className="space-y-2">
              {heads.map((h, i) => (
                <div key={h.id} className="flex items-center gap-2">
                  <Input
                    value={h.label}
                    placeholder="TDS (s.194C)"
                    onChange={(e) =>
                      setHeads((p) => p.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
                    }
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    step="any"
                    min={0}
                    value={h.percent}
                    onChange={(e) =>
                      setHeads((p) => p.map((x, j) => (j === i ? { ...x, percent: e.target.value } : x)))
                    }
                    className="w-24 text-right"
                    aria-label={`Rate for ${h.label || "this head"}`}
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setHeads((p) => p.filter((_, j) => j !== i))}
                    aria-label={`Remove ${h.label || "this head"}`}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>

        <Field label="Remarks">
          <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Terms sourced from the signed work order." />
        </Field>

        {Number(contractValue) > 0 ? (
          <p className="text-xs text-muted-foreground">
            Mobilisation advance: {formatInr(((Number(contractValue) || 0) * (Number(mobAdvance) || 0)) / 100)}
          </p>
        ) : null}
      </FormDialog>
    </>
  );
}
