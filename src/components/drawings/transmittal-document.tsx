"use client";

import {
  Caption,
  DocumentFields,
  DocumentTable,
  DrawingsDocument,
  SignatureBlocks,
  Td,
} from "./document-chrome";
import { transmittalDocumentTypeLabel, transmittalPurposeLabel } from "@/config/labels";
import { formatDate } from "@/lib/format";
import type { Project, Transmittal, TransmittalLine } from "@/lib/domain";

/**
 * The transmittal as it goes out, on A4.
 *
 * Two signature blocks, not three — issuing is this sender's own act, and the
 * receiver's signature is the only other one their template carries, which is
 * why this document has no approval chain the way the gate pass does.
 */
export function TransmittalDocument({
  transmittal,
  lines,
  project,
}: {
  transmittal: Transmittal;
  lines: TransmittalLine[];
  project?: Project;
}) {
  return (
    <DrawingsDocument
      title="Drawing Transmittal"
      head={[
        {
          label: "Transmittal No.",
          value: <span className="font-mono">{transmittal.transmittal_number}</span>,
        },
        { label: "Date", value: formatDate(transmittal.transmittal_date) },
        { label: "Project", value: project?.name ?? "—" },
      ]}
    >
      <section>
        <Caption>Particulars</Caption>
        <DocumentFields
          columns={2}
          fields={[
            { label: "To", value: transmittal.to_name },
            { label: "Company", value: transmittal.to_company },
            { label: "Address", value: transmittal.to_address, wide: true },
            { label: "From", value: transmittal.from_name },
            { label: "Designation", value: transmittal.from_designation },
            { label: "Document type", value: transmittalDocumentTypeLabel(transmittal.document_type) },
            { label: "Purpose of issue", value: transmittalPurposeLabel(transmittal.purpose_of_issue) },
            { label: "Mode of transmission", value: transmittal.mode_of_transmission },
            ...(transmittal.remarks
              ? [{ label: "Remarks", value: transmittal.remarks, wide: true }]
              : []),
          ]}
        />
      </section>

      <section>
        <Caption>Drawings transmitted</Caption>
        <DocumentTable
          headers={[
            { label: "Sl No." },
            { label: "Drawing no." },
            { label: "Title" },
            { label: "Rev." },
            { label: "Sheet size" },
            { label: "Copies", align: "right" },
          ]}
        >
          {lines.map((line, i) => (
            <tr key={line.id}>
              <Td align="right">{i + 1}</Td>
              <Td>{line.drawing_no}</Td>
              <Td>{line.drawing_title}</Td>
              <Td>{line.revision_code}</Td>
              <Td>{line.sheet_size}</Td>
              <Td align="right">{line.copies}</Td>
            </tr>
          ))}
        </DocumentTable>
      </section>

      <SignatureBlocks
        blocks={[
          {
            label: "Issued by",
            name: transmittal.issued_by_user_id ? transmittal.from_name : null,
            detail: transmittal.issued_at ? formatDate(transmittal.issued_at) : null,
          },
          {
            label: "Received by",
            name: transmittal.received_by_name || null,
            detail: transmittal.received_at ? formatDate(transmittal.received_at) : null,
          },
        ]}
      />
    </DrawingsDocument>
  );
}
