"use client";

import type { ReactNode } from "react";
import { ISSUING_COMPANY } from "@/config/po-document";
import { cn } from "cn";

/**
 * The chrome the three stores documents share, on A4.
 *
 * All three of the templates Manas sent us are laid out the same way: a title
 * band, the company block with the document's own number and date beside it,
 * a field grid, the line table, and a row of signature blocks across the foot.
 * Only the fields and the blocks differ, so the frame is written once here.
 *
 * The article is marked `data-print-area`, so `<PrintButton>` prints it and
 * nothing else on the page.
 */
export function StoresDocument({
  title,
  /** Document number and date, printed top right. */
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
              <br />
              GST No. <span className="font-mono">{ISSUING_COMPANY.gstin}</span>
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

/** A small-caps caption above a block, as their forms print them. */
export function Caption({ children }: { children: ReactNode }) {
  return (
    <p className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
      {children}
    </p>
  );
}

/** The field grid their forms carry above the line table. */
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
        <div
          key={field.label}
          className={cn("min-w-0", field.wide && "sm:col-span-full")}
        >
          <dt className="text-muted-foreground">{field.label}</dt>
          <dd className="font-medium break-words">{field.value || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The signature blocks across the foot of the form.
 *
 * **These are print labels, never approval state** — the same separation the
 * purchase order keeps (see `PO_SIGNATURE_LABELS`). A block whose signatory the
 * system knows prints the name under the rule; one that is signed on paper
 * prints an empty rule, which is honest about what the system holds.
 *
 * The material issue has four of them, the gate pass three and the transfer
 * order four, exactly as their templates do.
 */
export function SignatureBlocks({
  blocks,
}: {
  blocks: Array<{ label: string; name?: string | null; detail?: string | null }>;
}) {
  return (
    <section className="break-inside-avoid">
      <Caption>Signatures</Caption>
      <div
        className={cn(
          "grid gap-4",
          blocks.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-4",
        )}
      >
        {blocks.map((block) => (
          <div key={block.label} className="border border-border p-3">
            <div className="h-12" aria-hidden />
            <div className="border-t border-foreground pt-1.5">
              <p className="text-xs font-semibold">{block.label}</p>
              <p className="text-xs text-muted-foreground">
                {block.name || " "}
              </p>
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

/** The line table their forms print: bordered, with a repeating header. */
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
