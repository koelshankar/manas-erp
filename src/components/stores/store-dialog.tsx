"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, NativeSelect, Warning } from "@/components/common";
import { useActor, useAllRows, useNewParam, useServiceAction } from "@/lib/hooks";
import { createStore, updateStore } from "@/lib/services/store-service";
import type { Project, Store } from "@/lib/domain";
import { FormDialog } from "@/components/ui-app";

/**
 * Add or change a store.
 *
 * A store belongs to a project and cannot be moved to another one — stock rows,
 * gate passes and transfers all point at it, and moving it would rewrite
 * history. The dialog says so rather than offering the change and failing.
 */
export function StoreDialog({
  editing,
  defaultProjectId,
}: {
  editing?: Store | null;
  defaultProjectId?: string;
}) {
  const isEdit = Boolean(editing);
  const [newOpen, setNewOpen] = useNewParam();
  const [editOpen, setEditOpen] = useState(false);
  const open = isEdit ? editOpen : newOpen;
  const setOpen = isEdit ? setEditOpen : setNewOpen;

  const projects = useAllRows("projects") as Project[];
  const stores = useAllRows("stores") as Store[];
  const actor = useActor();
  const { run, pending } = useServiceAction();

  const [projectId, setProjectId] = useState(
    editing?.project_id ?? defaultProjectId ?? "",
  );
  const [code, setCode] = useState(editing?.code ?? "");
  const [name, setName] = useState(editing?.name ?? "");
  const [location, setLocation] = useState(editing?.location ?? "");
  const [keeper, setKeeper] = useState(editing?.keeper_name ?? "");
  const [isPrimary, setIsPrimary] = useState(editing?.is_primary ?? false);
  const [isActive, setIsActive] = useState(editing?.is_active ?? true);

  const siblings = stores.filter((s) => s.project_id === projectId && s.id !== editing?.id);
  const currentPrimary = siblings.find((s) => s.is_primary);
  const onlyOpen = isEdit && siblings.every((s) => !s.is_active);

  const invalidReason = !projectId
    ? "Pick the project it belongs to"
    : code.trim().length < 2
      ? "Give it a short code"
      : name.trim().length < 2
        ? "Give it a name"
        : !isActive && onlyOpen
          ? "This is the project's only open store"
          : undefined;

  async function submit() {
    const payload = {
      project_id: projectId,
      code: code.trim(),
      name: name.trim(),
      location,
      keeper_name: keeper,
      is_primary: isPrimary,
      is_active: isActive,
    };
    await run(
      () => (editing ? updateStore(editing.id, payload, actor) : createStore(payload, actor)),
      {
        success: (store) => `${store.name} saved`,
        view: "/masters/stores",
        onDone: () => {
          setOpen(false);
          if (!editing) {
            setCode("");
            setName("");
            setLocation("");
            setKeeper("");
            setIsPrimary(false);
          }
        },
      },
    );
  }

  return (
    <>
      <Button size="sm" variant={isEdit ? "ghost" : "default"} onClick={() => setOpen(true)}>
        {isEdit ? (
          "Edit"
        ) : (
          <>
            <Plus className="size-3.5" /> Add a store
          </>
        )}
      </Button>

      <FormDialog
        open={open}
        onOpenChange={setOpen}
        size="md"
        title={editing ? `Edit ${editing.name}` : "Add a store"}
        context="A store belongs to a project, and a project may have more than one."
        dirty={name.trim().length > 0}
        invalidReason={invalidReason}
        submitLabel={editing ? "Save changes" : "Add the store"}
        submitting={pending}
        onSubmit={submit}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Project"
            required
            hint={
              isEdit
                ? "A store cannot be moved between projects."
                : undefined
            }
          >
            <NativeSelect
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              disabled={isEdit}
            >
              <option value="">Select a project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </NativeSelect>
          </Field>

          <Field label="Short code" required hint="Unique across the portfolio.">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="MSP-ST2"
              className="font-mono"
            />
          </Field>

          <Field label="Name" required className="sm:col-span-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Manas Sapphire tower B store"
            />
          </Field>

          <Field label="Where it is">
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Tower B basement"
            />
          </Field>

          <Field
            label="Who holds the keys"
            hint="A plain name — it is often a watchman, not a user."
          >
            <Input value={keeper} onChange={(e) => setKeeper(e.target.value)} />
          </Field>

          <Field
            label="Main store"
            hint="Where a GRN lands when nobody is asked. One per project."
          >
            <NativeSelect
              value={isPrimary ? "yes" : "no"}
              onChange={(e) => setIsPrimary(e.target.value === "yes")}
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </NativeSelect>
          </Field>

          <Field label="Open" hint="A closed store takes no new documents.">
            <NativeSelect
              value={isActive ? "yes" : "no"}
              onChange={(e) => setIsActive(e.target.value === "yes")}
            >
              <option value="yes">Open</option>
              <option value="no">Closed</option>
            </NativeSelect>
          </Field>
        </div>

        {isPrimary && currentPrimary ? (
          <Warning>
            {currentPrimary.name} is the main store today. Saving this moves that default,
            and new GRNs will land here instead.
          </Warning>
        ) : null}

        {!isEdit && siblings.length === 0 && projectId ? (
          <Warning>
            This is the project&apos;s first store, so it becomes the main one whether or not
            you tick it: a GRN has to land somewhere.
          </Warning>
        ) : null}
      </FormDialog>
    </>
  );
}
