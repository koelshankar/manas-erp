"use client";

import { useEffect, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, NativeSelect, Warning } from "@/components/common";
import { useActor, useServiceAction } from "@/lib/hooks";
import {
  createPoClause,
  deletePoClause,
  updatePoClause,
} from "@/lib/services/po-master-service";
import { PO_CLAUSE_CATEGORIES, PO_VARIABLE_FIELDS, type PoClause } from "@/lib/domain";
import { poClauseCategoryLabel, poVariableFieldLabel } from "@/config/labels";
import {
  AppDialog,
  AppDialogBody,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
  ConfirmDialog,
  SubmitButton,
} from "@/components/ui-app";

/**
 * Add and edit a clause in the purchase order terms library.
 *
 * A clause carrying one of the four variable fields needs `{{value}}` in its
 * text: that is where the order's own words go. The form says so rather than
 * letting an officer save a clause whose variable words would never appear.
 */
export function ClauseDialog({ clause }: { clause?: PoClause }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>("general");
  const [text, setText] = useState("");
  const [variable, setVariable] = useState("");
  const [sequence, setSequence] = useState("1");
  const [isDefault, setIsDefault] = useState(true);
  const [isActive, setIsActive] = useState(true);
  const actor = useActor();
  const { run, pending } = useServiceAction();

  useEffect(() => {
    if (!open) return;
    setCode(clause?.code ?? "");
    setTitle(clause?.title ?? "");
    setCategory(clause?.category ?? "general");
    setText(clause?.text ?? "");
    setVariable(clause?.variable_field ?? "");
    setSequence(String(clause?.sequence ?? 1));
    setIsDefault(clause?.is_default ?? true);
    setIsActive(clause?.is_active ?? true);
  }, [open, clause]);

  const needsPlaceholder = variable !== "" && !text.includes("{{value}}");
  const invalidReason =
    code.trim().length < 2
      ? "A clause needs a code, such as PAY-01."
      : title.trim().length < 2
        ? "Give the clause a short name for the library."
        : text.trim().length < 5
          ? "Type the clause as it should print."
          : needsPlaceholder
            ? "A variable clause needs {{value}} where the order's words go."
            : undefined;

  async function submit() {
    const payload = {
      code: code.trim(),
      category: category as PoClause["category"],
      sequence: Number(sequence) || 1,
      title: title.trim(),
      text: text.trim(),
      variable_field: (variable || null) as PoClause["variable_field"],
      is_default: isDefault,
      is_active: isActive,
    };
    await run(
      () => (clause ? updatePoClause(clause.id, payload, actor) : createPoClause(payload, actor)),
      {
        success: clause ? "Clause updated" : "Clause added to the library",
        view: "/masters/po-terms",
        onDone: () => setOpen(false),
      },
    );
  }

  return (
    <>
      {clause ? (
        <Button
          variant="ghost"
          size="xs"
          onClick={() => setOpen(true)}
          aria-label={`Edit ${clause.title}`}
        >
          <Pencil className="size-3" /> Edit
        </Button>
      ) : (
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="size-3.5" /> Add clause
        </Button>
      )}
      <AppDialog open={open} onOpenChange={setOpen} size="lg">
        <AppDialogHeader>
          <AppDialogTitle>{clause ? "Edit clause" : "Add a clause"}</AppDialogTitle>
          <AppDialogDescription>
            Clauses print overleaf on every purchase order that carries them, numbered in this
            order.
          </AppDialogDescription>
        </AppDialogHeader>
        <AppDialogBody>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Code" required>
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="PAY-01" />
            </Field>
            <Field label="Prints as clause number">
              <Input
                type="number"
                min={1}
                value={sequence}
                onChange={(e) => setSequence(e.target.value)}
              />
            </Field>
            <Field label="Name in the library" required>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Payment terms"
              />
            </Field>
            <Field label="Category">
              <NativeSelect value={category} onChange={(e) => setCategory(e.target.value)}>
                {PO_CLAUSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {poClauseCategoryLabel(c)}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>

          <Field
            label="Clause text"
            required
            hint="Write {{value}} where the order's own words should go."
          >
            <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} />
          </Field>

          <Field
            label="Words come from the order"
            hint="Only the four clauses that read differently on every order."
          >
            <NativeSelect value={variable} onChange={(e) => setVariable(e.target.value)}>
              <option value="">Fixed text — same on every order</option>
              {PO_VARIABLE_FIELDS.map((f) => (
                <option key={f} value={f}>
                  {poVariableFieldLabel(f)}
                </option>
              ))}
            </NativeSelect>
          </Field>
          {needsPlaceholder ? (
            <Warning>
              This clause takes its words from the order, so its text needs {"{{value}}"} where they
              go.
            </Warning>
          ) : null}

          <div className="flex flex-wrap gap-6 pt-1">
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
              />
              Pre-selected on a new order
            </label>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              Active
            </label>
          </div>
        </AppDialogBody>
        <AppDialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <SubmitButton
            type="button"
            onClick={submit}
            submitting={pending}
            busyLabel="Saving…"
            invalidReason={invalidReason}
          >
            {clause ? "Save" : "Add"}
          </SubmitButton>
        </AppDialogFooter>
      </AppDialog>
    </>
  );
}

/** Deleting a clause an order already prints is refused by the service. */
export function DeleteClauseButton({ clause }: { clause: PoClause }) {
  const [open, setOpen] = useState(false);
  const actor = useActor();
  const { run, pending } = useServiceAction();

  return (
    <>
      <Button variant="ghost" size="xs" onClick={() => setOpen(true)}>
        Delete
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Delete ${clause.title}?`}
        consequence={`It stops appearing on new purchase orders. An order that already prints it keeps its own copy of the words, and the delete is refused — deactivate the clause instead.`}
        confirmLabel="Delete"
        tone="destructive"
        submitting={pending}
        onConfirm={() =>
          run(() => deletePoClause(clause.id, actor), {
            success: `${clause.title} deleted`,
            onDone: () => setOpen(false),
          })
        }
      />
    </>
  );
}
