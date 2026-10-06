"use client";

import type { ReactNode } from "react";
import { ISSUING_COMPANY } from "@/config/po-document";
import { cn } from "cn";

/**
 * The chrome the Drawings tab's two printed documents share, on A4 —
 * the same shape as `components/stores/document-chrome.tsx`: a title band,
 * the company block with the document's own number and date, a field grid,
 * the line table and a row of signature blocks. Kept as its own copy rather
 * than imported from `stores/` because each tab owns its print chrome (see
 * `components/material/comparative-sheet.tsx`, `components/billing/*`).
 */
export function DrawingsDocument({
  title,
  head,
  children,
}: {
  title: string;
  head: Array<{ label: string; value: ReactNode }>;
  children: ReactNode;
}) {
  return (
    <article
      data-print-area
      className="space-y-6 rounded-xl bg-card p-6 text-sm ring-1 ring-border print:ring-0"
    >
      <header className="space-y-4">
        <div className="border-y-2 border-foreground py-2 text-center">
          <h2 className="text-base font-bold tracking-[0.2em] uppercase">{title}</h2>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0">
            <p className="text-base font-semibold tracking-tight">{ISSUING_COMPANY.name}</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {ISSUING_COMPANY.address}
              <br />
              Tel {ISSUING_COMPANY.phone} · {ISSUING_COMPANY.website}
            </p>
          </div>
          <dl className="shrink-0 space-y-0.5 text-xs">
            {head.map((row) => (
              <div key={row.label} className="flex gap-3">
                <dt className="w-28 shrink-0 text-muted-foreground">{row.label}</dt>
                <dd className="font-medium">{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </header>

      {children}
    </article>
  );
}

export function Caption({ children }: { children: ReactNode }) {
  return (
    <p className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
      {children}
    </p>
  );
}

export function DocumentFields({
  fields,
  columns = 2,
}: {
  fields: Array<{ label: string; value: ReactNode; wide?: boolean }>;
  columns?: 2 | 3;
}) {
  return (
    <dl
      className={cn(
        "grid gap-x-6 gap-y-2 border border-border p-3 text-xs",
        columns === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2",
      )}
    >
      {fields.map((field) => (
        <div key={field.label} className={cn("min-w-0", field.wide && "sm:col-span-full")}>
          <dt className="text-muted-foreground">{field.label}</dt>
          <dd className="font-medium break-words">{field.value || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The two signature blocks on the transmittal: issued by and received by.
 * Print labels, same separation the gate pass and the purchase order keep —
 * a block prints an empty rule when the system holds no signatory for it.
 */
export function SignatureBlocks({
  blocks,
}: {
  blocks: Array<{ label: string; name?: string | null; detail?: string | null }>;
}) {
  return (
    <section className="break-inside-avoid">
      <Caption>Signatures</Caption>
      <div className="grid gap-4 sm:grid-cols-2">
        {blocks.map((block) => (
          <div key={block.label} className="border border-border p-3">
            <div className="h-12" aria-hidden />
            <div className="border-t border-foreground pt-1.5">
              <p className="text-xs font-semibold">{block.label}</p>
              <p className="text-xs text-muted-foreground">{block.name || " "}</p>
              {block.detail ? (
                <p className="text-xs text-muted-foreground">{block.detail}</p>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function DocumentTable({
  headers,
  children,
}: {
  headers: Array<{ label: string; align?: "left" | "right" }>;
  children: ReactNode;
}) {
  return (
    <table className="w-full border border-border text-xs">
      <thead>
        <tr className="bg-muted/60">
          {headers.map((h) => (
            <th
              key={h.label}
              className={cn(
                "border border-border px-2 py-1.5 font-semibold",
                h.align === "right" ? "text-right" : "text-left",
              )}
            >
              {h.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

export function Td({
  children,
  align = "left",
  className,
}: {
  children: ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <td
      className={cn(
        "border border-border px-2 py-1.5 align-top",
        align === "right" ? "num text-right" : "",
        className,
      )}
    >
      {children}
    </td>
  );
}
