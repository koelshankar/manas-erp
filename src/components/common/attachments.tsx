"use client";

import { useRef, useState } from "react";
import { FileSpreadsheet, FileText, ImageIcon, Paperclip, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui-app";
import {
  ATTACHMENT_PROMPT,
  addAttachment,
  removeAttachment,
} from "@/lib/services/attachment-service";
import type { Attachment, AttachmentEntityType, AttachmentKind } from "@/lib/domain";
import { useActor, useAllRows, useLookups, useServiceAction } from "@/lib/hooks";
import { formatDate } from "@/lib/format";
import { cn } from "cn";

const ICON: Record<AttachmentKind, typeof Paperclip> = {
  photo: ImageIcon,
  pdf: FileText,
  spreadsheet: FileSpreadsheet,
  other: Paperclip,
};

/** 1.4 MB — the size a person recognises, not 1468006. */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * The files hung off one record.
 *
 * The demo has no blob store: picking a file records its name, type and size
 * and nothing else, which is enough to show the workflow and exactly what a
 * Supabase Storage row will hold. Nothing here pretends a file was uploaded —
 * the list says "demo: not stored" on every row rather than offering a
 * download that would 404.
 */
export function Attachments({
  entityType,
  entityId,
  projectId,
  canEdit,
  className,
}: {
  entityType: AttachmentEntityType;
  entityId: string;
  projectId: string;
  canEdit: boolean;
  className?: string;
}) {
  const all = useAllRows("attachments") as Attachment[];
  const rows = all.filter((a) => a.entity_type === entityType && a.entity_id === entityId);
  const lookup = useLookups();
  const actor = useActor();
  const { run, pending } = useServiceAction();
  const input = useRef<HTMLInputElement>(null);
  const [confirmRemove, setConfirmRemove] = useState<Attachment | null>(null);

  async function onPick(files: FileList | null) {
    if (!files) return;
    for (const file of Array.from(files)) {
      await run(
        () =>
          addAttachment(
            {
              project_id: projectId,
              entity_type: entityType,
              entity_id: entityId,
              file_name: file.name,
              content_type: file.type || "application/octet-stream",
              size: file.size,
            },
            actor,
          ),
        { success: `${file.name} attached` },
      );
    }
    if (input.current) input.current.value = "";
  }

  return (
    <section className={className}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-[0.9375rem] font-semibold text-foreground">Attachments</h3>
          <p className="text-xs text-muted-foreground">{ATTACHMENT_PROMPT[entityType]}.</p>
        </div>
        {canEdit ? (
          <>
            <input
              ref={input}
              type="file"
              multiple
              className="sr-only"
              onChange={(e) => void onPick(e.target.files)}
              aria-label="Attach a file"
            />
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => input.current?.click()}
            >
              <Upload className="size-3.5" /> Attach
            </Button>
          </>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg bg-muted/40 px-3 py-4 text-center text-xs text-muted-foreground">
          Nothing attached yet.
          {canEdit ? ` ${ATTACHMENT_PROMPT[entityType]} belongs here.` : ""}
        </p>
      ) : (
        <ul className="divide-y divide-border/50 rounded-lg ring-1 ring-border">
          {rows.map((a) => {
            const Icon = ICON[a.kind];
            return (
              <li key={a.id} className="flex items-center gap-3 px-3 py-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{a.file_name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {formatSize(a.size)} · {lookup.user(a.uploaded_by_user_id)} ·{" "}
                    {formatDate(a.uploaded_at)}
                    {a.caption ? ` · ${a.caption}` : ""}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground",
                  )}
                  title="The demo records the file's details; nothing is stored."
                >
                  demo: not stored
                </span>
                {canEdit ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${a.file_name}`}
                    onClick={() => setConfirmRemove(a)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={confirmRemove !== null}
        onOpenChange={(v) => !v && setConfirmRemove(null)}
        title="Remove this attachment?"
        consequence={`${confirmRemove?.file_name} is taken off this record. The record itself is untouched.`}
        confirmLabel="Remove"
        tone="destructive"
        submitting={pending}
        onConfirm={() => {
          const target = confirmRemove;
          if (!target) return;
          void run(() => removeAttachment(target.id, actor), {
            success: `${target.file_name} removed`,
            onDone: () => setConfirmRemove(null),
          });
        }}
      />
    </section>
  );
}
