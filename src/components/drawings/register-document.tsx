"use client";

import { Fragment } from "react";
import { DRAWING_REVISION_CODES } from "@/lib/domain";
import type { Drawing, DrawingRevisionCode, DrawingRevision } from "@/lib/domain";
import { drawingDisciplineLabel } from "@/config/labels";
import { formatDate } from "@/lib/format";
import { DrawingsDocument } from "./document-chrome";

/**
 * The full register, printed landscape — wide enough for all five revision
 * columns, exactly as their template runs. `data-print-landscape` (see
 * globals.css) is what turns the sheet sideways; nothing else on the page
 * does.
 *
 * Unlike the screen table, nothing here is folded away: a printed register is
 * the one place every revision column belongs on the same sheet, because it
 * is handed to someone who cannot tap a row to expand it.
 */
export function RegisterDocument({
  project_name,
  drawings,
  revisionsOf,
  onDate,
}: {
  project_name: string;
  drawings: Drawing[];
  revisionsOf: (drawing: Drawing) => DrawingRevision[];
  onDate: string;
}) {
  return (
    <div data-print-landscape>
      <DrawingsDocument
        title="Drawing Register"
        head={[
          { label: "Project", value: project_name },
          { label: "As on", value: formatDate(onDate) },
        ]}
      >
        <table className="w-full border border-border text-[10px]">
          <thead>
            <tr className="bg-muted/60">
              <th rowSpan={2} className="border border-border px-1.5 py-1 text-left font-semibold">
                Drawing no.
              </th>
              <th rowSpan={2} className="border border-border px-1.5 py-1 text-left font-semibold">
                Title
              </th>
              <th rowSpan={2} className="border border-border px-1.5 py-1 text-left font-semibold">
                Discipline
              </th>
              <th rowSpan={2} className="border border-border px-1.5 py-1 text-left font-semibold">
                Sheet size
              </th>
              <th rowSpan={2} className="border border-border px-1.5 py-1 text-left font-semibold">
                Consultant
              </th>
              {DRAWING_REVISION_CODES.map((code) => (
                <th
                  key={code}
                  colSpan={3}
                  className="border border-border px-1.5 py-1 text-center font-semibold"
                >
                  {code}
                </th>
              ))}
            </tr>
            <tr className="bg-muted/60">
              {DRAWING_REVISION_CODES.map((code) => (
                <Fragment key={code}>
                  <th className="border border-border px-1 py-1 font-medium">Date</th>
                  <th className="border border-border px-1 py-1 font-medium">Copies</th>
                  <th className="border border-border px-1 py-1 font-medium">Remarks</th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {drawings.map((d) => {
              const revisions = revisionsOf(d);
              const byCode = new Map(revisions.map((r) => [r.revision_code, r]));
              return (
                <tr key={d.id}>
                  <td className="border border-border px-1.5 py-1 font-mono">{d.drawing_no}</td>
                  <td className="border border-border px-1.5 py-1">{d.title}</td>
                  <td className="border border-border px-1.5 py-1">
                    {drawingDisciplineLabel(d.discipline)}
                  </td>
                  <td className="border border-border px-1.5 py-1">{d.sheet_size}</td>
                  <td className="border border-border px-1.5 py-1">{d.consultant || "—"}</td>
                  {DRAWING_REVISION_CODES.map((code: DrawingRevisionCode) => {
                    const r = byCode.get(code);
                    return (
                      <Fragment key={code}>
                        <td className="border border-border px-1 py-1">
                          {r ? formatDate(r.revision_date) : ""}
                        </td>
                        <td className="border border-border px-1 py-1 text-right">
                          {r ? r.copies_received : ""}
                        </td>
                        <td className="border border-border px-1 py-1">{r ? r.remarks : ""}</td>
                      </Fragment>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </DrawingsDocument>
    </div>
  );
}
