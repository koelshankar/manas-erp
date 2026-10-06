"use client";

import { useState } from "react";
import { Plus, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, NativeSelect } from "@/components/common";
import { FormDialog } from "@/components/ui-app";
import {
  useActor,
  useNewParam,
  useProjectRows,
  useServiceAction,
} from "@/lib/hooks";
import { createTransmittal, updateTransmittal } from "@/lib/services/transmittal-service";
import {
  transmittalDocumentTypeLabel,
  transmittalPurposeLabel,
} from "@/config/labels";
import { TRANSMITTAL_DOCUMENT_TYPES, TRANSMITTAL_PURPOSES } from "@/lib/domain";
import type {
  Drawing,
  DrawingRevision,
  Transmittal,
  TransmittalDocumentType,
  TransmittalLine,
  TransmittalPurpose,
} from "@/lib/domain";

type DraftLine = { drawing_id: string; revision_code: string; copies: string };
const BLANK: DraftLine = { drawing_id: "", revision_code: "", copies: "1" };

/**
 * A transmittal, with its lines picked from the register.
 *
 * **Lines never create a drawing.** The drawing and revision pickers only
 * ever offer what the register already holds, so there is no way to type a
 * drawing number here that does not exist on it (acceptance criterion 5).
 */
export function TransmittalDialog({
  projectId,
  today,
  editing,
  trigger = "button",
}: {
  projectId: string;
  today: string;
  editing?: Transmittal | null;
  trigger?: "button" | "none";
}) {
  const isEdit = Boolean(editing);
  const [newOpen, setNewOpen] = useNewParam();
  const [editOpen, setEditOpen] = useState(false);
  const open = isEdit ? editOpen : newOpen;
  const setOpen = isEdit ? setEditOpen : setNewOpen;

  const drawings = useProjectRows("drawings", projectId) as Drawing[];
  const revisions = useProjectRows("drawing_revisions", projectId) as DrawingRevision[];
  const existingLines = useProjectRows("transmittal_lines", projectId) as TransmittalLine[];
  const actor = useActor();
  const { run, pending } = useServiceAction();

  const [form, setForm] = useState(() => initial(editing, today));
  const [lines, setLines] = useState<DraftLine[]>(() =>
    editing
      ? existingLines
          .filter((l) => l.transmittal_id === editing.id)
          .map((l) => ({
            drawing_id: l.drawing_id,
            revision_code: l.revision_code,
            copies: String(l.copies),
          }))
      : [{ ...BLANK }],
  );

  function set<K extends keyof ReturnType<typeof initial>>(
    key: K,
    value: ReturnType<typeof initial>[K],
  ) {
    setForm((f) => ({ ...f, [key]: value }));
  }
  function setLine(index: number, patch: Partial<DraftLine>) {
    setLines((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  const revisionsOf = (drawing_id: string) =>
    revisions
      .filter((r) => r.drawing_id === drawing_id)
      .sort((a, b) => a.revision_code.localeCompare(b.revision_code));

  const filled = lines.filter((l) => l.drawing_id && l.revision_code && Number(l.copies) > 0);

  const invalidReason = !form.to_name.trim()
    ? "Say who this is going to"
    : !form.from_name.trim()
      ? "Say who is issuing it"
      : filled.length === 0
        ? "Pick at least one drawing"
        : undefined;

  async function submit() {
    const payload = {
      project_id: projectId,
      transmittal_date: form.transmittal_date,
      to_name: form.to_name,
      to_company: form.to_company,
      to_address: form.to_address,
      from_name: form.from_name,
      from_designation: form.from_designation,
      document_type: form.document_type,
      purpose_of_issue: form.purpose_of_issue,
      mode_of_transmission: form.mode_of_transmission,
      remarks: form.remarks,
      lines: filled.map((l) => ({
        drawing_id: l.drawing_id,
        revision_code: l.revision_code,
        copies: Number(l.copies),
      })),
    };

    await run(
      () =>
        editing
          ? updateTransmittal({ ...payload, transmittal_id: editing.id }, actor)
          : createTransmittal(payload, actor),
      {
        success: (result) =>
          editing
            ? `${result.transmittal.transmittal_number} updated`
            : `${result.transmittal.transmittal_number} drafted — issue it to lock it in`,
        view: `/projects/${projectId}/drawings/transmittals`,
        onDone: () => {
          setOpen(false);
          if (!editing) {
            setForm(initial(null, today));
            setLines([{ ...BLANK }]);
          }
        },
      },
    );
  }

  return (
    <>
      {trigger === "button" ? (
        <Button size="sm" variant={isEdit ? "outline" : "default"} onClick={() => setOpen(true)}>
          <Send className="size-3.5" /> {isEdit ? "Edit" : "New transmittal"}
        </Button>
      ) : null}

      <FormDialog
        open={open}
        onOpenChange={setOpen}
        size="lg"
        title={isEdit ? `Edit ${editing?.transmittal_number}` : "New drawing transmittal"}
        context="Drawings going out to a contractor or consultant, picked from the register."
        dirty={filled.length > 0}
        invalidReason={invalidReason}
        submitLabel={isEdit ? "Save changes" : "Save as draft"}
        submitting={pending}
        onSubmit={submit}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Date" required>
            <Input
              type="date"
              value={form.transmittal_date}
              onChange={(e) => set("transmittal_date", e.target.value)}
            />
          </Field>
          <Field label="Document type" required>
            <NativeSelect
              value={form.document_type}
              onChange={(e) => set("document_type", e.target.value as TransmittalDocumentType)}
            >
              {TRANSMITTAL_DOCUMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {transmittalDocumentTypeLabel(t)}
                </option>
              ))}
            </NativeSelect>
          </Field>

          <Field label="To" required hint="Name of whoever is receiving it.">
            <Input value={form.to_name} onChange={(e) => set("to_name", e.target.value)} />
          </Field>
          <Field label="Company">
            <Input value={form.to_company} onChange={(e) => set("to_company", e.target.value)} />
          </Field>
          <Field label="Address" className="sm:col-span-2">
            <Input value={form.to_address} onChange={(e) => set("to_address", e.target.value)} />
          </Field>

          <Field label="From" required>
            <Input value={form.from_name} onChange={(e) => set("from_name", e.target.value)} />
          </Field>
          <Field label="Designation">
            <Input
              value={form.from_designation}
              onChange={(e) => set("from_designation", e.target.value)}
            />
          </Field>

          <Field label="Purpose of issue" required>
            <NativeSelect
              value={form.purpose_of_issue}
              onChange={(e) => set("purpose_of_issue", e.target.value as TransmittalPurpose)}
            >
              {TRANSMITTAL_PURPOSES.map((p) => (
                <option key={p} value={p}>
                  {transmittalPurposeLabel(p)}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Mode of transmission">
            <Input
              value={form.mode_of_transmission}
              onChange={(e) => set("mode_of_transmission", e.target.value)}
              placeholder="Hand delivery, email, courier…"
            />
          </Field>

          <Field label="Remarks" className="sm:col-span-2">
            <Input value={form.remarks} onChange={(e) => set("remarks", e.target.value)} />
          </Field>
        </div>

        <section>
          <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
            <h3 className="text-sm font-semibold">Drawings</h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setLines((rows) => [...rows, { ...BLANK }])}
            >
              <Plus className="size-3.5" /> Add a drawing
            </Button>
          </div>

          <div className="space-y-3">
            {lines.map((line, index) => {
              const drawing = drawings.find((d) => d.id === line.drawing_id);
              const options = revisionsOf(line.drawing_id);
              return (
                <div key={index} className="rounded-xl border border-border p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      Line {index + 1}
                    </span>
                    {lines.length > 1 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove line ${index + 1}`}
                        onClick={() => setLines((rows) => rows.filter((_, i) => i !== index))}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    ) : null}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label="Drawing" required>
                      <NativeSelect
                        value={line.drawing_id}
                        onChange={(e) => setLine(index, { drawing_id: e.target.value, revision_code: "" })}
                      >
                        <option value="">Pick a drawing</option>
                        {drawings.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.drawing_no} — {d.title}
                          </option>
                        ))}
                      </NativeSelect>
                    </Field>
                    <Field label="Revision" required hint={!drawing ? "Pick a drawing first" : undefined}>
                      <NativeSelect
                        value={line.revision_code}
                        disabled={!drawing}
                        onChange={(e) => setLine(index, { revision_code: e.target.value })}
                      >
                        <option value="">Pick a revision</option>
                        {options.map((r) => (
                          <option key={r.id} value={r.revision_code}>
                            {r.revision_code}
                          </option>
                        ))}
                      </NativeSelect>
                    </Field>
                    <Field label="Copies" required>
                      <Input
                        type="number"
                        min={1}
                        value={line.copies}
                        onChange={(e) => setLine(index, { copies: e.target.value })}
                      />
                    </Field>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </FormDialog>
    </>
  );
}

function initial(transmittal: Transmittal | null | undefined, today: string) {
  return {
    transmittal_date: transmittal?.transmittal_date ?? today,
    to_name: transmittal?.to_name ?? "",
    to_company: transmittal?.to_company ?? "",
    to_address: transmittal?.to_address ?? "",
    from_name: transmittal?.from_name ?? "",
    from_designation: transmittal?.from_designation ?? "",
    document_type: (transmittal?.document_type ?? "drawing") as TransmittalDocumentType,
    purpose_of_issue: (transmittal?.purpose_of_issue ?? "for_construction") as TransmittalPurpose,
    mode_of_transmission: transmittal?.mode_of_transmission ?? "",
    remarks: transmittal?.remarks ?? "",
  };
}
