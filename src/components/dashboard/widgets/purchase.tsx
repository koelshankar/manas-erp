"use client";

import Link from "next/link";
import { CircleAlert, Scale } from "lucide-react";
import { BarList, MiniBar, WidgetCard, WidgetRow } from "../primitives";
import { formatDate, formatInrCompact, formatPercent } from "@/lib/format";
import type {
  CategorySpend,
  L1Adherence,
  OverduePo,
  SupplierPayable,
  UnbilledGrn,
} from "@/lib/services/queries";
import { cn } from "cn";

export function OverduePosWidget({ rows }: { rows: OverduePo[] }) {
  return (
    <WidgetCard
      title="Overdue purchase orders"
      subtitle="Past the expected delivery date"
      isEmpty={rows.length === 0}
      empty="Every open PO is still within its delivery window."
    >
      <ul className="space-y-1">
        {rows.map((row) => (
          <li key={row.purchase_order_id}>
            <WidgetRow href={row.href}>
              <CircleAlert className="size-3.5 shrink-0 text-destructive" />
              <span className="font-mono text-xs">{row.po_number}</span>
              <span className="min-w-0 flex-1 truncate text-sm">
                {row.supplier_name}
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-sm font-medium tabular-nums text-destructive">
                  {row.days_overdue} days late
                </span>
                <span className="block text-[11px] text-muted-foreground">
                  due {formatDate(row.expected_date)} ·{" "}
                  {formatInrCompact(row.value)}
                </span>
              </span>
            </WidgetRow>
          </li>
        ))}
      </ul>
    </WidgetCard>
  );
}

export function UnbilledGrnsWidget({ rows }: { rows: UnbilledGrn[] }) {
  return (
    <WidgetCard
      title="GRNs without a vendor bill"
      subtitle="Material received, invoice not entered"
      isEmpty={rows.length === 0}
      empty="Every receipt has a bill against it."
    >
      <ul className="space-y-1">
        {rows.map((row) => (
          <li key={row.grn_id}>
            <WidgetRow href={row.href}>
              <span className="font-mono text-xs">{row.grn_number}</span>
              <span className="min-w-0 flex-1 truncate text-sm">
                {row.supplier_name}
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-sm font-medium tabular-nums">
                  {formatInrCompact(row.value)}
                </span>
                <span
                  className={cn(
                    "block text-[11px]",
                    row.age_days > 7
                      ? "text-destructive"
                      : "text-muted-foreground",
                  )}
                >
                  received {row.age_days} day{row.age_days === 1 ? "" : "s"} ago
                </span>
              </span>
            </WidgetRow>
          </li>
        ))}
      </ul>
    </WidgetCard>
  );
}

export function PayablesWidget({ rows }: { rows: SupplierPayable[] }) {
  return (
    <WidgetCard
      title="Payables by supplier"
      subtitle="Verified bills less debit notes"
      action={{ label: "Supplier ledger", href: "/ledgers/suppliers" }}
      isEmpty={rows.length === 0}
      empty="Nothing is outstanding with any supplier."
    >
      <BarList
        rows={rows.map((r) => ({
          key: r.supplier_id,
          label: r.supplier_name,
          sublabel: r.state,
          value: r.balance,
          display: formatInrCompact(r.balance),
          href: r.href,
        }))}
      />
    </WidgetCard>
  );
}

export function SpendByCategoryWidget({ rows }: { rows: CategorySpend[] }) {
  return (
    <WidgetCard
      title="Spend this month"
      subtitle="Purchase orders raised, by material category"
      team="purchase_stores"
      emphasis
      isEmpty={rows.length === 0}
      empty="No purchase orders have been raised this month."
    >
      <BarList
        rows={rows.map((r) => ({
          key: r.category,
          label: r.category,
          sublabel: formatPercent(r.percent, 0),
          value: r.value,
          display: formatInrCompact(r.value),
          href: r.href,
        }))}
      />
    </WidgetCard>
  );
}

/** How often the selected vendor was the cheapest on landed cost. */
export function L1AdherenceWidget({ data }: { data: L1Adherence }) {
  const good = data.percent >= 80;
  return (
    <WidgetCard
      title="L1 adherence"
      subtitle="How often the awarded vendor was the cheapest landed"
      team="purchase_stores"
      emphasis
      isEmpty={data.total_lines === 0}
      empty="No comparative has been decided yet."
    >
      <div className="mb-4 flex items-baseline gap-3">
        <span
          className={cn(
            "text-3xl leading-none font-semibold tabular-nums",
            good ? "text-success" : "text-warning",
          )}
        >
          {formatPercent(data.percent, 0)}
        </span>
        <span className="text-xs text-muted-foreground">
          {data.l1_lines} of {data.total_lines} awarded lines
        </span>
      </div>
      <MiniBar percent={data.percent} tone={good ? "good" : "warn"} />

      {data.justified.length > 0 ? (
        <ul className="mt-4 space-y-1.5 border-t border-border/60 pt-3">
          {data.justified.slice(0, 4).map((j, i) => (
            <li key={`${j.comparative_id}:${i}`}>
              <Link
                href={j.href}
                className="group flex items-start gap-2 text-xs"
              >
                <Scale className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
                <span className="min-w-0">
                  <span className="font-mono group-hover:underline">
                    {j.comparative_number}
                  </span>
                  <span className="ml-1.5 text-muted-foreground">
                    {j.material_name}
                  </span>
                  <span className="block truncate text-muted-foreground italic">
                    “{j.justification}”
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </WidgetCard>
  );
}
