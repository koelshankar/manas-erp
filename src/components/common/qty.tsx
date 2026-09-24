"use client";

import { formatNumber } from "@/lib/format";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "cn";

/**
 * A quantity. Always with its unit, always tabular, never more than 2 decimals.
 *
 * There is no way to render a bare number through this component, which is the
 * point: the indents list was printing "266" for a row holding bags, brass and
 * rmt, and the stock table showed the unit on one column out of four
 * (audit C2).
 */
export function Qty({
  value,
  unit,
  className,
  /** Show a dash rather than "0 bag" when there is genuinely nothing. */
  dashIfZero = false,
}: {
  value: number | null | undefined;
  unit: string;
  className?: string;
  dashIfZero?: boolean;
}) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return <span className={cn("num text-muted-foreground", className)}>—</span>;
  }
  if (dashIfZero && value === 0) {
    return <span className={cn("num text-muted-foreground", className)}>—</span>;
  }
  return (
    <span className={cn("num whitespace-nowrap", className)}>
      {formatNumber(value, 2)} <span className="text-muted-foreground">{unit}</span>
    </span>
  );
}

/** One unit's worth of a mixed bag. */
export type UnitTotal = { unit: string; value: number };

/**
 * Totals a set of lines **per unit**, because quantities in different units do
 * not add up.
 */
export function totalsByUnit(
  lines: Array<{ unit: string; qty: number }>,
): UnitTotal[] {
  const byUnit = new Map<string, number>();
  lines.forEach((l) => byUnit.set(l.unit, (byUnit.get(l.unit) ?? 0) + l.qty));
  return [...byUnit.entries()]
    .map(([unit, value]) => ({ unit, value }))
    .sort((a, b) => b.value - a.value);
}

export function formatUnitTotals(totals: UnitTotal[]): string {
  if (totals.length === 0) return "Nothing on this document";
  return totals.map((t) => `${formatNumber(t.value, 2)} ${t.unit}`).join(" · ");
}

/**
 * What a list column shows in place of a mixed-unit sum: the line count, with
 * the real per-unit breakdown on hover.
 */
export function LineCount({
  lines,
  totals,
  className,
}: {
  lines: number;
  totals: UnitTotal[];
  className?: string;
}) {
  const label = `${lines} ${lines === 1 ? "line" : "lines"}`;

  if (totals.length === 0) {
    return <span className={cn("num text-muted-foreground", className)}>{label}</span>;
  }

  // A single unit needs no tooltip — show the real quantity.
  if (totals.length === 1) {
    return <Qty value={totals[0].value} unit={totals[0].unit} className={className} />;
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className={cn(
              "num cursor-help underline decoration-border decoration-dotted underline-offset-4",
              className,
            )}
          />
        }
      >
        {label}
      </TooltipTrigger>
      <TooltipContent>{formatUnitTotals(totals)}</TooltipContent>
    </Tooltip>
  );
}
