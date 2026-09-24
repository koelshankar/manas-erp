"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Field, NativeSelect, Warning } from "@/components/common";
import { useActor, useLookups, useNewParam, useProjectRows, useServiceAction } from "@/lib/hooks";
import { submitDpr } from "@/lib/services/site-service";
import { formatNumber } from "@/lib/format";
import {
  LABOUR_TRADES,
  type Dpr,
  type LabourTrade,
  type SiteTask,
  type WorkOrder,
  type WorkOrderLine,
} from "@/lib/domain";
import {
  AppDialog,
  AppDialogBody,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from "@/components/ui-app";
import { labourTradeLabel } from "@/config/labels";

const WEATHERS = ["Clear", "Humid", "Overcast", "Light showers", "Heavy rain"];

type ProgressRow = {
  key: number;
  work_order_line_id: string;
  qty_done_today: string;
  remarks: string;
};
type LabourRow = {
  key: number;
  contractor_id: string;
  trade: LabourTrade;
  count: string;
};

/**
 * A3 — the day's report.
 *
 * Progress rows are the only thing that moves Work Done vs Balance, so the
 * form shows each line's work-order quantity and what is already done.
 */
export function DprFormSheet({
  projectId,
  defaultDate,
  label = "Submit today's DPR",
}: {
  projectId: string;
  defaultDate: string;
  label?: string;
}) {
  // Opened by the top bar's "+ New" menu via ?new=1, or by the button below.
  const [open, setOpen] = useNewParam();
  const [reportDate, setReportDate] = useState(defaultDate);
  const [weather, setWeather] = useState(WEATHERS[0]);
  const [remarks, setRemarks] = useState("");
  const [progress, setProgress] = useState<ProgressRow[]>([
    { key: 0, work_order_line_id: "", qty_done_today: "", remarks: "" },
  ]);
  const [labour, setLabour] = useState<LabourRow[]>([
    { key: 0, contractor_id: "", trade: "mason", count: "" },
  ]);
  const [nextKey, setNextKey] = useState(1);

  const dprs = useProjectRows("dprs", projectId) as Dpr[];
  const woLines = useProjectRows(
    "work_order_lines",
    projectId,
  ) as WorkOrderLine[];
  const workOrders = useProjectRows("work_orders", projectId) as WorkOrder[];
  const tasks = useProjectRows("site_tasks", projectId) as SiteTask[];
  const lookup = useLookups();
  const actor = useActor();
  const { run, pending } = useServiceAction();

  const taken = useMemo(() => new Set(dprs.map((d) => d.report_date)), [dprs]);
  const alreadyFiled = taken.has(reportDate);
  const contractors = useMemo(
    () => [...new Set(workOrders.map((w) => w.contractor_id))],
    [workOrders],
  );
  const taskByLine = useMemo(
    () => new Map(tasks.map((t) => [t.work_order_line_id ?? "", t])),
    [tasks],
  );

  function reset() {
    setReportDate(defaultDate);
    setWeather(WEATHERS[0]);
    setRemarks("");
    setProgress([
      { key: 0, work_order_line_id: "", qty_done_today: "", remarks: "" },
    ]);
    setLabour([{ key: 0, contractor_id: "", trade: "mason", count: "" }]);
    setNextKey(1);
  }

  async function submit() {
    await run(
      () =>
        submitDpr(
          {
            project_id: projectId,
            report_date: reportDate,
            weather,
            remarks,
            progress: progress
              .filter(
                (r) => r.work_order_line_id && Number(r.qty_done_today) > 0,
              )
              .map((r) => ({
                work_order_line_id: r.work_order_line_id,
                site_task_id: taskByLine.get(r.work_order_line_id)?.id ?? null,
                qty_done_today: Number(r.qty_done_today),
                remarks: r.remarks,
              })),
            labour: labour
              .filter((r) => r.contractor_id && Number(r.count) > 0)
              .map((r) => ({
                contractor_id: r.contractor_id,
                trade: r.trade,
                count: Number(r.count),
                remarks: "",
              })),
          },
          actor,
        ),
      {
        success: (r) => `Report filed for ${r.dpr.report_date}`,
        view: `/projects/${projectId}/site/dpr`,
        onDone: () => {
          setOpen(false);
          reset();
        },
      },
    );
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-3.5" /> {label}
      </Button>

      <AppDialog open={open} onOpenChange={setOpen} size="xl">
        <AppDialogHeader>
          <AppDialogTitle>Daily progress report</AppDialogTitle>
          <AppDialogDescription>
            A3 — one report per day. Progress here is what Work Done vs Balance
            and every measurement after it are built on.
          </AppDialogDescription>
        </AppDialogHeader>

        <AppDialogBody className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field
              label="Report date"
              required
              error={
                alreadyFiled
                  ? "A report already exists for this date"
                  : undefined
              }
            >
              <Input
                type="date"
                value={reportDate}
                onChange={(e) => setReportDate(e.target.value)}
                aria-invalid={alreadyFiled || undefined}
              />
            </Field>
            <Field label="Weather">
              <NativeSelect
                value={weather}
                onChange={(e) => setWeather(e.target.value)}
              >
                {WEATHERS.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Remarks">
              <Input
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Anything worth recording"
              />
            </Field>
          </div>

          <section>
            <h3 className="mb-2 text-sm font-semibold">Progress</h3>
            <div className="space-y-2">
              {progress.map((row) => {
                const line = woLines.find(
                  (l) => l.id === row.work_order_line_id,
                );
                return (
                  <Card key={row.key} size="sm" className="px-3">
                    <div className="grid items-end gap-2 sm:grid-cols-[1fr_7rem_1fr_auto]">
                      <Field label="Work-order line">
                        <NativeSelect
                          value={row.work_order_line_id}
                          onChange={(e) =>
                            setProgress((rows) =>
                              rows.map((r) =>
                                r.key === row.key
                                  ? { ...r, work_order_line_id: e.target.value }
                                  : r,
                              ),
                            )
                          }
                        >
                          <option value="">Select a line</option>
                          {woLines.map((l) => (
                            <option key={l.id} value={l.id}>
                              {lookup.workOrder(l.work_order_id)} ·{" "}
                              {lookup.boqItem(l.boq_line_id)} — {l.description}
                            </option>
                          ))}
                        </NativeSelect>
                      </Field>
                      <Field label={`Done${line ? ` (${line.unit})` : ""}`}>
                        <Input
                          type="number"
                          step="any"
                          min={0}
                          value={row.qty_done_today}
                          onChange={(e) =>
                            setProgress((rows) =>
                              rows.map((r) =>
                                r.key === row.key
                                  ? { ...r, qty_done_today: e.target.value }
                                  : r,
                              ),
                            )
                          }
                        />
                      </Field>
                      <Field label="Remarks">
                        <Input
                          value={row.remarks}
                          onChange={(e) =>
                            setProgress((rows) =>
                              rows.map((r) =>
                                r.key === row.key
                                  ? { ...r, remarks: e.target.value }
                                  : r,
                              ),
                            )
                          }
                        />
                      </Field>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Remove progress row"
                        onClick={() =>
                          setProgress((rows) =>
                            rows.filter((r) => r.key !== row.key),
                          )
                        }
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                    {line ? (
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        Work order {formatNumber(line.quantity, 2)} {line.unit}{" "}
                        · done to date {formatNumber(line.done_qty, 2)} ·
                        balance {formatNumber(line.quantity - line.done_qty, 2)}
                      </p>
                    ) : null}
                  </Card>
                );
              })}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setProgress((rows) => [
                    ...rows,
                    {
                      key: nextKey,
                      work_order_line_id: "",
                      qty_done_today: "",
                      remarks: "",
                    },
                  ]);
                  setNextKey((k) => k + 1);
                }}
              >
                <Plus className="size-3.5" /> Add progress row
              </Button>
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold">Labour strength</h3>
            <div className="space-y-2">
              {labour.map((row) => (
                <Card key={row.key} size="sm" className="px-3">
                  <div className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_7rem_auto]">
                    <Field label="Contractor">
                      <NativeSelect
                        value={row.contractor_id}
                        onChange={(e) =>
                          setLabour((rows) =>
                            rows.map((r) =>
                              r.key === row.key
                                ? { ...r, contractor_id: e.target.value }
                                : r,
                            ),
                          )
                        }
                      >
                        <option value="">Select a contractor</option>
                        {contractors.map((id) => (
                          <option key={id} value={id}>
                            {lookup.contractor(id)}
                          </option>
                        ))}
                      </NativeSelect>
                    </Field>
                    <Field label="Trade">
                      <NativeSelect
                        value={row.trade}
                        onChange={(e) =>
                          setLabour((rows) =>
                            rows.map((r) =>
                              r.key === row.key
                                ? { ...r, trade: e.target.value as LabourTrade }
                                : r,
                            ),
                          )
                        }
                      >
                        {LABOUR_TRADES.map((t) => (
                          <option key={t} value={t}>
                            {labourTradeLabel(t)}
                          </option>
                        ))}
                      </NativeSelect>
                    </Field>
                    <Field label="Head count">
                      <Input
                        type="number"
                        min={0}
                        value={row.count}
                        onChange={(e) =>
                          setLabour((rows) =>
                            rows.map((r) =>
                              r.key === row.key
                                ? { ...r, count: e.target.value }
                                : r,
                            ),
                          )
                        }
                      />
                    </Field>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Remove labour row"
                      onClick={() =>
                        setLabour((rows) =>
                          rows.filter((r) => r.key !== row.key),
                        )
                      }
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </Card>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setLabour((rows) => [
                    ...rows,
                    {
                      key: nextKey,
                      contractor_id: "",
                      trade: "mason",
                      count: "",
                    },
                  ]);
                  setNextKey((k) => k + 1);
                }}
              >
                <Plus className="size-3.5" /> Add labour row
              </Button>
            </div>
          </section>

          {alreadyFiled ? (
            <Warning>
              {reportDate} already has a report. Pick another date — a day can
              only be reported once.
            </Warning>
          ) : null}
        </AppDialogBody>

        <AppDialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || alreadyFiled}>
            {pending ? "Filing…" : "File report"}
          </Button>
        </AppDialogFooter>
      </AppDialog>
    </>
  );
}
