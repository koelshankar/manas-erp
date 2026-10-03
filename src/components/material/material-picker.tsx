"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { cn } from "cn";
import { Field, NativeSelect } from "@/components/common";
import { Input } from "@/components/ui/input";
import { useAllRows } from "@/lib/hooks";
import { buildMaterialCatalog } from "@/lib/services/material-catalog";
import type { Material, MaterialName, MaterialType } from "@/lib/domain";

/**
 * Picking a material, the way their forms are laid out: **name, then type,
 * then sub-type**.
 *
 * Two ways in, because two people use it. A storeman who knows the master
 * walks the cascade — three selects, each one narrowing the next. Anyone who
 * already knows what they want types "CPVC" and takes the match, skipping the
 * cascade entirely; the search runs across all three levels plus the code,
 * brand and specification, so it finds a material by whichever part of its
 * name the reader happens to remember.
 *
 * Stacked, never side by side. Three selects in a row at 390px gives three
 * unreadable columns, and this is a component a site engineer uses outdoors.
 *
 * It reports only the leaf id upward. Every document still stores
 * `material_id` and nothing else, which is why this restructure did not reach
 * the indent, the PO or the stock ledger.
 */
export function MaterialPicker({
  value,
  onChange,
  /** Restrict to these leaves — a BOQ line's budgeted materials, say. */
  only,
  label = "Material",
  required,
  disabled,
  hint,
}: {
  value: string | null;
  onChange: (materialId: string) => void;
  only?: string[];
  label?: string;
  required?: boolean;
  disabled?: boolean;
  hint?: string;
}) {
  const names = useAllRows("material_names") as MaterialName[];
  const types = useAllRows("material_types") as MaterialType[];
  const allMaterials = useAllRows("materials") as Material[];
  const [term, setTerm] = useState("");

  const materials = useMemo(
    () =>
      allMaterials.filter(
        (m) => m.is_active && (only === undefined || only.includes(m.id)),
      ),
    [allMaterials, only],
  );

  const catalog = useMemo(
    () => buildMaterialCatalog(names, types, allMaterials),
    [names, types, allMaterials],
  );

  // The levels, derived from the materials actually on offer. A type with
  // nothing pickable under it must not appear: an empty third select is a
  // dead end the reader has to back out of.
  const { nameOptions, typeOptions, leafOptions, selected } = useMemo(() => {
    const selected = value ? allMaterials.find((m) => m.id === value) : undefined;
    const nameIds = new Set(materials.map((m) => m.material_name_id));
    const nameOptions = names
      .filter((n) => nameIds.has(n.id))
      .sort((a, b) => a.sequence - b.sequence);

    const activeNameId = selected?.material_name_id ?? "";
    const typeOptions = types
      .filter(
        (t) =>
          t.material_name_id === activeNameId &&
          materials.some((m) => m.material_type_id === t.id),
      )
      .sort((a, b) => a.sequence - b.sequence);

    const activeTypeId = selected?.material_type_id ?? "";
    const leafOptions = materials
      .filter((m) => m.material_type_id === activeTypeId)
      .sort((a, b) => (a.sub_type ?? "").localeCompare(b.sub_type ?? ""));

    return { nameOptions, typeOptions, leafOptions, selected };
  }, [names, types, materials, allMaterials, value]);

  const matches = useMemo(() => {
    const q = term.trim().toLowerCase();
    if (q.length < 2) return [];
    return materials.filter((m) => catalog.haystack(m).includes(q)).slice(0, 8);
  }, [term, materials, catalog]);

  /*
   * Moving a level up clears the levels below it, by selecting the first leaf
   * that fits. Leaving a stale sub-type under a newly chosen type would let
   * the three selects show a combination that does not exist.
   */
  function pickName(nameId: string) {
    const first = materials.find((m) => m.material_name_id === nameId);
    if (first) onChange(first.id);
  }

  function pickType(typeId: string) {
    const first = materials.find((m) => m.material_type_id === typeId);
    if (first) onChange(first.id);
  }

  const parts = catalog.parts(value);
  // A two-level material has nothing to choose at level three, and showing an
  // empty select under it suggests the record is unfinished.
  const hasSubTypes = leafOptions.some((m) => m.sub_type !== null);

  return (
    <div className="space-y-3">
      {/* Typeahead first: it is the shortcut, and burying it under the
          cascade means the people who would use it never find it. */}
      <Field label={label} required={required} hint={hint}>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            disabled={disabled}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search any material, or choose below"
            className="pl-8"
            aria-label={`Search ${label.toLowerCase()}`}
          />
          {term ? (
            <button
              type="button"
              onClick={() => setTerm("")}
              aria-label="Clear the search"
              className="absolute top-1/2 right-1 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>
      </Field>

      {matches.length > 0 ? (
        <ul className="divide-y divide-border/60 overflow-hidden rounded-lg ring-1 ring-border">
          {matches.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => {
                  onChange(m.id);
                  setTerm("");
                }}
                className="flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {catalog.label(m.id)}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    <span className="font-mono">{m.code}</span> · {m.unit}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : term.trim().length >= 2 ? (
        <p className="text-sm text-muted-foreground">
          No material matches “{term.trim()}”. Clear the search to browse the
          master.
        </p>
      ) : null}

      {/* The cascade. Stacked at every width — three selects side by side is
          three unreadable columns on a phone. */}
      <div className="grid gap-3">
        <Field label="Material name" required={required}>
          <NativeSelect
            value={selected?.material_name_id ?? ""}
            disabled={disabled}
            onChange={(e) => pickName(e.target.value)}
            aria-label="Material name"
          >
            <option value="">Select</option>
            {nameOptions.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </NativeSelect>
        </Field>

        <Field label="Material type" required={required}>
          <NativeSelect
            value={selected?.material_type_id ?? ""}
            disabled={disabled || typeOptions.length === 0}
            onChange={(e) => pickType(e.target.value)}
            aria-label="Material type"
          >
            <option value="">
              {selected ? "Select" : "Choose a material name first"}
            </option>
            {typeOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </NativeSelect>
        </Field>

        {hasSubTypes ? (
          <Field label="Sub-type">
            <NativeSelect
              value={value ?? ""}
              disabled={disabled || leafOptions.length === 0}
              onChange={(e) => onChange(e.target.value)}
              aria-label="Material sub-type"
            >
              {leafOptions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.sub_type ?? "—"}
                </option>
              ))}
            </NativeSelect>
          </Field>
        ) : null}
      </div>

      {selected ? (
        <p
          className={cn(
            "rounded-lg bg-muted/50 px-3 py-2 text-sm",
            "text-muted-foreground",
          )}
        >
          <span className="font-medium text-foreground">
            {parts.name} · {parts.type}
            {parts.sub_type ? ` · ${parts.sub_type}` : ""}
          </span>
          <span className="mt-0.5 block">
            <span className="font-mono text-xs">{selected.code}</span> ·{" "}
            {selected.unit}
            {selected.specification ? ` · ${selected.specification}` : ""}
          </span>
        </p>
      ) : null}
    </div>
  );
}
