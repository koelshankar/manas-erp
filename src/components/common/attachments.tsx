"use client";

import { useRef, useState } from "react";
import { Camera, FileText, Paperclip, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AppDialog,
  AppDialogBody,
  AppDialogHeader,
  ConfirmDialog,
} from "@/components/ui-app";
import {
  ATTACHMENT_PROMPT,
  addAttachment,
  removeAttachment,
} from "@/lib/services/attachment-service";
import type { Attachment, AttachmentEntityType } from "@/lib/domain";
import { useActor, useAllRows, useLookups, useServiceAction } from "@/lib/hooks";
import { formatDateTime } from "@/lib/format";
import { openDataUrl, readAttachmentFile } from "@/lib/files/read-attachment";

/** 1.4 MB — the size a person recognises, not 1468006. */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * The files hung off one record: photographs as thumbnails, PDFs as chips, each
 * with who attached it and when.
 *
 * **Demo-grade storage.** A file the person picks is read in the browser — a
 * photograph is scaled to 1280 px and re-encoded as JPEG first — and kept on the
 * row as a data URL, in this browser's localStorage. It survives a reload and
 * goes with "Reset demo"; it is not on any server and another device will not
 * see it. The panel says so once, in small type, rather than on every file.
 *
 * `canEdit` is what lets a person add and remove: the caller passes the grant on
 * the record's own resource, and withholds it once the record is closed.
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
  const rows = all
    .filter((a) => a.entity_type === entityType && a.entity_id === entityId)
    .sort((a, b) => a.uploaded_at.localeCompare(b.uploaded_at));
  const lookup = useLookups();
  const actor = useActor();
  const { run, pending } = useServiceAction();
  const filePicker = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<Attachment | null>(null);
  const [viewing, setViewing] = useState<Attachment | null>(null);

  async function onPick(files: FileList | null) {
    if (!files) return;
    setReading(true);
    const taken = new Set(rows.map((r) => r.file_name));
    try {
      for (const file of Array.from(files)) {
        let read;
        try {
          read = await readAttachmentFile(file, taken);
        } catch (error) {
          toast.error(`${file.name || "That file"} was not attached`, {
            description: error instanceof Error ? error.message : "Try another file.",
          });
          continue;
        }
        taken.add(read.file_name);
        await run(
          () =>
            addAttachment(
              {
                project_id: projectId,
                entity_type: entityType,
                entity_id: entityId,
                file_name: read.file_name,
                content_type: read.content_type,
                size: read.size,
                data_url: read.data_url,
              },
              actor,
            ),
          { success: `${read.file_name} attached` },
        );
      }
    } finally {
      setReading(false);
      if (filePicker.current) filePicker.current.value = "";
      if (camera.current) camera.current.value = "";
    }
  }

  const busy = pending || reading;

  return (
    <section className={className}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[0.9375rem] font-semibold text-foreground">Attachments</h3>
          <p className="text-xs text-muted-foreground">{ATTACHMENT_PROMPT[entityType]}.</p>
        </div>
        {canEdit ? (
          <div className="flex items-center gap-2">
            {/* Two inputs: one opens the camera on a phone, one the file picker. */}
            <input
              ref={camera}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              tabIndex={-1}
              onChange={(e) => void onPick(e.target.files)}
              aria-label="Take a photograph"
            />
            <input
              ref={filePicker}
              type="file"
              accept="image/*,application/pdf"
              multiple
              className="hidden"
              tabIndex={-1}
              onChange={(e) => void onPick(e.target.files)}
              aria-label="Attach a photograph or PDF"
            />
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => camera.current?.click()}
            >
              <Camera className="size-3.5" /> Photo
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => filePicker.current?.click()}
            >
              <Upload className="size-3.5" /> {reading ? "Reading…" : "Attach"}
            </Button>
          </div>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg bg-muted/40 px-3 py-4 text-center text-xs text-muted-foreground">
          Nothing attached yet.
          {canEdit ? ` ${ATTACHMENT_PROMPT[entityType]} belongs here.` : ""}
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {rows.map((a) => (
            <li key={a.id} className="flex min-w-0 items-start gap-3 rounded-lg p-2 ring-1 ring-border">
              <Preview attachment={a} onOpen={() => (a.kind === "photo" ? setViewing(a) : openFile(a))} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground" title={a.file_name}>
                  {a.file_name}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {lookup.user(a.uploaded_by_user_id)} · {formatDateTime(a.uploaded_at)}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {formatSize(a.size)}
                  {a.caption ? ` · ${a.caption}` : ""}
                </p>
                {a.data_url ? null : (
                  <p className="text-xs text-muted-foreground">Sample record — no file kept.</p>
                )}
              </div>
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
          ))}
        </ul>
      )}
      {rows.length > 0 || canEdit ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Demo: files are kept in this browser only.
        </p>
      ) : null}

      <AppDialog open={viewing !== null} onOpenChange={(v) => !v && setViewing(null)} size="lg">
        <AppDialogHeader
          title={viewing?.file_name ?? ""}
          context={
            viewing
              ? `${lookup.user(viewing.uploaded_by_user_id)} · ${formatDateTime(viewing.uploaded_at)}`
              : undefined
          }
        />
        <AppDialogBody>
          {viewing?.data_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={viewing.data_url}
              alt={viewing.caption || viewing.file_name}
              className="mx-auto max-h-[70vh] w-auto max-w-full rounded-lg"
            />
          ) : null}
        </AppDialogBody>
      </AppDialog>

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

function openFile(a: Attachment) {
  if (!a.data_url) {
    toast.message("This sample record has no file behind it.");
    return;
  }
  openDataUrl(a.data_url);
}

/** A thumbnail for a photograph, a file chip for anything else. */
function Preview({ attachment: a, onOpen }: { attachment: Attachment; onOpen: () => void }) {
  if (a.kind === "photo" && a.data_url) {
    return (
      <button
        type="button"
        onClick={onOpen}
        aria-label={`View ${a.file_name}`}
        className="size-16 shrink-0 overflow-hidden rounded-lg bg-muted ring-1 ring-border focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={a.data_url} alt="" className="size-full object-cover" />
      </button>
    );
  }
  const Icon = a.kind === "pdf" ? FileText : Paperclip;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={a.data_url ? `Open ${a.file_name}` : `${a.file_name} (sample, no file)`}
      className="flex size-16 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg bg-muted text-muted-foreground ring-1 ring-border focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <Icon className="size-5" />
      <span className="text-xs font-semibold uppercase">{a.kind === "pdf" ? "PDF" : "File"}</span>
    </button>
  );
}
