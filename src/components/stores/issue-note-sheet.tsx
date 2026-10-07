"use client";

import { useState } from "react";
import { PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Attachments, Field, PrintButton, RecordTrail, StatusPill } from "@/components/common";
import { IssueNoteDocument } from "./issue-note-document";
import {
  useActor,
  useAllRows,
  useLookups,
  useProjectRows,
  useServiceAction,
} from "@/lib/hooks";
import { acknowledgeMaterialIssue } from "@/lib/services/stores-service";
import { formatDate } from "@/lib/format";
import type {
  Contractor,
  MaterialIssue,
  MaterialIssueLine,
  Project,
  Store,
  WorkOrder,
} from "@/lib/domain";
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
 * One issue note: the paper, plus the one thing that can still happen to it.
 *
 * The material left the counter when the note was written, so there is no gate
 * to pass — only the contractor's storeman signing for it, which is the fourth
 * block on their form. An unacknowledged note is the one a contractor later
 * disputes, so it is worth being able to close it off.
 *
 * `IssueNoteDocument` is the only thing marked `data-print-area`; none of this
 * chrome reaches the paper.
 */
export function IssueNoteSheet({
  issue,
  open,
  onOpenChange,
  projectId,
  canEdit,
}: {
  issue: MaterialIssue | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  canEdit: boolean;
}) {
  const allIssues = useProjectRows("material_issues", projectId) as MaterialIssue[];
  const allLines = useProjectRows("material_issue_lines", projectId) as MaterialIssueLine[];
  const stores = useAllRows("stores") as Store[];
  const projects = useAllRows("projects") as Project[];
  const contractors = useAllRows("contractors") as Contractor[];
  const workOrders = useProjectRows("work_orders", projectId) as WorkOrder[];
  const lookup = useLookups();

  // The live row, so acknowledging it updates this sheet immediately.
  const live = issue ? (allIssues.find((i) => i.id === issue.id) ?? issue) : null;
  if (!live) return null;

  const lines = allLines
    .filter((l) => l.material_issue_id === live.id)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  return (
    <AppDialog open={open} onOpenChange={onOpenChange} size="xl">
      <AppDialogHeader className="print:hidden">
        <AppDialogTitle className="flex flex-wrap items-center gap-3 font-mono">
          {live.issue_number}
          <StatusPill status={live.status} />
        </AppDialogTitle>
        <AppDialogDescription>
          Issued by {lookup.user(live.issued_by_user_id)} on {formatDate(live.issue_date)}
          {live.acknowledged_at
            ? ` · signed for by ${live.acknowledged_by_name} on ${formatDate(live.acknowledged_at)}`
            : " · not yet signed for"}
        </AppDialogDescription>
      </AppDialogHeader>

      <AppDialogBody>
        <div className="mb-4 print:hidden">
          <RecordTrail entityType="material_issue" entityId={live.id} />
        </div>

        <IssueNoteDocument
          issue={live}
          lines={lines}
          project={projects.find((p) => p.id === live.project_id)}
          store={stores.find((s) => s.id === live.store_id)}
          contractor={contractors.find((c) => c.id === live.issued_to_contractor_id)}
          workOrder={workOrders.find((w) => w.id === live.work_order_id)}
          issuedBy={lookup.user(live.issued_by_user_id)}
          materialParts={(id) => lookup.materialParts(id)}
        />

        <Attachments
          entityType="material_issue"
          entityId={live.id}
          projectId={live.project_id}
          canEdit={canEdit}
          className="mt-6 print:hidden"
        />
      </AppDialogBody>

      <AppDialogFooter className="print:hidden">
        <PrintButton label="Print / PDF" />
        {canEdit && live.status === "issued" ? (
          <AcknowledgeButton issue={live} />
        ) : null}
      </AppDialogFooter>
    </AppDialog>
  );
}

/** The contractor's storeman signs for it. A name, because they have no login. */
function AcknowledgeButton({ issue }: { issue: MaterialIssue }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const actor = useActor();
  const { run, pending } = useServiceAction();

  async function submit() {
    await run(() => acknowledgeMaterialIssue(issue.id, name, actor), {
      success: `${issue.issue_number} signed for by ${name}`,
      view: `/projects/${issue.project_id}/stores/stock`,
      onDone: () => {
        setOpen(false);
        setName("");
      },
    });
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <PenLine className="size-3.5" /> Record acknowledgement
      </Button>

      <AppDialog open={open} onOpenChange={setOpen} size="sm">
        <AppDialogHeader
          title="Who signed for it?"
          context="The contractor's storeman has no login, so the note records their name."
        />
        <AppDialogBody>
          <Field label="Signed for by" required>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name on the contractor's side"
            />
          </Field>
        </AppDialogBody>
        <AppDialogFooter>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <SubmitButton
            type="button"
            label="Record acknowledgement"
            invalidReason={name.trim().length < 2 ? "Give the name of whoever signed" : undefined}
            submitting={pending}
            onClick={submit}
          />
        </AppDialogFooter>
      </AppDialog>
    </>
  );
}
