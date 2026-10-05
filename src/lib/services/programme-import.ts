import { differenceInCalendarDays, format, isValid } from "date-fns";

/**
 * Pure parsing for the programme import dialog — turning an uploaded sheet
 * into rows `buildProgrammeTasks` can hierarchy-link. No DOM, no file I/O:
 * the dialog reads the file and hands this plain text/cells.
 */

/** A minimal RFC4180 CSV split: quoted fields, escaped `""`, CRLF or LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      pushField();
    } else if (c === "\n") {
      pushRow();
    } else if (c === "\r") {
      // swallow; \r\n handled by the following \n
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) pushRow();
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

/** Excel's day-zero, 30 Dec 1899 — the usual epoch for its serial date numbers. */
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);

export function excelSerialToDate(serial: number): Date {
  return new Date(EXCEL_EPOCH_MS + serial * 86_400_000);
}

/**
 * Normalises whatever a cell gave us — a JS Date (exceljs date cells), an
 * Excel serial number, or free text in a handful of common shapes — to
 * yyyy-MM-dd. Returns null rather than throwing: an unparsable cell just
 * marks its row invalid in the preview.
 */
export function normalizeSheetDate(value: unknown): string | null {
  if (value instanceof Date) {
    return isValid(value) ? format(value, "yyyy-MM-dd") : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const d = excelSerialToDate(value);
    return isValid(d) ? format(d, "yyyy-MM-dd") : null;
  }
  const text = String(value ?? "").trim();
  if (!text) return null;

  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const d = new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]));
    return isValid(d) ? format(d, "yyyy-MM-dd") : null;
  }
  // d/m/yyyy or m/d/yyyy — ambiguous, so prefer day-first (their own sheets
  // are dd/mm/yyyy); a day > 12 disambiguates either way.
  const slash = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (slash) {
    const [, a, b, y] = slash;
    // Day-first (their own sheets are dd/mm/yyyy); swap only when that
    // reading's "month" is not a month at all.
    const [day, month] = +b > 12 ? [+b, +a] : [+a, +b];
    if (month < 1 || month > 12) return null;
    const d = new Date(Date.UTC(+y, month - 1, day));
    return isValid(d) && d.getUTCMonth() === month - 1 ? format(d, "yyyy-MM-dd") : null;
  }
  const parsed = new Date(text);
  return isValid(parsed) ? format(parsed, "yyyy-MM-dd") : null;
}

export function daysBetween(start: string, end: string): number {
  return differenceInCalendarDays(new Date(end), new Date(start)) + 1;
}

/* ------------------------------------------------------------------ */
/* Column mapping                                                      */
/* ------------------------------------------------------------------ */

export type ProgrammeColumnKey = "wbs_code" | "name" | "start_date" | "end_date" | "duration_days";

export const PROGRAMME_COLUMNS: Array<{ key: ProgrammeColumnKey; label: string; required: boolean }> = [
  { key: "wbs_code", label: "ID", required: true },
  { key: "name", label: "Task name", required: true },
  { key: "start_date", label: "Start", required: true },
  { key: "end_date", label: "Finish", required: true },
  { key: "duration_days", label: "Duration (days)", required: false },
];

/** Best-effort guess at which sheet header is which field, by keyword. */
export function guessColumnMapping(headers: string[]): Record<ProgrammeColumnKey, string> {
  const find = (...needles: string[]): string => {
    const lower = headers.map((h) => h.toLowerCase());
    for (const needle of needles) {
      const i = lower.findIndex((h) => h.includes(needle));
      if (i !== -1) return headers[i];
    }
    return "";
  };
  return {
    wbs_code: find("wbs", "id", "task id", "sr", "no."),
    name: find("task name", "activity", "task", "name", "description"),
    start_date: find("start"),
    end_date: find("finish", "end"),
    duration_days: find("duration", "days"),
  };
}

export type ProgrammeRowCandidate = {
  row_number: number;
  wbs_code: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  duration_days: number | null;
  valid: boolean;
  error?: string;
};

/** Applies a column mapping to the raw grid, producing preview rows with per-row validity. */
export function mapSheetRows(
  headers: string[],
  rows: unknown[][],
  mapping: Record<ProgrammeColumnKey, string>,
): ProgrammeRowCandidate[] {
  const indexOf = (col: string) => headers.indexOf(col);
  const wbsIdx = indexOf(mapping.wbs_code);
  const nameIdx = indexOf(mapping.name);
  const startIdx = indexOf(mapping.start_date);
  const endIdx = indexOf(mapping.end_date);
  const durIdx = mapping.duration_days ? indexOf(mapping.duration_days) : -1;

  return rows.map((r, i) => {
    const wbs_code = String(r[wbsIdx] ?? "").trim();
    const name = String(r[nameIdx] ?? "").trim();
    const start_date = startIdx === -1 ? null : normalizeSheetDate(r[startIdx]);
    const end_date = endIdx === -1 ? null : normalizeSheetDate(r[endIdx]);
    const rawDuration = durIdx === -1 ? "" : String(r[durIdx] ?? "").trim();
    const duration_days =
      rawDuration !== "" && !Number.isNaN(Number(rawDuration))
        ? Number(rawDuration)
        : start_date && end_date
          ? daysBetween(start_date, end_date)
          : null;

    let error: string | undefined;
    if (!wbs_code) error = "missing ID";
    else if (!name) error = "missing task name";
    else if (!start_date) error = "start date did not parse";
    else if (!end_date) error = "finish date did not parse";
    else if (end_date < start_date) error = "finish is before start";

    return {
      row_number: i + 2, // header is row 1
      wbs_code,
      name,
      start_date,
      end_date,
      duration_days,
      valid: !error,
      error,
    };
  });
}
