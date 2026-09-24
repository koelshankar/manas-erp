"use client";

import { useState } from "react";
import { TriangleAlert } from "lucide-react";
import { ListPage, Qty, SectionHeading, type Column } from "@/components/common";
import { useLookups, useRepositoryQuery } from "@/lib/hooks";
import {
  getIssuedVsMeasured,
  type IssuedVsMeasuredRow,
} from "@/lib/services/measurement-service";
import { ISSUED_VS_MEASURED_TOLERANCE_PERCENT } from "@/lib/domain";
import { countOf, formatPercent } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { cn } from "cn";

/**
 * The dashed line on the chart: material drawn from store against a BOQ line
 * versus what the measured work should have consumed at the budgeted rate.
 *
 * Only over-consumption beyond tolerance is a flag. A line nobody has measured
 * yet has no variance at all, and a line that used *less* than budgeted is good
 * news, hidden behind the "All lines" tab — the panel used to print both as
 * −100% and drown the four real flags in twenty-four false ones (audit P3/P4).
 * The caption counts exactly what the open tab shows.
 */
export function IssuedVsMeasuredPanel({
  projectId,
  boqLineIds,
  title = "Issued vs measured",
}: {
  projectId: string;
  /** Limit to the BOQ lines on the sheet in front of the user. */
  boqLineIds?: string[];
  title?: string;
}) {
  const lookup = useLookups();
  const [showAll, setShowAll] = useState(false);
  const { data } = useRepositoryQuery<IssuedVsMeasuredRow[]>(
    async () => (projectId ? getIssuedVsMeasured(projectId) : []),
    [projectId],
  );

  const all = (data ?? []).filter((r) => !boqLineIds || boqLineIds.includes(r.boq_line_id));
  if (all.length === 0) return null;

  const flagged = all.filter((r) => r.state === "flagged");
  const notMeasured = all.filter((r) => r.state === "not_measured");

  // Off by default: under-consumption is not a problem to be read through.
  const rows = showAll ? all : [...flagged, ...notMeasured];

  const columns: Array<Column<IssuedVsMeasuredRow>> = [
    {
      key: "boq",
      header: "BOQ",
      className: "whitespace-nowrap",
      cell: (r) => <span className="font-mono text-xs">{r.item_code}</span>,
    },
    {
      key: "material",
      header: "Material",
      primary: true,
      cell: (r) => lookup.material(r.material_id),
    },
    { key: "desc", header: "Work", secondary: true, cell: (r) => r.description },
    {
      key: "measured",
      header: "Measured work",
      align: "right",
      cell: (r) =>
        r.state === "not_measured" ? (
          <span className="text-muted-foreground">Not yet measured</span>
        ) : (
          <Qty value={r.measured_qty} unit="" className="text-muted-foreground" />
        ),
    },
    {
      key: "should",
      header: "Should have used",
      align: "right",
      cell: (r) =>
        r.state === "not_measured" ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <Qty value={r.theoretical_qty} unit={r.unit} />
        ),
    },
    {
      key: "issued",
      header: "Actually issued",
      align: "right",
      cell: (r) => <Qty value={r.issued_qty} unit={r.unit} />,
    },
    {
      key: "variance",
      header: "Variance",
      align: "right",
      cell: (r) =>
        r.variance_qty === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <Qty
            value={r.variance_qty}
            unit={r.unit}
            className={cn(r.variance_qty > 0 && "text-warning")}
          />
        ),
    },
    {
      key: "percent",
      header: "%",
      align: "right",
      cell: (r) =>
        r.variance_percent === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span
            className={cn(
              "num inline-flex items-center gap-1 whitespace-nowrap",
              r.is_flagged && "font-semibold text-destructive",
            )}
          >
            {r.is_flagged ? <TriangleAlert className="size-3.5" /> : null}
            {formatPercent(r.variance_percent, 1)}
          </span>
        ),
    },
  ];

  return (
    <section>
      <SectionHeading
        title={title}
        description={
          flagged.length > 0
            ? `${countOf(flagged.length, "material")} drawn more than ${ISSUED_VS_MEASURED_TOLERANCE_PERCENT}% above the measured work.`
            : `Nothing is drawn more than ${ISSUED_VS_MEASURED_TOLERANCE_PERCENT}% above the measured work.`
        }
        actions={
          <Button variant="outline" size="sm" onClick={() => setShowAll((v) => !v)}>
            {showAll ? "Flagged and unmeasured only" : "Show all lines"}
          </Button>
        }
      />
      <ListPage
        rows={rows}
        columns={columns}
        rowKey={(r) => `${r.boq_line_id}:${r.material_id}`}
        tabs={[
          { key: "flagged", label: "Flagged", tone: "destructive" as const },
          { key: "not_measured", label: "Not yet measured", tone: "neutral" as const },
          { key: "within_tolerance", label: "Within tolerance", tone: "success" as const },
        ]}
        tabOf={(r) => r.state}
        searchIn={(r) => [r.item_code, r.description, lookup.material(r.material_id)]}
        searchPlaceholder="BOQ code or material"
        emptyMessage="Nothing matches this view."
      />
    </section>
  );
}
