"use client";

import { useState } from "react";
import { PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/common";
import { FormDialog } from "@/components/ui-app";
import { useActor, useServiceAction } from "@/lib/hooks";
import { addDrawingRevision } from "@/lib/services/drawing-service";
import { DRAWING_REVISION_CODES } from "@/lib/domain";
import type { Drawing } from "@/lib/domain";

/** Adds the next revision, R1 through R4, to a drawing already on the register. */
export function AddRevisionDialog({
  drawing,
  today,
}: {
  drawing: Drawing;
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const actor = useActor();
  const { run, pending } = useServiceAction();

  const [revisionDate, setRevisionDate] = useState(today);
  const [copies, setCopies] = useState("2");
  const [remarks, setRemarks] = useState("");

  const atLimit =
    DRAWING_REVISION_CODES.indexOf(drawing.current_revision_code ?? "R0") >=
    DRAWING_REVISION_CODES.length - 1;
  const nextCode = drawing.current_revision_code
    ? DRAWING_REVISION_CODES[DRAWING_REVISION_CODES.indexOf(drawing.current_revision_code) + 1]
    : "R0";

  async function submit() {
    await run(
      () =>
        addDrawingRevision(
          {
            drawing_id: drawing.id,
            revision_date: revisionDate,
            copies_received: Number(copies) || 0,
            remarks,
          },
          actor,
        ),
      {
        success: (result) => `${result.drawing.drawing_no} is now at ${result.revision.revision_code}`,
        onDone: () => {
          setOpen(false);
          setRevisionDate(today);
          setCopies("2");
          setRemarks("");
        },
      },
    );
  }

  if (atLimit) {
    return (
      <Button size="xs" variant="ghost" disabled>
        R0–R4 used
      </Button>
    );
  }

  return (
    <>
      <Button size="xs" variant="outline" onClick={() => setOpen(true)}>
        <PenLine className="size-3.5" /> Add revision
      </Button>

      <FormDialog
        open={open}
        onOpenChange={setOpen}
        size="sm"
        title={`Add ${nextCode} — ${drawing.drawing_no}`}
        context={`${drawing.title}. Revisions run in order, so this becomes ${nextCode}.`}
        dirty={remarks.trim().length > 0}
        invalidReason={!revisionDate ? "The revision needs a date" : undefined}
        submitLabel="Add revision"
        submitting={pending}
        onSubmit={submit}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Revision date" required>
            <Input type="date" value={revisionDate} onChange={(e) => setRevisionDate(e.target.value)} />
          </Field>
          <Field label="Copies received">
            <Input type="number" min={0} value={copies} onChange={(e) => setCopies(e.target.value)} />
          </Field>
          <Field label="Remarks" className="sm:col-span-2" hint="What the register's status column will read.">
            <Input
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Revised as per site query"
            />
          </Field>
        </div>
      </FormDialog>
    </>
  );
}
