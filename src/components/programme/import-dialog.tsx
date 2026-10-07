"use client";

import { useRef, useState } from "react";
import { AlertTriangle, UploadCloud } from "lucide-react";
import { cn } from "cn";
import {
  AppDialog,
  AppDialogBody,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from "@/components/ui-app";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { Field, NativeSelect } from "@/components/common";
import { useActor, useServiceAction } from "@/lib/hooks";
import { importProgramme } from "@/lib/services/programme-service";
import {
  PROGRAMME_COLUMNS,
  guessColumnMapping,
  mapSheetRows,
  parseCsv,
  type ProgrammeColumnKey,
  type ProgrammeRowCandidate,
} from "@/lib/services/programme-import";

type Step = "upload" | "map";

/**
 * Upload, map columns, preview, confirm — the one write path for the
 * programme other than the seed. `.csv` is parsed with the plain splitter in
 * programme-import.ts; `.xlsx` is handed to exceljs, loaded lazily so a
 * screen that never imports never pays for it.
 */
export function ProgrammeImportDialog({
  projectId,
  open,
  onOpenChange,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const actor = useActor();
  const { run, pending } = useServiceAction();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("upload");
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<unknown[][]>([]);
  const [mapping, setMapping] = useState<Record<ProgrammeColumnKey, string>>({
    wbs_code: "",
    name: "",
    start_date: "",
    end_date: "",
    duration_days: "",
  });

  function reset() {
    setStep("upload");
    setFileError(null);
    setFileName("");
    setHeaders([]);
    setRows([]);
    setMapping({ wbs_code: "", name: "", start_date: "", end_date: "", duration_days: "" });
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleFile(file: File) {
    setFileError(null);
    setFileName(file.name);
    try {
      let grid: unknown[][];
      if (file.name.toLowerCase().endsWith(".csv")) {
        grid = parseCsv(await file.text());
      } else {
        const ExcelJS = (await import("exceljs")).default;
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(await file.arrayBuffer());
        const sheet = workbook.worksheets[0];
        if (!sheet) throw new Error("The workbook has no sheets.");
        grid = [];
        sheet.eachRow((excelRow) => {
          const cells: unknown[] = [];
          excelRow.eachCell({ includeEmpty: true }, (cell) => {
            cells.push(cell.value);
          });
          grid.push(cells);
        });
      }
      if (grid.length < 2) {
        throw new Error("The sheet has a header row but no data under it.");
      }
      const head = grid[0].map((h) => String(h ?? "").trim());
      setHeaders(head);
      setRows(grid.slice(1));
      setMapping(guessColumnMapping(head));
      setStep("map");
    } catch (err) {
      setFileError(
        err instanceof Error ? err.message : "Could not read that file — is it a .csv or .xlsx export?",
      );
    }
  }

  const candidates: ProgrammeRowCandidate[] =
    step === "map" && mapping.wbs_code && mapping.name && mapping.start_date && mapping.end_date
      ? mapSheetRows(headers, rows, mapping)
      : [];
  const validRows = candidates.filter((c) => c.valid);
  const invalidRows = candidates.filter((c) => !c.valid);
  const mappingComplete = Boolean(mapping.wbs_code && mapping.name && mapping.start_date && mapping.end_date);

  async function confirmImport() {
    await run(
      () =>
        importProgramme(
          {
            project_id: projectId,
            rows: validRows.map((r) => ({
              wbs_code: r.wbs_code,
              name: r.name,
              start_date: r.start_date!,
              end_date: r.end_date!,
              duration_days: r.duration_days ?? 0,
            })),
          },
          actor,
        ),
      {
        success: (written) => `Imported ${written.length} programme rows`,
        onDone: () => {
          reset();
          onOpenChange(false);
        },
      },
    );
  }

  return (
    <AppDialog
      open={open}
      size="xl"
      dirty={step === "map"}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <AppDialogHeader>
        <AppDialogTitle>Import the programme</AppDialogTitle>
        <AppDialogDescription>
          A .csv or .xlsx export with one row per activity — ID, task name, start, finish and
          duration. This replaces whatever programme is on this project now.
        </AppDialogDescription>
      </AppDialogHeader>

      <AppDialogBody>
        {step === "upload" ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-muted/20 px-6 py-12 text-center">
            <UploadCloud className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Choose a .csv or .xlsx file exported from the programme spreadsheet or MS Project.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
            <Button type="button" onClick={() => fileRef.current?.click()}>
              Choose file
            </Button>
            {fileError ? (
              <p className="flex items-center gap-1.5 text-sm text-destructive">
                <AlertTriangle className="size-3.5" /> {fileError}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Reading <span className="font-medium text-foreground">{fileName}</span> —{" "}
              {rows.length} row{rows.length === 1 ? "" : "s"} found. Map each column below.
            </p>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {PROGRAMME_COLUMNS.map((col) => (
                <Field key={col.key} label={col.label} required={col.required}>
                  <NativeSelect
                    value={mapping[col.key]}
                    onChange={(e) =>
                      setMapping((m) => ({ ...m, [col.key]: e.target.value }))
                    }
                  >
                    <option value="">
                      {col.required ? "Choose a column…" : "None — compute from dates"}
                    </option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              ))}
            </div>

            {mappingComplete ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>
                    <span className="font-medium text-foreground">{validRows.length}</span> row
                    {validRows.length === 1 ? "" : "s"} ready to import
                  </span>
                  {invalidRows.length > 0 ? (
                    <span className="flex items-center gap-1 text-warning">
                      <AlertTriangle className="size-3.5" /> {invalidRows.length} skipped
                    </span>
                  ) : null}
                </div>
                <div className="max-h-56 overflow-auto rounded-lg border border-border">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-muted/50 text-muted-foreground">
                      <tr>
                        <th className="px-2 py-1 text-left">Row</th>
                        <th className="px-2 py-1 text-left">ID</th>
                        <th className="px-2 py-1 text-left">Task</th>
                        <th className="px-2 py-1 text-left">Start</th>
                        <th className="px-2 py-1 text-left">Finish</th>
                        <th className="px-2 py-1 text-right">Days</th>
                      </tr>
                    </thead>
                    <tbody>
                      {candidates.slice(0, 50).map((c) => (
                        <tr
                          key={c.row_number}
                          className={cn("border-t border-border/60", !c.valid && "bg-danger-soft/40")}
                        >
                          <td className="px-2 py-1 text-muted-foreground">{c.row_number}</td>
                          <td className="px-2 py-1 font-mono">{c.wbs_code || "—"}</td>
                          <td className="min-w-0 max-w-40 truncate px-2 py-1" title={c.name}>
                            {c.name || "—"}
                          </td>
                          <td className="px-2 py-1 whitespace-nowrap">{formatDate(c.start_date)}</td>
                          <td className="px-2 py-1 whitespace-nowrap">{formatDate(c.end_date)}</td>
                          <td className="px-2 py-1 text-right">{c.duration_days ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {candidates.length > 50 ? (
                    <p className="border-t border-border/60 px-2 py-1 text-center text-muted-foreground">
                      and {candidates.length - 50} more row{candidates.length - 50 === 1 ? "" : "s"}
                    </p>
                  ) : null}
                </div>
                {invalidRows.length > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Skipped rows (row {invalidRows[0].row_number}: {invalidRows[0].error}
                    {invalidRows.length > 1 ? `, and ${invalidRows.length - 1} more` : ""}) will not
                    be imported.
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Map the four required columns to see a preview.
              </p>
            )}
          </div>
        )}
      </AppDialogBody>

      <AppDialogFooter>
        {step === "map" ? (
          <Button type="button" variant="outline" onClick={reset}>
            Choose a different file
          </Button>
        ) : null}
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        {step === "map" ? (
          <Button
            type="button"
            onClick={confirmImport}
            disabled={pending || !mappingComplete || validRows.length === 0}
          >
            {pending ? "Importing…" : `Import ${validRows.length} row${validRows.length === 1 ? "" : "s"}`}
          </Button>
        ) : null}
      </AppDialogFooter>
    </AppDialog>
  );
}
