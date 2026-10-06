"use client";

import { useState } from "react";
import { FileStack } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, NativeSelect } from "@/components/common";
import { FormDialog } from "@/components/ui-app";
import { useActor, useNewParam, useServiceAction } from "@/lib/hooks";
import { createDrawing, updateDrawing } from "@/lib/services/drawing-service";
import { drawingDisciplineLabel } from "@/config/labels";
import { DRAWING_DISCIPLINES, DRAWING_SHEET_SIZES } from "@/lib/domain";
import type { Drawing, DrawingDiscipline, DrawingSheetSize } from "@/lib/domain";

/**
 * Logs a new drawing, with the first revision that comes with it — their
 * register never has a row with no revision at all, so the two are one form.
 *
 * Editing an existing drawing only touches its own particulars (title,
 * discipline, sheet size, consultant); a revision is added separately, from
 * the register row, through `AddRevisionDialog`.
 */
export function DrawingDialog({
  projectId,
  today,
  editing,
  trigger = "button",
}: {
  projectId: string;
  today: string;
  editing?: Drawing | null;
  trigger?: "button" | "none";
}) {
  const isEdit = Boolean(editing);
  const [newOpen, setNewOpen] = useNewParam();
  const [editOpen, setEditOpen] = useState(false);
  const open = isEdit ? editOpen : newOpen;
  const setOpen = isEdit ? setEditOpen : setNewOpen;

  const actor = useActor();
  const { run, pending } = useServiceAction();

  const [form, setForm] = useState(() => initial(editing, today));

  function set<K extends keyof ReturnType<typeof initial>>(
    key: K,
    value: ReturnType<typeof initial>[K],
  ) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const invalidReason = !form.drawing_no.trim()
    ? "Give the drawing a number"
    : form.title.trim().length < 2
      ? "Give the drawing a title"
      : !isEdit && !form.revision_date
        ? "The first revision needs a date"
        : undefined;

  async function submit() {
    if (isEdit && editing) {
      await run(
        () =>
          updateDrawing(
            {
              drawing_id: editing.id,
              title: form.title,
              discipline: form.discipline,
              sheet_size: form.sheet_size,
              consultant: form.consultant,
            },
            actor,
          ),
        {
          success: (result) => `${result.drawing_no} updated`,
          view: `/projects/${projectId}/drawings/register`,
          onDone: () => setOpen(false),
        },
      );
      return;
    }

    await run(
      () =>
        createDrawing(
          {
            project_id: projectId,
            drawing_no: form.drawing_no,
            title: form.title,
            discipline: form.discipline,
            sheet_size: form.sheet_size,
            consultant: form.consultant,
            revision_date: form.revision_date,
            copies_received: Number(form.copies_received) || 0,
            remarks: form.remarks,
          },
          actor,
        ),
      {
        success: (result) => `${result.drawing.drawing_no} added to the register at R0`,
        view: `/projects/${projectId}/drawings/register`,
        onDone: () => {
          setOpen(false);
          setForm(initial(null, today));
        },
      },
    );
  }

  return (
    <>
      {trigger === "button" ? (
        <Button size="sm" variant={isEdit ? "outline" : "default"} onClick={() => setOpen(true)}>
          <FileStack className="size-3.5" /> {isEdit ? "Edit" : "Add drawing"}
        </Button>
      ) : null}

      <FormDialog
        open={open}
        onOpenChange={setOpen}
        size="md"
        title={isEdit ? `Edit ${editing?.drawing_no}` : "Add a drawing"}
        context={
          isEdit
            ? "The drawing's own particulars. Add a revision from the register row instead."
            : "Logged with its first revision, R0 — exactly how their register starts a new sheet."
        }
        dirty={form.title.trim().length > 0}
        invalidReason={invalidReason}
        submitLabel={isEdit ? "Save changes" : "Add to register"}
        submitting={pending}
        onSubmit={submit}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Drawing no." required>
            <Input
              value={form.drawing_no}
              onChange={(e) => set("drawing_no", e.target.value)}
              disabled={isEdit}
              placeholder="A-101"
            />
          </Field>
          <Field label="Discipline" required>
            <NativeSelect
              value={form.discipline}
              onChange={(e) => set("discipline", e.target.value as DrawingDiscipline)}
            >
              {DRAWING_DISCIPLINES.map((d) => (
                <option key={d} value={d}>
                  {drawingDisciplineLabel(d)}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Title" required className="sm:col-span-2">
            <Input value={form.title} onChange={(e) => set("title", e.target.value)} />
          </Field>
          <Field label="Sheet size" required>
            <NativeSelect
              value={form.sheet_size}
              onChange={(e) => set("sheet_size", e.target.value as DrawingSheetSize)}
            >
              {DRAWING_SHEET_SIZES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Consultant / issued by">
            <Input value={form.consultant} onChange={(e) => set("consultant", e.target.value)} />
          </Field>
        </div>

        {!isEdit ? (
          <div className="space-y-3 border-t border-border pt-4">
            <p className="text-xs font-medium text-muted-foreground">First revision — R0</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Revision date" required>
                <Input
                  type="date"
                  value={form.revision_date}
                  onChange={(e) => set("revision_date", e.target.value)}
                />
              </Field>
              <Field label="Copies received">
                <Input
                  type="number"
                  min={0}
                  value={form.copies_received}
                  onChange={(e) => set("copies_received", e.target.value)}
                />
              </Field>
              <Field label="Remarks" className="sm:col-span-2">
                <Input
                  value={form.remarks}
                  onChange={(e) => set("remarks", e.target.value)}
                  placeholder="Issued for construction"
                />
              </Field>
            </div>
          </div>
        ) : null}
      </FormDialog>
    </>
  );
}

function initial(drawing: Drawing | null | undefined, today: string) {
  return {
    drawing_no: drawing?.drawing_no ?? "",
    title: drawing?.title ?? "",
    discipline: (drawing?.discipline ?? "architectural") as DrawingDiscipline,
    sheet_size: (drawing?.sheet_size ?? "A1") as DrawingSheetSize,
    consultant: drawing?.consultant ?? "",
    revision_date: today,
    copies_received: "2",
    remarks: "",
  };
}
