"use client";

import {
  Caption,
  DocumentFields,
  DocumentTable,
  SignatureBlocks,
  StoresDocument,
  Td,
} from "./document-chrome";
import { TRANSFER_NOTE, TRANSFER_SIGNATURE_LABELS } from "@/config/stores-document";
import { statusLabel } from "@/components/common";
import type {
  MaterialTransfer,
  MaterialTransferLine,
  Project,
  Store,
} from "@/lib/domain";
import { formatDate, formatNumber } from "@/lib/format";

/**
 * The material transfer order as both stores file it, on A4.
 *
 * Transcribed from their template: the transfer number and date, the project
 * and store at each end, the reason, the vehicle, the lines, and four signature
 * blocks — issuing store, issuing project, receiving store, receiving project.
 *
 * Once the transfer has been dispatched the sheet prints the received column
 * too, because the same paper is what the receiving storeman writes on. A
 * shortfall shows as its own figure rather than by rewriting the dispatched
 * quantity: a transfer that lost four bags on the road should say so.
 *
 * No value, anywhere. A transfer moves goods between our own stores; nothing is
 * bought or sold, and re-pricing stock at the far end would be the first place
 * that decision had to be made.
 */
export function TransferDocument({
  transfer,
  lines,
  fromProject,
  fromStore,
  toProject,
  toStore,
  raisedBy,
  acknowledgedBy,
  materialLabel,
}: {
  transfer: MaterialTransfer;
  lines: MaterialTransferLine[];
  fromProject?: Project;
  fromStore?: Store;
  toProject?: Project;
  toStore?: Store;
  raisedBy: string;
  acknowledgedBy: string | null;
  materialLabel: (id: string | null) => string;
}) {
  // A draft has not moved, so there is nothing received to print.
  const showReceived = transfer.status === "in_transit" || transfer.status === "acknowledged";
  const shortfall = lines.reduce((s, l) => s + Math.max(0, l.quantity - l.received_qty), 0);

  return (
    <StoresDocument
      title="Material Transfer Order"
      head={[
        {
          label: "Transfer No.",
          value: <span className="font-mono">{transfer.transfer_number}</span>,
        },
        { label: "Date", value: formatDate(transfer.transfer_date) },
        { label: "Status", value: statusLabel(transfer.status) },
      ]}
    >
      <section className="grid gap-3 sm:grid-cols-2">
        <div>
          <Caption>From</Caption>
          <DocumentFields
            fields={[
              { label: "Project", value: fromProject?.name ?? "—" },
              { label: "Store", value: fromStore?.name ?? "—" },
              {
                label: "Dispatched",
                value: transfer.dispatched_at
                  ? formatDate(transfer.dispatched_at)
                  : "Not dispatched",
              },
            ]}
          />
        </div>
        <div>
          <Caption>To</Caption>
          <DocumentFields
            fields={[
              { label: "Project", value: toProject?.name ?? "—" },
              { label: "Store", value: toStore?.name ?? "—" },
              {
                label: "Acknowledged",
                value: transfer.acknowledged_at
                  ? formatDate(transfer.acknowledged_at)
                  : "Not yet signed for",
              },
            ]}
          />
        </div>
      </section>

      <section>
        <Caption>Transfer Details</Caption>
        <DocumentFields
          fields={[
            { label: "Reason for transfer", value: transfer.reason, wide: true },
            { label: "Vehicle no.", value: transfer.vehicle_number },
            { label: "Raised by", value: raisedBy },
            ...(transfer.remarks
              ? [{ label: "Remarks", value: transfer.remarks, wide: true }]
              : []),
          ]}
        />
      </section>

      <section>
        <Caption>Material Details</Caption>
        <DocumentTable
          headers={[
            { label: "Sl No." },
            { label: "Material" },
            { label: "UOM" },
            { label: "Quantity sent", align: "right" },
            ...(showReceived
              ? [
                  { label: "Received", align: "right" as const },
                  { label: "Short", align: "right" as const },
                ]
              : []),
            { label: "Remarks" },
          ]}
        >
          {lines.map((line, i) => (
            <tr key={line.id}>
              <Td align="right">{i + 1}</Td>
              <Td>{materialLabel(line.material_id)}</Td>
              <Td>{line.unit}</Td>
              <Td align="right">{formatNumber(line.quantity, 2)}</Td>
              {showReceived ? (
                <>
                  <Td align="right">
                    {transfer.status === "acknowledged"
                      ? formatNumber(line.received_qty, 2)
                      : "—"}
                  </Td>
                  <Td align="right">
                    {transfer.status === "acknowledged"
                      ? formatNumber(Math.max(0, line.quantity - line.received_qty), 2)
                      : "—"}
                  </Td>
                </>
              ) : null}
              <Td>{line.remarks || "—"}</Td>
            </tr>
          ))}
        </DocumentTable>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{TRANSFER_NOTE}</p>
        {transfer.status === "acknowledged" && shortfall > 0 ? (
          <p className="num mt-1 text-xs font-medium">
            {formatNumber(shortfall, 2)} short on arrival.
          </p>
        ) : null}
      </section>

      {/*
       * Four blocks, as their template has them. Only the receiving store's
       * fills from the system — its acknowledgement is the step that completes
       * the transfer — and the other three are signed on paper. No system step
       * holds them, and inventing one would be worse than an empty rule.
       */}
      <SignatureBlocks
        blocks={[
          { label: TRANSFER_SIGNATURE_LABELS.issuing_store, name: raisedBy },
          { label: TRANSFER_SIGNATURE_LABELS.issuing_project },
          {
            label: TRANSFER_SIGNATURE_LABELS.receiving_store,
            name: acknowledgedBy,
            detail: transfer.acknowledged_at ? formatDate(transfer.acknowledged_at) : null,
          },
          { label: TRANSFER_SIGNATURE_LABELS.receiving_project },
        ]}
      />
    </StoresDocument>
  );
}
