"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Field, NativeSelect, StatusPill } from "@/components/common";
import {
  useActor,
  useLookups,
  useMaterialPositions,
  useProjectRows,
  useServiceAction,
} from "@/lib/hooks";
import { approveIndent } from "@/lib/services/indent-service";
import { formatDate, formatNumber } from "@/lib/format";
import type { Indent, IndentLine } from "@/lib/domain";
import { cn } from "cn";
import {
  AppDialog,
  AppDialogBody,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from "@/components/ui-app";

type Decision = "approve" | "reduce" | "reject";
type Draft = {
  decision: Decision;
  approved_qty: string;
  rejection_reason: string;
};

/**
 * The A2 gate.
 *
 * Each line shows what was requested against the BOQ material budget, what has
 * already been indented and issued, the balance, and what is on site — so the
 * Project Head decides on the same figures the Site Engineer saw.
 */
export function IndentApprovalSheet({
  indent,
  open,
  onOpenChange,
  projectId,
  canApprove,
}: {
  indent: Indent | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  canApprove: boolean;
}) {
  const allLines = useProjectRows("indent_lines", projectId) as IndentLine[];
  const allIndents = useProjectRows("indents", projectId) as Indent[];
  const positions = useMaterialPositions(projectId);
  const lookup = useLookups();
  const actor = useActor();
  const { run, pending } = useServiceAction();

  const lines = useMemo(
    () => (indent ? allLines.filter((l) => l.indent_id === indent.id) : []),
    [allLines, indent],
  );

  const [comment, setComment] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  useEffect(() => {
    if (!indent) return;
    setComment("");
    setDrafts(
      Object.fromEntries(
        lines.map((l) => [
          l.id,
          {
            decision: "approve" as Decision,
            approved_qty: String(l.requested_qty),
            rejection_reason: "",
          },
        ]),
      ),
    );
    // Reset only when the sheet is pointed at a different indent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indent?.id]);

  // The live row, so a decision taken here updates this sheet immediately.
  const live = indent
    ? (allIndents.find((i) => i.id === indent.id) ?? indent)
    : null;
  if (!live) return null;

  const decided = live.status !== "submitted";

  function patch(id: string, change: Partial<Draft>) {
    setDrafts((d) => ({ ...d, [id]: { ...d[id], ...change } }));
  }

  function approveAll() {
    setDrafts(
      Object.fromEntries(
        lines.map((l) => [
          l.id,
          {
            decision: "approve" as Decision,
            approved_qty: String(l.requested_qty),
            rejection_reason: "",
          },
        ]),
      ),
    );
  }

  async function submit() {
    await run(
      () =>
        approveIndent(
          {
            indent_id: indent!.id,
            comment,
            lines: lines.map((l) => {
              const d = drafts[l.id];
              return {
                indent_line_id: l.id,
                decision: d.decision,
                approved_qty:
                  d.decision === "reduce" ? Number(d.approved_qty) : undefined,
                rejection_reason: d.rejection_reason,
              };
            }),
          },
          actor,
        ),
      {
        success: "Indent decision recorded",
        onDone: () => onOpenChange(false),
      },
    );
  }

  return (
    <AppDialog open={open} onOpenChange={onOpenChange} size="xl">
      <AppDialogHeader>
        <AppDialogTitle className="flex items-center gap-3 font-mono">
          {live.indent_number}
          <StatusPill status={live.status} />
        </AppDialogTitle>
        <AppDialogDescription>
          Raised by {lookup.user(live.raised_by_user_id)} on{" "}
          {formatDate(live.raised_date)}
          {live.work_order_id
            ? ` · ${lookup.workOrder(live.work_order_id)}`
            : ""}
        </AppDialogDescription>
      </AppDialogHeader>

      <AppDialogBody className="space-y-4">
        {live.remarks ? (
          <p className="text-sm text-muted-foreground italic">
            “{live.remarks}”
          </p>
        ) : null}

        {canApprove && !decided ? (
          <Button variant="outline" size="sm" onClick={approveAll}>
            <CheckCheck className="size-3.5" /> Approve all as requested
          </Button>
        ) : null}

        {lines.map((line) => {
          const position = positions.get(line.boq_line_id, line.material_id);
          const draft = drafts[line.id] ?? {
            decision: "approve" as Decision,
            approved_qty: String(line.requested_qty),
            rejection_reason: "",
          };
          const over = position
            ? line.requested_qty > position.balance_qty
            : false;

          return (
            <Card key={line.id} className="px-4 py-4">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">
                    {lookup.material(line.material_id)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {lookup.boqItem(line.boq_line_id)} —{" "}
                    {lookup.boqDescription(line.boq_line_id)}
                  </p>
                </div>
                <p className="text-sm font-medium tabular-nums">
                  {formatNumber(line.requested_qty, 2)} {line.unit} requested
                </p>
              </div>

              {position ? (
                <dl className="mb-3 grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg bg-muted/50 px-3 py-2.5 sm:grid-cols-5">
                  <Figure
                    label="BOQ budget"
                    value={position.budget_qty}
                    unit={line.unit}
                  />
                  <Figure
                    label="Already indented"
                    value={position.indented_qty}
                    unit={line.unit}
                  />
                  <Figure
                    label="Already issued"
                    value={position.issued_qty}
                    unit={line.unit}
                  />
                  <Figure
                    label="Balance"
                    value={position.balance_qty}
                    unit={line.unit}
                    tone={over ? "bad" : "good"}
                  />
                  <Figure
                    label="Site stock"
                    value={position.stock_qty}
                    unit={line.unit}
                  />
                </dl>
              ) : (
                <p className="mb-3 text-xs text-muted-foreground">
                  This BOQ line has no material budget for{" "}
                  {lookup.material(line.material_id)}.
                </p>
              )}

              {decided ? (
                <p className="text-sm">
                  {line.approved_qty === 0 ? (
                    <span className="text-destructive">
                      Rejected — {line.rejection_reason || "no reason recorded"}
                    </span>
                  ) : (
                    <span className="text-success">
                      Approved {formatNumber(line.approved_qty ?? 0, 2)}{" "}
                      {line.unit}
                    </span>
                  )}
                </p>
              ) : canApprove ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Decision">
                    <NativeSelect
                      value={draft.decision}
                      onChange={(e) =>
                        patch(line.id, { decision: e.target.value as Decision })
                      }
                    >
                      <option value="approve">Approve as requested</option>
                      <option value="reduce">Approve a reduced quantity</option>
                      <option value="reject">Reject</option>
                    </NativeSelect>
                  </Field>
                  {draft.decision === "reduce" ? (
                    <Field label={`Approved (${line.unit})`} required>
                      <Input
                        type="number"
                        min={0}
                        max={line.requested_qty}
                        step="any"
                        value={draft.approved_qty}
                        onChange={(e) =>
                          patch(line.id, { approved_qty: e.target.value })
                        }
                      />
                    </Field>
                  ) : null}
                  {draft.decision === "reject" ? (
                    <Field label="Reason" required className="sm:col-span-2">
                      <Input
                        value={draft.rejection_reason}
                        onChange={(e) =>
                          patch(line.id, { rejection_reason: e.target.value })
                        }
                        placeholder="Why this line is not approved"
                      />
                    </Field>
                  ) : null}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Waiting on the Project Head.
                </p>
              )}
            </Card>
          );
        })}

        {decided && live.approval_comment ? (
          <p className="text-sm text-muted-foreground">
            Project Head noted: “{live.approval_comment}”
          </p>
        ) : null}

        {canApprove && !decided ? (
          <Field
            label="Comment"
            hint="Recorded on the approval row as part of the audit trail."
          >
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              placeholder="Checked against the work order and the BOQ budget."
            />
          </Field>
        ) : null}
      </AppDialogBody>

      {canApprove && !decided ? (
        <AppDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Recording…" : "Record decision"}
          </Button>
        </AppDialogFooter>
      ) : null}
    </AppDialog>
  );
}

function Figure({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: number;
  unit: string;
  tone?: "good" | "bad";
}) {
  return (
    <div>
      <dt className="text-[10px] tracking-wide text-muted-foreground uppercase">
        {label}
      </dt>
      <dd
        className={cn(
          "text-sm font-medium tabular-nums",
          tone === "bad" && "text-destructive",
          tone === "good" && "text-success",
        )}
      >
        {formatNumber(value, 2)}
        <span className="ml-1 text-[10px] text-muted-foreground">{unit}</span>
      </dd>
    </div>
  );
}
