"use client";

import {
  Caption,
  DocumentFields,
  DocumentTable,
  SignatureBlocks,
  StoresDocument,
  Td,
} from "./document-chrome";
import { ISSUE_SIGNATURE_LABELS } from "@/config/stores-document";
import type {
  Contractor,
  MaterialIssue,
  MaterialIssueLine,
  Project,
  Store,
  WorkOrder,
} from "@/lib/domain";
import { formatDate, formatNumber } from "@/lib/format";

/**
 * The material issue note as the contractor's storeman signs it, on A4.
 *
 * Transcribed from the template Manas sent us: the issue number and date, the
 * project and the store it came out of, the contractor and the work order it is
 * issued against, the three-part material label with UOM, the quantity now and
 * the **cumulative quantity issued to date**, and four signature blocks across
 * the foot.
 *
 * The cumulative column is the reason their form exists — the project manager
 * reads total consumption by that contractor off it — and it is printed from
 * the figure stored on the line, which is what it said when the note was
 * signed.
 *
 * No rupee figure, for any role. The issue carries a value and Budget vs Actual
 * consumes it; the paper the storeman hands over does not.
 */
export function IssueNoteDocument({
  issue,
  lines,
  project,
  store,
  contractor,
  workOrder,
  issuedBy,
  materialParts,
}: {
  issue: MaterialIssue;
  lines: MaterialIssueLine[];
  project?: Project;
  store?: Store;
  contractor?: Contractor;
  workOrder?: WorkOrder;
  issuedBy: string;
  /** The three columns their forms print, unjoined. */
  materialParts: (id: string | null) => { name: string; type: string; sub_type: string };
}) {
  return (
    <StoresDocument
      title="Material Issue Note"
      head={[
        { label: "Issue No.", value: <span className="font-mono">{issue.issue_number}</span> },
        { label: "Date", value: formatDate(issue.issue_date) },
      ]}
    >
      <section>
        <Caption>Issue Details</Caption>
        <DocumentFields
          fields={[
            { label: "Project", value: project?.name ?? "—" },
            { label: "From store", value: store?.name ?? "—" },
            { label: "Issued to contractor", value: contractor?.name ?? "—" },
            {
              label: "Against work order",
              value: <span className="font-mono">{workOrder?.wo_number ?? "—"}</span>,
            },
            { label: "Issued by", value: issuedBy },
            {
              label: "Acknowledged by",
              value: issue.acknowledged_by_name || "Not yet signed for",
            },
            ...(issue.remarks ? [{ label: "Remarks", value: issue.remarks, wide: true }] : []),
          ]}
        />
      </section>

      <section>
        <Caption>Material Details</Caption>
        <DocumentTable
          headers={[
            { label: "Sl No." },
            { label: "Material" },
            { label: "Type" },
            { label: "Sub-type" },
            { label: "UOM" },
            { label: "Quantity now", align: "right" },
            { label: "Cumulative to date", align: "right" },
            { label: "Remarks" },
          ]}
        >
          {lines.map((line, i) => {
            const parts = materialParts(line.material_id);
            return (
              <tr key={line.id}>
                <Td align="right">{i + 1}</Td>
                <Td>{parts.name}</Td>
                <Td>{parts.type}</Td>
                {/* Not every material has three levels: river sand is Sand ->
                    River Sand and stops there, so the column prints blank
                    rather than repeating the type. */}
                <Td>{parts.sub_type || "—"}</Td>
                <Td>{line.unit}</Td>
                <Td align="right">{formatNumber(line.quantity, 2)}</Td>
                <Td align="right">{formatNumber(line.cumulative_qty, 2)}</Td>
                <Td>{line.remarks || "—"}</Td>
              </tr>
            );
          })}
        </DocumentTable>
        <p className="mt-1.5 text-xs text-muted-foreground">
          Cumulative to date is the total of this material issued to{" "}
          {contractor?.name ?? "this contractor"} on this project, including this note.
        </p>
      </section>

      {/*
       * Four blocks, as their template has them. Two are filled from the
       * system — whoever wrote the note, and whoever signed for it at the
       * counter — and two are wet ink: no system step holds the project
       * managers' signatures on an issue, and inventing one would be worse
       * than leaving the rule blank.
       */}
      <SignatureBlocks
        blocks={[
          { label: ISSUE_SIGNATURE_LABELS.manas_stores, name: issuedBy },
          { label: ISSUE_SIGNATURE_LABELS.manas_project_manager },
          { label: ISSUE_SIGNATURE_LABELS.contractor_project_manager },
          {
            label: ISSUE_SIGNATURE_LABELS.contractor_stores,
            name: issue.acknowledged_by_name || null,
            detail: issue.acknowledged_at ? formatDate(issue.acknowledged_at) : null,
          },
        ]}
      />
    </StoresDocument>
  );
}
