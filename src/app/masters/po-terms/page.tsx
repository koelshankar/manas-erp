"use client";

import {
  PageHeader,
  DataTable,
  SectionHeading,
  HydrationGate,
  ToneChip,
  type Column,
} from "@/components/common";
import { useAccess, useActor, useAllRows, useServiceAction } from "@/lib/hooks";
import { poClauseCategoryLabel, poVariableFieldLabel } from "@/config/labels";
import { restoreDefaultClauses } from "@/lib/services/po-master-service";
import { ClauseDialog, DeleteClauseButton } from "@/components/purchase/clause-dialogs";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { PoClause } from "@/lib/domain";

/**
 * The terms and conditions printed overleaf on a purchase order, as a library.
 *
 * The three orders Manas sent us carry sixteen to nineteen clauses between
 * them, most of them word for word the same. A free-text box on the order would
 * have meant retyping all of them every time and the wording drifting apart
 * within a week; this is one place to fix a clause and one place to see which
 * four of them each order fills in for itself.
 */
export default function PoTermsPage() {
  const access = useAccess("po_clauses");
  const clauses = useAllRows("po_clauses") as PoClause[];
  const actor = useActor();
  const { run, pending } = useServiceAction();

  const ordered = [...clauses].sort((a, b) => a.sequence - b.sequence);
  const variable = ordered.filter((c) => c.variable_field);

  const columns: Array<Column<PoClause>> = [
    {
      key: "sequence",
      header: "No.",
      align: "right",
      cell: (c) => <span className="num text-muted-foreground">{c.sequence}</span>,
    },
    {
      key: "code",
      header: "Code",
      cell: (c) => <span className="font-mono text-xs">{c.code}</span>,
    },
    { key: "title", header: "Clause", primary: true, cell: (c) => c.title },
    {
      key: "category",
      header: "Category",
      secondary: true,
      cell: (c) => poClauseCategoryLabel(c.category),
    },
    {
      key: "text",
      header: "As it prints",
      cell: (c) => (
        <span className="block max-w-xl text-sm leading-relaxed text-muted-foreground">
          {c.text}
        </span>
      ),
    },
    {
      key: "variable",
      header: "Words from the order",
      cell: (c) =>
        c.variable_field ? (
          <ToneChip tone="info">{poVariableFieldLabel(c.variable_field)}</ToneChip>
        ) : (
          <span className="text-muted-foreground">Fixed</span>
        ),
    },
    {
      key: "default",
      header: "On a new order",
      cell: (c) =>
        c.is_default ? "Pre-selected" : <span className="text-muted-foreground">Off</span>,
    },
    {
      key: "active",
      header: "Status",
      cell: (c) =>
        c.is_active ? (
          <ToneChip tone="success">Active</ToneChip>
        ) : (
          <ToneChip tone="neutral">Inactive</ToneChip>
        ),
    },
    {
      key: "edit",
      header: "",
      cell: (c) =>
        access.canEdit ? (
          <span className="flex items-center justify-end gap-1">
            <ClauseDialog clause={c} />
            {access.canDelete ? <DeleteClauseButton clause={c} /> : null}
          </span>
        ) : null,
    },
  ];

  return (
    <div>
      <PageHeader
        title={access.meta.label}
        description="The numbered clauses printed overleaf on a purchase order. An officer picks and may reword them per order."
        team={access.ownerTeam}
        outsideNav={access.outsideNav}
        owned={access.owned}
        actions={
          access.canCreate ? (
            <span className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() =>
                  run(() => restoreDefaultClauses(actor), {
                    success: "The standard clauses are back to their shipped wording",
                  })
                }
              >
                Restore standard wording
              </Button>
              <ClauseDialog />
            </span>
          ) : null
        }
      />
      <HydrationGate>
        <div className="space-y-8">
          <section>
            <SectionHeading
              title="Clause library"
              description="Sequence is the clause number on a printed order. Dropping a clause closes the gap."
            />
            <DataTable
              columns={columns}
              rows={ordered}
              rowKey={(c) => c.id}
              emptyMessage="The library is empty."
              caption={`${ordered.length} clauses, ${ordered.filter((c) => c.is_default).length} of them pre-selected on a new order.`}
            />
          </section>

          <section>
            <SectionHeading
              title="Filled in on every order"
              description="These four read differently each time, so the order carries the words and the library carries the sentence around them."
            />
            <Card className="divide-y divide-border px-0 py-0">
              {variable.map((c) => (
                <div key={c.id} className="px-5 py-4">
                  <p className="text-sm font-medium">
                    {poVariableFieldLabel(c.variable_field!)}
                    <span className="ml-2 font-mono text-xs text-muted-foreground">{c.code}</span>
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{c.text}</p>
                </div>
              ))}
            </Card>
          </section>
        </div>
      </HydrationGate>
    </div>
  );
}
