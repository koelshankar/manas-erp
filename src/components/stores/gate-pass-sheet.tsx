"use client";

import { useState } from "react";
import { Check, PackageCheck, PenLine, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Field, PrintButton, Qty, StatusPill } from "@/components/common";
import { GatePassDocument } from "./gate-pass-document";
import { GatePassDialog } from "./gate-pass-dialog";
import {
  useActor,
  useAllRows,
  useLookups,
  useProjectRows,
  useServiceAction,
} from "@/lib/hooks";
import {
  acknowledgeGatePass,
  actOnGatePass,
  closeGatePass,
  recordGatePassReturn,
  submitGatePass,
} from "@/lib/services/gate-pass-service";
import { formatDate, formatNumber } from "@/lib/format";
import { today } from "@/lib/clock";
import type { GatePass, GatePassLine, Project, Store } from "@/lib/domain";
import {
  AppDialog,
  AppDialogBody,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
  SubmitButton,
} from "@/components/ui-app";

/**
 * One gate pass: the paper, and whichever of its five acts this role may take.
 *
 * The pass moves stores → project manager → the gate, and only one thing is
 * ever possible at a time, so the footer shows one action rather than five
 * greyed-out ones.
 *
 * `GatePassDocument` is the only thing marked `data-print-area`; none of this
 * chrome reaches the paper.
 */
export function GatePassSheet({
  pass,
  open,
  onOpenChange,
  projectId,
  canEdit,
  canApprove,
}: {
  pass: GatePass | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  canEdit: boolean;
  canApprove: boolean;
}) {
  const allPasses = useProjectRows("gate_passes", projectId) as GatePass[];
  const allLines = useProjectRows("gate_pass_lines", projectId) as GatePassLine[];
  const stores = useAllRows("stores") as Store[];
  const projects = useAllRows("projects") as Project[];
  const lookup = useLookups();

  // The live row, so acting on the pass updates this sheet immediately.
  const live = pass ? (allPasses.find((p) => p.id === pass.id) ?? pass) : null;
  if (!live) return null;

  const lines = allLines
    .filter((l) => l.gate_pass_id === live.id)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const outstanding = lines.reduce((s, l) => s + Math.max(0, l.quantity - l.returned_qty), 0);
  const overdue =
    live.pass_type === "returnable" &&
    live.status === "acknowledged" &&
    Boolean(live.expected_return_date && live.expected_return_date < today());

  return (
    <AppDialog open={open} onOpenChange={onOpenChange} size="xl">
      <AppDialogHeader className="print:hidden">
        <AppDialogTitle className="flex flex-wrap items-center gap-3 font-mono">
          {live.gate_pass_number}
          <StatusPill status={live.status} />
        </AppDialogTitle>
        <AppDialogDescription>
          Raised by {lookup.user(live.raised_by_user_id)} on {formatDate(live.gate_pass_date)}
          {live.expected_return_date
            ? ` · due back ${formatDate(live.expected_return_date)}`
            : ""}
        </AppDialogDescription>
      </AppDialogHeader>

      <AppDialogBody>
        <div className="mb-4 space-y-3 print:hidden">
          {overdue ? (
            <Card className="border-l-2 border-l-destructive px-4 py-3">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Overdue
              </p>
              <p className="mt-1 text-sm leading-relaxed">
                Due back on {formatDate(live.expected_return_date!)} and{" "}
                {formatNumber(outstanding, 2)} is still out.
              </p>
            </Card>
          ) : null}

          {live.status === "rejected" && live.decision_comment ? (
            <Card className="border-l-2 border-l-destructive px-4 py-3">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Refused
              </p>
              <p className="mt-1 text-sm leading-relaxed">{live.decision_comment}</p>
            </Card>
          ) : null}
        </div>

        <GatePassDocument
          pass={live}
          lines={lines}
          project={projects.find((p) => p.id === live.project_id)}
          store={stores.find((s) => s.id === live.store_id)}
          raisedBy={lookup.user(live.raised_by_user_id)}
          approvedBy={live.approved_by_user_id ? lookup.user(live.approved_by_user_id) : null}
          materialLabel={(id) => lookup.material(id)}
        />
      </AppDialogBody>

      <AppDialogFooter className="print:hidden">
        <PrintButton label="Print / PDF" />
        {canEdit && live.status === "draft" ? (
          <>
            <GatePassDialog projectId={projectId} today={today()} editing={live} />
            <SubmitAction pass={live} />
          </>
        ) : null}
        {canApprove && live.status === "pending_approval" ? (
          <DecideActions pass={live} onDone={() => onOpenChange(false)} />
        ) : null}
        {canEdit && live.status === "approved" ? <AcknowledgeAction pass={live} /> : null}
        {canEdit && live.status === "acknowledged" && live.pass_type === "returnable" ? (
          <ReturnAction pass={live} lines={lines} />
        ) : null}
        {canEdit && live.status === "acknowledged" && live.pass_type !== "returnable" ? (
          <CloseAction pass={live} />
        ) : null}
      </AppDialogFooter>
    </AppDialog>
  );
}

/* ------------------------------------------------------------------ */
/* The five acts                                                      */
/* ------------------------------------------------------------------ */

function SubmitAction({ pass }: { pass: GatePass }) {
  const actor = useActor();
  const { run, pending } = useServiceAction();
  return (
    <Button
      size="sm"
      disabled={pending}
      onClick={() =>
        run(() => submitGatePass(pass.id, actor), {
          success: `${pass.gate_pass_number} sent to the project manager`,
          view: `/projects/${pass.project_id}/stores/gate-pass`,
        })
      }
    >
      <Send className="size-3.5" /> Send for approval
    </Button>
  );
}

/** The project manager's signature. Approving is what takes the stock out. */
function DecideActions({ pass, onDone }: { pass: GatePass; onDone: () => void }) {
  const [refusing, setRefusing] = useState(false);
  const [comment, setComment] = useState("");
  const actor = useActor();
  const { run, pending } = useServiceAction();

  async function decide(action: "approve" | "reject") {
    await run(() => actOnGatePass({ gate_pass_id: pass.id, action, comment }, actor), {
      success: (result) =>
        action === "approve"
          ? `${result.gate_pass.gate_pass_number} approved — ${result.stock_entries.length} stock ${result.stock_entries.length === 1 ? "line" : "lines"} out of the store`
          : `${result.gate_pass.gate_pass_number} refused`,
      view: `/projects/${pass.project_id}/stores/gate-pass`,
      onDone: () => {
        setRefusing(false);
        setComment("");
        onDone();
      },
    });
  }

  return (
    <>
      <Button variant="destructive" size="sm" onClick={() => setRefusing(true)}>
        <X className="size-3.5" /> Refuse
      </Button>
      <Button size="sm" disabled={pending} onClick={() => decide("approve")}>
        <Check className="size-3.5" /> Approve
      </Button>

      <AppDialog open={refusing} onOpenChange={setRefusing} size="sm">
        <AppDialogHeader
          title={`Refuse ${pass.gate_pass_number}?`}
          context="Nothing leaves the store, and the storeman sees why."
        />
        <AppDialogBody>
          <Field label="Reason" required>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
            />
          </Field>
        </AppDialogBody>
        <AppDialogFooter>
          <Button variant="ghost" size="sm" onClick={() => setRefusing(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={pending || comment.trim().length < 3}
            onClick={() => decide("reject")}
          >
            Refuse the pass
          </Button>
        </AppDialogFooter>
      </AppDialog>
    </>
  );
}

/** The receiver signs at the gate. A name, because they have no login. */
function AcknowledgeAction({ pass }: { pass: GatePass }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(pass.issued_to_name);
  const actor = useActor();
  const { run, pending } = useServiceAction();

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <PenLine className="size-3.5" /> Record at the gate
      </Button>

      <AppDialog open={open} onOpenChange={setOpen} size="sm">
        <AppDialogHeader
          title="Who signed for it at the gate?"
          context="The receiver has no login, so the pass records their name."
        />
        <AppDialogBody>
          <Field label="Received by" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
        </AppDialogBody>
        <AppDialogFooter>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <SubmitButton
            type="button"
            label="Record it"
            invalidReason={name.trim().length < 2 ? "Give the receiver's name" : undefined}
            submitting={pending}
            onClick={() =>
              run(() => acknowledgeGatePass(pass.id, name, actor), {
                success: `${pass.gate_pass_number} signed for by ${name}`,
                view: `/projects/${pass.project_id}/stores/gate-pass`,
                onDone: () => setOpen(false),
              })
            }
          />
        </AppDialogFooter>
      </AppDialog>
    </>
  );
}

/**
 * Closing a returnable pass by recording what came back.
 *
 * Per line and more than once, because material comes back in part — and the
 * pass closes itself only when every line is square.
 */
function ReturnAction({ pass, lines }: { pass: GatePass; lines: GatePassLine[] }) {
  const [open, setOpen] = useState(false);
  const [returnDate, setReturnDate] = useState(today());
  const [values, setValues] = useState<Record<string, string>>({});
  const lookup = useLookups();
  const actor = useActor();
  const { run, pending } = useServiceAction();

  const outstandingOf = (line: GatePassLine) =>
    Math.max(0, Math.round((line.quantity - line.returned_qty) * 1000) / 1000);
  const open_lines = lines.filter((l) => outstandingOf(l) > 0);
  const entered = open_lines.filter((l) => Number(values[l.id]) > 0);
  const over = open_lines.some((l) => Number(values[l.id] ?? 0) > outstandingOf(l));

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <PackageCheck className="size-3.5" /> Record the return
      </Button>

      <AppDialog open={open} onOpenChange={setOpen} size="md">
        <AppDialogHeader
          title={`What came back on ${pass.gate_pass_number}?`}
          context="Record it line by line. The pass closes when every line is square."
        />
        <AppDialogBody className="space-y-4">
          <Field label="Return date" required>
            <Input
              type="date"
              value={returnDate}
              onChange={(e) => setReturnDate(e.target.value)}
            />
          </Field>

          <div className="space-y-3">
            {open_lines.map((line) => {
              const left = outstandingOf(line);
              const value = Number(values[line.id] ?? 0);
              return (
                <div key={line.id} className="rounded-xl border border-border p-3">
                  <p className="text-sm font-medium">
                    {line.material_id ? lookup.material(line.material_id) : line.description}
                  </p>
                  <p className="mb-2 text-xs text-muted-foreground">
                    <Qty value={left} unit={line.unit} /> still out
                  </p>
                  <Field
                    label="Returned now"
                    error={value > left ? `Only ${formatNumber(left, 2)} is still out` : undefined}
                  >
                    <Input
                      type="number"
                      min={0}
                      max={left}
                      step="any"
                      value={values[line.id] ?? ""}
                      onChange={(e) =>
                        setValues((v) => ({ ...v, [line.id]: e.target.value }))
                      }
                      aria-invalid={value > left || undefined}
                    />
                  </Field>
                </div>
              );
            })}
          </div>
        </AppDialogBody>
        <AppDialogFooter>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <SubmitButton
            type="button"
            label="Record the return"
            invalidReason={
              entered.length === 0
                ? "Enter what came back on at least one line"
                : over
                  ? "A line returns more than went out"
                  : undefined
            }
            submitting={pending}
            onClick={() =>
              run(
                () =>
                  recordGatePassReturn(
                    {
                      gate_pass_id: pass.id,
                      return_date: returnDate,
                      lines: open_lines.map((l) => ({
                        gate_pass_line_id: l.id,
                        returned_qty: Number(values[l.id] ?? 0),
                      })),
                    },
                    actor,
                  ),
                {
                  success: (result) =>
                    result.fully_returned
                      ? `${pass.gate_pass_number} is square and closed`
                      : `Return recorded against ${pass.gate_pass_number} — part of it is still out`,
                  view: `/projects/${pass.project_id}/stores/gate-pass`,
                  onDone: () => {
                    setOpen(false);
                    setValues({});
                  },
                },
              )
            }
          />
        </AppDialogFooter>
      </AppDialog>
    </>
  );
}

/** Files a non-returnable pass away. Nothing is coming back. */
function CloseAction({ pass }: { pass: GatePass }) {
  const actor = useActor();
  const { run, pending } = useServiceAction();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        run(() => closeGatePass(pass.id, actor), {
          success: `${pass.gate_pass_number} closed`,
          view: `/projects/${pass.project_id}/stores/gate-pass`,
        })
      }
    >
      <Check className="size-3.5" /> Close the pass
    </Button>
  );
}
