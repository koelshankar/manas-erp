"use client";

import { useMemo } from "react";
import { Field, NativeSelect } from "@/components/common";
import { useAllRows } from "@/lib/hooks";
import type { Store } from "@/lib/domain";

/**
 * Which store a stores document belongs to.
 *
 * It is a plain select rather than a typeahead because a project has one store
 * or two, never a hundred — and on a single-store project the picker renders
 * the one option with a hint saying so rather than pretending there is a
 * choice.
 */
export function StorePicker({
  value,
  onChange,
  projectId,
  label = "Store",
  hint,
  required = true,
  /** Leave these out of the list — the far end of a transfer, say. */
  exclude = [],
  /** Show stores on every project, not only this one. For a transfer's far end. */
  allProjects = false,
  disabled,
}: {
  value: string;
  onChange: (storeId: string) => void;
  projectId: string;
  label?: string;
  hint?: string;
  required?: boolean;
  exclude?: string[];
  allProjects?: boolean;
  disabled?: boolean;
}) {
  const stores = useAllRows("stores") as Store[];
  const projects = useAllRows("projects");

  const options = useMemo(
    () =>
      stores
        .filter((s) => s.is_active)
        .filter((s) => (allProjects ? true : s.project_id === projectId))
        .filter((s) => !exclude.includes(s.id))
        .sort(
          (a, b) =>
            Number(b.is_primary) - Number(a.is_primary) || a.name.localeCompare(b.name),
        ),
    // `exclude` is a fresh array on most renders, so it is compared by content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stores, projectId, allProjects, exclude.join(",")],
  );

  const projectName = (id: string) =>
    projects.find((p) => p.id === id)?.name ?? "";

  return (
    <Field
      label={label}
      required={required}
      hint={
        hint ??
        (options.length === 1
          ? `${options[0].name} is the only open store on this site.`
          : undefined)
      }
    >
      <NativeSelect
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || options.length === 0}
      >
        <option value="">
          {options.length === 0 ? "No open store" : "Select a store"}
        </option>
        {options.map((s) => (
          <option key={s.id} value={s.id}>
            {allProjects ? `${projectName(s.project_id)} — ${s.name}` : s.name}
            {s.is_primary && !allProjects ? " (main)" : ""}
          </option>
        ))}
      </NativeSelect>
    </Field>
  );
}

/** The store a document defaults to: the project's primary one. */
export function usePrimaryStoreId(projectId: string): string {
  const stores = useAllRows("stores") as Store[];
  return useMemo(() => {
    const mine = stores.filter((s) => s.project_id === projectId && s.is_active);
    return (mine.find((s) => s.is_primary) ?? mine[0])?.id ?? "";
  }, [stores, projectId]);
}
