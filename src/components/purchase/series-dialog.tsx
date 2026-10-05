"use client";

import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/common";
import { useActor, useServiceAction } from "@/lib/hooks";
import { updateDocumentSeries } from "@/lib/services/po-master-service";
import { documentNumberPrefix, formatDocumentNumber } from "@/lib/services/document-number";
import { documentKindLabel } from "@/config/labels";
import type { DocumentSeries } from "@/lib/domain";
import {
  AppDialog,
  AppDialogBody,
  AppDialogFooter,
  AppDialogHeader,
  SubmitButton,
} from "@/components/ui-app";

/**
 * Edits one document series.
 *
 * The sample under the form is the whole point: a numbering setting read as a
 * list of flags means nothing, and the only question anybody actually has is
 * what the next number will look like.
 */
export function SeriesDialog({ series }: { series: DocumentSeries }) {
  const [open, setOpen] = useState(false);
  const [prefix, setPrefix] = useState(series.prefix);
  const [width, setWidth] = useState(String(series.serial_width));
  const [start, setStart] = useState(String(series.start_serial));
  const [withProject, setWithProject] = useState(series.include_project_code);
  const [withFy, setWithFy] = useState(series.include_financial_year);
  const [separator, setSeparator] = useState(series.separator);
  const actor = useActor();
  const { run, pending } = useServiceAction();

  useEffect(() => {
    if (!open) return;
    setPrefix(series.prefix);
    setWidth(String(series.serial_width));
    setStart(String(series.start_serial));
    setWithProject(series.include_project_code);
    setWithFy(series.include_financial_year);
    setSeparator(series.separator);
  }, [open, series]);

  const shape = {
    prefix: prefix.trim() || series.kind,
    serial_width: Math.min(Math.max(Number(width) || 1, 1), 8),
    include_project_code: withProject,
    include_financial_year: withFy,
    separator: separator || "/",
  };
  const sample = formatDocumentNumber(
    "MSP",
    series.kind,
    "26-27",
    Number(start) || 1,
    shape,
  );

  const invalidReason = !/^[A-Za-z0-9-]+$/.test(prefix.trim())
    ? "A prefix uses letters, digits and hyphens only."
    : separator.length !== 1
      ? "The separator is a single character."
      : undefined;

  async function submit() {
    await run(
      () =>
        updateDocumentSeries(
          series.id,
          {
            prefix: prefix.trim(),
            serial_width: shape.serial_width,
            start_serial: Number(start) || 1,
            include_project_code: withProject,
            include_financial_year: withFy,
            separator: shape.separator,
          },
          actor,
        ),
      {
        success: `${documentKindLabel(series.kind)} numbering saved`,
        view: "/masters/numbering",
        onDone: () => setOpen(false),
      },
    );
  }

  return (
    <>
      <Button
        variant="ghost"
        size="xs"
        onClick={() => setOpen(true)}
        aria-label={`Edit ${documentKindLabel(series.kind)} numbering`}
      >
        <Pencil className="size-3" /> Edit
      </Button>
      <AppDialog open={open} onOpenChange={setOpen} size="md">
        <AppDialogHeader
          title={`${documentKindLabel(series.kind)} numbering`}
          context="Changes apply to the next document only. Everything already issued keeps its number."
        />
        <AppDialogBody>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Prefix" required hint="The segment naming the document.">
              <Input value={prefix} onChange={(e) => setPrefix(e.target.value)} />
            </Field>
            <Field label="Separator" required>
              <Input
                value={separator}
                maxLength={1}
                onChange={(e) => setSeparator(e.target.value)}
              />
            </Field>
            <Field label="Serial width" hint="4 gives 0007.">
              <Input
                type="number"
                min={1}
                max={8}
                value={width}
                onChange={(e) => setWidth(e.target.value)}
              />
            </Field>
            <Field
              label="Start from"
              hint="What the first document of a year takes, for continuing an existing series."
            >
              <Input
                type="number"
                min={1}
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </Field>
          </div>

          <div className="flex flex-wrap gap-6 pt-1">
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4"
                checked={withProject}
                onChange={(e) => setWithProject(e.target.checked)}
              />
              Lead with the project code
            </label>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4"
                checked={withFy}
                onChange={(e) => setWithFy(e.target.checked)}
              />
              Include the financial year
            </label>
          </div>

          <div className="mt-4 rounded-lg bg-muted px-4 py-3">
            <p className="text-xs tracking-wide text-muted-foreground uppercase">Next number</p>
            <p className="mt-1 font-mono text-base font-semibold">{sample}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Numbers already issued under{" "}
              <span className="font-mono">
                {documentNumberPrefix("MSP", series.kind, "26-27", shape)}
              </span>{" "}
              are counted first, so a change never reuses one.
            </p>
          </div>
        </AppDialogBody>
        <AppDialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <SubmitButton
            type="button"
            onClick={submit}
            submitting={pending}
            invalidReason={invalidReason}
          >
            Save
          </SubmitButton>
        </AppDialogFooter>
      </AppDialog>
    </>
  );
}
