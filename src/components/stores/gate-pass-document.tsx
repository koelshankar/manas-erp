"use client";

import {
  Caption,
  DocumentFields,
  DocumentTable,
  SignatureBlocks,
  StoresDocument,
  Td,
} from "./document-chrome";
import {
  GATE_PASS_NON_RETURNABLE_NOTE,
  GATE_PASS_RETURNABLE_NOTE,
  GATE_PASS_SIGNATURE_LABELS,
} from "@/config/stores-document";
import { gatePassTypeLabel } from "@/config/labels";
import type { GatePass, GatePassLine, Project, Store } from "@/lib/domain";
import { formatDate, formatNumber } from "@/lib/format";

/**
 * The gate pass as the watchman keeps it, on A4.
 *
 * Transcribed from their template: the type across the head, the number and
 * date, the project and store it leaves, who is taking it and for which
 * company, the vehicle and driver, the reason for removal, the expected return
 * date on a returnable pass, the lines, and the three signature blocks —
 * stores, project manager, receiver.
 *
 * A returnable pass prints the returned and outstanding columns as well, because
 * the same sheet is what the storeman writes on when the material comes back.
 */
export function GatePassDocument({
  pass,
  lines,
  project,
  store,
  raisedBy,
  approvedBy,
  materialLabel,
}: {
  pass: GatePass;
  lines: GatePassLine[];
  project?: Project;
  store?: Store;
  raisedBy: string;
  approvedBy: string | null;
  materialLabel: (id: string | null) => string;
}) {
  const returnable = pass.pass_type === "returnable";
  const outstanding = lines.reduce((s, l) => s + Math.max(0, l.quantity - l.returned_qty), 0);

  return (
    <StoresDocument
      title={`${gatePassTypeLabel(pass.pass_type)} Gate Pass`}
      head={[
        {
          label: "Gate Pass No.",
          value: <span className="font-mono">{pass.gate_pass_number}</span>,
        },
        { label: "Date", value: formatDate(pass.gate_pass_date) },
        { label: "Type", value: gatePassTypeLabel(pass.pass_type) },
      ]}
    >
      <section>
        <Caption>Removal Details</Caption>
        <DocumentFields
          columns={3}
          fields={[
            { label: "Project", value: project?.name ?? "—" },
            { label: "From store", value: store?.name ?? "—" },
            { label: "Issued to", value: pass.issued_to_name },
            { label: "Company", value: pass.issued_to_company },
            { label: "Vehicle no.", value: pass.vehicle_number },
            { label: "Driver name", value: pass.driver_name },
            /* Only a returnable pass has a return date. Printing an empty
               "Expected return" row on a scrap pass invites somebody to fill
               it in. */
            ...(returnable
              ? [
                  {
                    label: "Expected return",
                    value: pass.expected_return_date
                      ? formatDate(pass.expected_return_date)
                      : "—",
                  },
                ]
              : []),
            { label: "Purpose / reason for removal", value: pass.purpose, wide: true },
            ...(pass.remarks ? [{ label: "Remarks", value: pass.remarks, wide: true }] : []),
          ]}
        />
      </section>

      <section>
        <Caption>Material Details</Caption>
        <DocumentTable
          headers={[
            { label: "Sl No." },
            { label: "Material / item" },
            { label: "UOM" },
            { label: "Quantity out", align: "right" },
            ...(returnable
              ? [
                  { label: "Returned", align: "right" as const },
                  { label: "Outstanding", align: "right" as const },
                ]
              : []),
            { label: "Remarks" },
          ]}
        >
          {lines.map((line, i) => (
            <tr key={line.id}>
              <Td align="right">{i + 1}</Td>
              {/* A line with no material names itself in words: a gate pass is
                  also how a tool or a hired machine leaves the site. */}
              <Td>{line.material_id ? materialLabel(line.material_id) : line.description}</Td>
              <Td>{line.unit}</Td>
              <Td align="right">{formatNumber(line.quantity, 2)}</Td>
              {returnable ? (
                <>
                  <Td align="right">{formatNumber(line.returned_qty, 2)}</Td>
                  <Td align="right">
                    {formatNumber(Math.max(0, line.quantity - line.returned_qty), 2)}
                  </Td>
                </>
              ) : null}
              <Td>{line.remarks || "—"}</Td>
            </tr>
          ))}
        </DocumentTable>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          {returnable ? GATE_PASS_RETURNABLE_NOTE : GATE_PASS_NON_RETURNABLE_NOTE}
        </p>
        {returnable && outstanding > 0 ? (
          <p className="mt-1 num text-xs font-medium">
            {formatNumber(outstanding, 2)} still outstanding against this pass.
          </p>
        ) : null}
      </section>

      {/*
       * Three blocks, and all three are real steps — stores raise the pass, the
       * project manager approves it, the receiver signs at the gate — which is
       * why the gate pass has an approval chain and the issue note does not.
       */}
      <SignatureBlocks
        blocks={[
          { label: GATE_PASS_SIGNATURE_LABELS.stores, name: raisedBy },
          {
            label: GATE_PASS_SIGNATURE_LABELS.project_manager,
            name: approvedBy,
            detail: pass.approved_at ? formatDate(pass.approved_at) : null,
          },
          {
            label: GATE_PASS_SIGNATURE_LABELS.receiver,
            name: pass.acknowledged_by_name || null,
            detail: pass.acknowledged_at ? formatDate(pass.acknowledged_at) : null,
          },
        ]}
      />
    </StoresDocument>
  );
}
