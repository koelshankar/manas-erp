"use client";

import { useState } from "react";
import { PenLine, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, PrintButton, StatusPill } from "@/components/common";
import { TransmittalDocument } from "./transmittal-document";
import { TransmittalDialog } from "./transmittal-dialog";
import { useActor, useAllRows, useProjectRows, useServiceAction } from "@/lib/hooks";
import {
  issueTransmittal,
  recordTransmittalReceipt,
} from "@/lib/services/transmittal-service";
import { formatDate } from "@/lib/format";
import { today } from "@/lib/clock";
import type { Project, Transmittal, TransmittalLine } from "@/lib/domain";
import {
  AppDialog,
  AppDialogBody,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from "@/components/ui-app";

/**
 * One transmittal: the paper, and whichever of its two acts this role may
 * take — issue it, or record that it came back signed. Only one is ever
 * possible at a time, the same rule the gate pass sheet keeps.
 */
export function TransmittalSheet({
  transmittal,
  open,
  onOpenChange,
  projectId,
  canEdit,
}: {
  transmittal: Transmittal | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  canEdit: boolean;
}) {
  const all = useProjectRows("transmittals", projectId) as Transmittal[];
  const allLines = useProjectRows("transmittal_lines", projectId) as TransmittalLine[];
  const projects = useAllRows("projects") as Project[];

  const live = transmittal ? (all.find((t) => t.id === transmittal.id) ?? transmittal) : null;
  if (!live) return null;

  const lines = allLines
    .filter((l) => l.transmittal_id === live.id)
    .sort((a, b) => a.drawing_no.localeCompare(b.drawing_no));

  return (
    <AppDialog open={open} onOpenChange={onOpenChange} size="xl">
      <AppDialogHeader className="print:hidden">
        <AppDialogTitle className="flex flex-wrap items-center gap-3 font-mono">
          {live.transmittal_number}
          <StatusPill status={live.status} />
        </AppDialogTitle>
        <AppDialogDescription>
          To {live.to_name} on {formatDate(live.transmittal_date)}
        </AppDialogDescription>
      </AppDialogHeader>

      <AppDialogBody>
        <TransmittalDocument
          transmittal={live}
          lines={lines}
          project={projects.find((p) => p.id === live.project_id)}
        />
      </AppDialogBody>

      <AppDialogFooter className="print:hidden">
        <PrintButton label="Print / PDF" />
        {canEdit && live.status === "draft" ? (
          <>
            <TransmittalDialog projectId={projectId} today={today()} editing={live} />
            <IssueAction transmittal={live} />
          </>
        ) : null}
        {canEdit && live.status === "issued" ? <ReceiptAction transmittal={live} /> : null}
      </AppDialogFooter>
    </AppDialog>
  );
}

function IssueAction({ transmittal }: { transmittal: Transmittal }) {
  const actor = useActor();
  const { run, pending } = useServiceAction();
  return (
    <Button
      size="sm"
      disabled={pending}
      onClick={() =>
        run(() => issueTransmittal(transmittal.id, actor), {
          success: `${transmittal.transmittal_number} issued`,
          view: `/projects/${transmittal.project_id}/drawings/transmittals`,
        })
      }
    >
      <Send className="size-3.5" /> Issue
    </Button>
  );
}

/** The receiver signs for it. A name, because they have no login. */
function ReceiptAction({ transmittal }: { transmittal: Transmittal }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(transmittal.to_name);
  const [date, setDate] = useState(today());
  const actor = useActor();
  const { run, pending } = useServiceAction();

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <PenLine className="size-3.5" /> Record receipt
      </Button>

      <AppDialog open={open} onOpenChange={setOpen} size="sm">
        <AppDialogHeader
          title="Who signed for it?"
          context="The receiver has no login, so this is a name and a date."
        />
        <AppDialogBody className="space-y-3">
          <Field label="Received by" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Date received" required>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </AppDialogBody>
        <AppDialogFooter>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={pending || name.trim().length < 2 || !date}
            onClick={() =>
              run(
                () =>
                  recordTransmittalReceipt(
                    { transmittal_id: transmittal.id, received_by_name: name, received_at: date },
                    actor,
                  ),
                {
                  success: `${transmittal.transmittal_number} marked received`,
                  onDone: () => setOpen(false),
                },
              )
            }
          >
            Record receipt
          </Button>
        </AppDialogFooter>
      </AppDialog>
    </>
  );
}
