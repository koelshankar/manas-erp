"use client";

import { useEffect, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, NativeSelect } from "@/components/common";
import { useActor, useLookups, useNewParam, useProjectRows, useServiceAction } from "@/lib/hooks";
import { createSiteTask, updateSiteTask } from "@/lib/services/site-service";
import {
  TRADES,
  type SiteTask,
  type Trade,
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
import { tradeLabel } from "@/config/labels";

const BLOCKS = ["Tower A", "Tower B", "Podium", "Clubhouse", "Basement"];

/** A1 — plan a task against a priced work-order line. */
export function SiteTaskDialog({
  projectId,
  task,
}: {
  projectId: string;
  task?: SiteTask;
}) {
  // The create instance is also opened by the top bar's "+ New" menu.
  const [newRequested, setOpenFromNew] = useNewParam();
  const [open, setOpenState] = useState(false);
  const isNew = !task;
  const openState = open || (isNew && newRequested);
  const setOpen = (v: boolean) => {
    setOpenState(v);
    if (!v) setOpenFromNew(false);
  };
  const workOrders = useProjectRows("work_orders", projectId) as WorkOrder[];
  const woLines = useProjectRows(
    "work_order_lines",
    projectId,
  ) as WorkOrderLine[];
  const lookup = useLookups();
  const actor = useActor();
  const { run, pending } = useServiceAction();

  const [form, setForm] = useState({
    title: "",
    description: "",
    work_order_id: "",
    work_order_line_id: "",
    trade: "general" as Trade,
    location_block: BLOCKS[0],
    planned_start: "",
    planned_end: "",
  });

  useEffect(() => {
    if (!openState) return;
    setForm(
      task
        ? {
            title: task.title,
            description: task.description,
            work_order_id: task.work_order_id ?? "",
            work_order_line_id: task.work_order_line_id ?? "",
            trade: task.trade,
            location_block: task.location_block,
            planned_start: task.planned_start,
            planned_end: task.planned_end,
          }
        : {
            title: "",
            description: "",
            work_order_id: "",
            work_order_line_id: "",
            trade: "general" as Trade,
            location_block: BLOCKS[0],
            planned_start: "",
            planned_end: "",
          },
    );
  }, [openState, task]);

  const lines = woLines.filter((l) => l.work_order_id === form.work_order_id);

  async function submit() {
    await run(
      () =>
        task
          ? updateSiteTask(
              { site_task_id: task.id, project_id: projectId, ...form },
              actor,
            )
          : createSiteTask(
              { project_id: projectId, ...form, assigned_contractor_id: null },
              actor,
            ),
      {
        success: task ? "Task updated" : "Task planned",
        view: `/projects/${projectId}/site/tasks`,
        onDone: () => setOpen(false),
      },
    );
  }

  return (
    <>
      {task ? (
        <Button variant="ghost" size="xs" onClick={() => setOpen(true)}>
          <Pencil className="size-3" /> Edit
        </Button>
      ) : (
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="size-3.5" /> Plan task
        </Button>
      )}

      <AppDialog open={openState} onOpenChange={setOpen} size="md">
        <AppDialogHeader>
          <AppDialogTitle>
            {task ? "Edit site task" : "Plan a site task"}
          </AppDialogTitle>
          <AppDialogDescription>
            A1 — a task delivers one work-order line. Daily progress is reported
            against that line, which is what drives Work Done vs Balance.
          </AppDialogDescription>
        </AppDialogHeader>
        <AppDialogBody>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Title" required className="sm:col-span-2">
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Slab casting, Tower A third floor"
              />
            </Field>

            <Field label="Work order" required>
              <NativeSelect
                value={form.work_order_id}
                disabled={Boolean(task)}
                onChange={(e) =>
                  setForm({
                    ...form,
                    work_order_id: e.target.value,
                    work_order_line_id: "",
                  })
                }
              >
                <option value="">Select a work order</option>
                {workOrders.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.wo_number} — {lookup.contractor(w.contractor_id)}
                  </option>
                ))}
              </NativeSelect>
            </Field>

            <Field label="Work-order line" required>
              <NativeSelect
                value={form.work_order_line_id}
                disabled={Boolean(task) || !form.work_order_id}
                onChange={(e) => {
                  const line = woLines.find((l) => l.id === e.target.value);
                  setForm({
                    ...form,
                    work_order_line_id: e.target.value,
                    title: form.title || (line?.description ?? ""),
                  });
                }}
              >
                <option value="">
                  {form.work_order_id
                    ? "Select a line"
                    : "Pick a work order first"}
                </option>
                {lines.map((l) => (
                  <option key={l.id} value={l.id}>
                    {lookup.boqItem(l.boq_line_id)} — {l.description}
                  </option>
                ))}
              </NativeSelect>
            </Field>

            <Field label="Trade" required>
              <NativeSelect
                value={form.trade}
                onChange={(e) =>
                  setForm({ ...form, trade: e.target.value as Trade })
                }
              >
                {TRADES.map((t) => (
                  <option key={t} value={t}>
                    {tradeLabel(t)}
                  </option>
                ))}
              </NativeSelect>
            </Field>

            <Field label="Location">
              <NativeSelect
                value={form.location_block}
                onChange={(e) =>
                  setForm({ ...form, location_block: e.target.value })
                }
              >
                {BLOCKS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </NativeSelect>
            </Field>

            <Field label="Planned start" required>
              <Input
                type="date"
                value={form.planned_start}
                onChange={(e) =>
                  setForm({ ...form, planned_start: e.target.value })
                }
              />
            </Field>
            <Field label="Planned end" required>
              <Input
                type="date"
                value={form.planned_end}
                onChange={(e) =>
                  setForm({ ...form, planned_end: e.target.value })
                }
              />
            </Field>

            <Field label="Description" className="sm:col-span-2">
              <Input
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
              />
            </Field>
          </div>
        </AppDialogBody>

        <AppDialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </AppDialogFooter>
      </AppDialog>
    </>
  );
}
