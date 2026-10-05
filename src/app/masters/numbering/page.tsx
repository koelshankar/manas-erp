"use client";

import {
  PageHeader,
  DataTable,
  SectionHeading,
  HydrationGate,
  type Column,
} from "@/components/common";
import { useAccess, useAllRows } from "@/lib/hooks";
import { documentKindLabel } from "@/config/labels";
import { formatDocumentNumber } from "@/lib/services/document-number";
import { SeriesDialog } from "@/components/purchase/series-dialog";
import { Card } from "@/components/ui/card";
import { DOCUMENT_KINDS, type DocumentSeries } from "@/lib/domain";

/**
 * Document numbering, per kind.
 *
 * Manas have not confirmed their own series yet, and a demo whose numbers can
 * only be changed in the source is a demo that gets the wrong numbers on the
 * day. Editing a series changes what the *next* document takes; everything
 * already issued keeps the number it was issued under, which is the only reason
 * a document number is worth anything.
 */
export default function NumberingPage() {
  const access = useAccess("document_numbering");
  const rows = useAllRows("document_series") as DocumentSeries[];

  const order = new Map(DOCUMENT_KINDS.map((k, i) => [k, i]));
  const ordered = [...rows].sort((a, b) => (order.get(a.kind) ?? 0) - (order.get(b.kind) ?? 0));

  const columns: Array<Column<DocumentSeries>> = [
    {
      key: "kind",
      header: "Document",
      primary: true,
      cell: (s) => documentKindLabel(s.kind),
    },
    {
      key: "sample",
      header: "Next number looks like",
      secondary: true,
      cell: (s) => (
        <span className="font-mono text-xs">
          {formatDocumentNumber("MSP", s.kind, "26-27", s.start_serial, {
            prefix: s.prefix,
            serial_width: s.serial_width,
            include_project_code: s.include_project_code,
            include_financial_year: s.include_financial_year,
            separator: s.separator,
          })}
        </span>
      ),
    },
    {
      key: "prefix",
      header: "Prefix",
      cell: (s) => <span className="font-mono text-xs">{s.prefix}</span>,
    },
    {
      key: "width",
      header: "Serial width",
      align: "right",
      cell: (s) => s.serial_width,
    },
    { key: "start", header: "Start from", align: "right", cell: (s) => s.start_serial },
    {
      key: "project",
      header: "Project code",
      cell: (s) =>
        s.include_project_code ? "Yes" : <span className="text-muted-foreground">No</span>,
    },
    {
      key: "fy",
      header: "Financial year",
      cell: (s) =>
        s.include_financial_year ? "Yes" : <span className="text-muted-foreground">No</span>,
    },
    {
      key: "edit",
      header: "",
      cell: (s) => (access.canEdit ? <SeriesDialog series={s} /> : null),
    },
  ];

  return (
    <div>
      <PageHeader
        title={access.meta.label}
        description="How each document is numbered. A change applies to the next one issued, never to one already out."
        team={access.ownerTeam}
        outsideNav={access.outsideNav}
        owned={access.owned}
      />
      <HydrationGate>
        <div className="space-y-6">
          <Card className="px-5 py-4">
            <p className="text-sm leading-relaxed text-muted-foreground">
              A number is built as{" "}
              <span className="font-mono text-foreground">
                project code / prefix / financial year / serial
              </span>{" "}
              — the Indian 1 April to 31 March year. The serial is counted from the documents
              already issued for that project and year, so changing a series can never hand out a
              number twice. RA bills are the one exception: they are numbered inside their work
              order.
            </p>
          </Card>

          <section>
            <SectionHeading title="Series" />
            <DataTable
              columns={columns}
              rows={ordered}
              rowKey={(s) => s.id}
              emptyMessage="No series configured."
              caption={`${ordered.length} document kinds.`}
            />
          </section>
        </div>
      </HydrationGate>
    </div>
  );
}
