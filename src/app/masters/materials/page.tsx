"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Package, Trash2 } from "lucide-react";
import { cn } from "cn";
import { PageHeader, HydrationGate, EmptyState, Qty } from "@/components/common";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui-app";
import {
  MaterialDialog,
  MaterialNameDialog,
  MaterialTypeDialog,
} from "@/components/material/master-dialogs";
import { useAccess, useActor, useAllRows, useServiceAction } from "@/lib/hooks";
import { buildMaterialCatalog } from "@/lib/services/material-catalog";
import {
  deleteMaterial,
  deleteMaterialName,
  deleteMaterialType,
} from "@/lib/services/master-service";
import type { Material, MaterialName, MaterialType } from "@/lib/domain";

/** Expand state is per-viewer convenience, not domain data — session only. */
const SESSION_KEY = "manas:materials-tree-open";

/**
 * The material master, as the three levels their forms are built on.
 *
 * A flat table of thirty rows hides the shape, and the shape is the point —
 * someone reading this screen is checking whether the master matches the
 * paperwork on their desk. So it is a tree: name, type under it, sub-type
 * under that, each level collapsible and each level editable where it sits.
 *
 * Deleting a parent that still has children is refused, with a message that
 * says how many and what to do about it. The alternative is an orphaned leaf
 * whose label renders half-blank on every document that referenced it.
 */
export default function MaterialsPage() {
  const access = useAccess("materials");
  const names = useAllRows("material_names") as MaterialName[];
  const types = useAllRows("material_types") as MaterialType[];
  const materials = useAllRows("materials") as Material[];
  const rates = useAllRows("supplier_rates");
  const [term, setTerm] = useState("");
  // Tracked as "open" ids rather than "collapsed" ids: starting both sets
  // empty is what gives every level its collapsed-by-default state without
  // having to pre-populate them from data that may not be hydrated yet.
  const [openNames, setOpenNames] = useState<Set<string>>(() => new Set());
  const [openTypes, setOpenTypes] = useState<Set<string>>(() => new Set());
  const [hydratedFromSession, setHydratedFromSession] = useState(false);

  // Hydrated after mount, never during SSR — sessionStorage has no server
  // value to agree with, so reading it during render would mismatch.
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(SESSION_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { names?: string[]; types?: string[] };
        if (Array.isArray(parsed.names)) setOpenNames(new Set(parsed.names));
        if (Array.isArray(parsed.types)) setOpenTypes(new Set(parsed.types));
      }
    } catch {
      // Private window, blocked storage, or a malformed snapshot — the tree
      // just starts fully collapsed, which is the correct default anyway.
    }
    setHydratedFromSession(true);
  }, []);

  useEffect(() => {
    if (!hydratedFromSession) return;
    try {
      window.sessionStorage.setItem(
        SESSION_KEY,
        JSON.stringify({ names: [...openNames], types: [...openTypes] }),
      );
    } catch {
      // Per-viewer convenience only — nothing downstream depends on this
      // write succeeding.
    }
  }, [openNames, openTypes, hydratedFromSession]);

  const catalog = useMemo(
    () => buildMaterialCatalog(names, types, materials),
    [names, types, materials],
  );

  // Searching flattens the tree: when you are looking for one material you do
  // not want to be told which branch it is on, you want it on screen.
  const q = term.trim().toLowerCase();
  const matching = useMemo(
    () => (q.length < 2 ? null : materials.filter((m) => catalog.haystack(m).includes(q))),
    [q, materials, catalog],
  );

  const tree = useMemo(
    () =>
      [...names]
        .sort((a, b) => a.sequence - b.sequence)
        .map((name) => ({
          name,
          types: [...types]
            .filter((t) => t.material_name_id === name.id)
            .sort((a, b) => a.sequence - b.sequence)
            .map((type) => ({
              type,
              leaves: materials
                .filter((m) => m.material_type_id === type.id)
                .sort((a, b) => (a.sub_type ?? "").localeCompare(b.sub_type ?? "")),
            })),
        })),
    [names, types, materials],
  );

  const toggleName = (id: string) =>
    setOpenNames((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleType = (id: string) =>
    setOpenTypes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const openAll = () => {
    setOpenNames(new Set(names.map((n) => n.id)));
    setOpenTypes(new Set(types.map((t) => t.id)));
  };
  const closeAll = () => {
    setOpenNames(new Set());
    setOpenTypes(new Set());
  };

  const supplierCount = (materialId: string) =>
    rates.filter((x) => x.material_id === materialId).length;

  return (
    <div>
      <PageHeader
        resource="materials"
        title={access.meta.label}
        description="Material name, type and sub-type — the three columns every indent, GRN, material issue and gate pass is filled in against."
        team={access.ownerTeam}
        outsideNav={access.outsideNav}
        owned={access.owned}
        breadcrumb={[{ label: "Masters", href: "/masters" }, { label: "Materials" }]}
        actions={
          <span className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={openAll}>
              Open all
            </Button>
            <Button variant="outline" size="sm" onClick={closeAll}>
              Close all
            </Button>
            {access.canCreate ? <MaterialNameDialog /> : null}
          </span>
        }
      />

      <div className="mb-4 max-w-sm">
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search any level, code or specification"
          aria-label="Search the material master"
        />
      </div>

      <HydrationGate rows={4}>
        {matching ? (
          matching.length === 0 ? (
            <EmptyState
              icon={Package}
              message={`No material matches “${term.trim()}”. Clear the search to browse the master.`}
            />
          ) : (
            <Card className="divide-y divide-border/60 px-0 py-0">
              {matching.map((m) => (
                <LeafRow
                  key={m.id}
                  material={m}
                  label={catalog.label(m.id)}
                  suppliers={supplierCount(m.id)}
                  canEdit={access.canEdit}
                  canDelete={access.canDelete}
                />
              ))}
            </Card>
          )
        ) : tree.length === 0 ? (
          <EmptyState
            icon={Package}
            message="No materials yet. Add a material name, such as Cement or Steel, then add its types and sub-types under it."
          />
        ) : (
          <div className="space-y-3">
            {tree.map(({ name, types: typeRows }) => {
              const leafCount = typeRows.reduce((n, t) => n + t.leaves.length, 0);
              const isOpen = openNames.has(name.id);
              return (
                <Card key={name.id} className="px-0 py-0">
                  {/* Level 1 */}
                  <div className="flex min-h-14 items-center gap-2 px-3 py-2">
                    <button
                      type="button"
                      onClick={() => toggleName(name.id)}
                      aria-expanded={isOpen}
                      aria-label={`${isOpen ? "Collapse" : "Expand"} ${name.name}`}
                      className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                    >
                      <ChevronRight
                        className={cn("size-4 transition-transform", isOpen && "rotate-90")}
                      />
                    </button>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base font-semibold tracking-tight">
                        {name.name}
                      </span>
                      <span className="block text-sm text-muted-foreground">
                        {typeRows.length} type{typeRows.length === 1 ? "" : "s"} ·{" "}
                        {leafCount} material{leafCount === 1 ? "" : "s"}
                      </span>
                    </span>
                    {access.canEdit ? (
                      <span className="flex shrink-0 items-center gap-1">
                        <MaterialTypeDialog materialNameId={name.id} />
                        <MaterialNameDialog name={name} />
                        {access.canDelete ? (
                          <DeleteButton
                            label={`Delete ${name.name}`}
                            title="Delete this material name?"
                            consequence={`${name.name} and everything filed under it would leave the master. It has ${typeRows.length} type${typeRows.length === 1 ? "" : "s"} under it, so this will be refused until those are removed.`}
                            onConfirm={(actor) => deleteMaterialName(name.id, actor)}
                            success={`${name.name} removed`}
                          />
                        ) : null}
                      </span>
                    ) : null}
                  </div>

                  {/* Level 2 and 3 */}
                  {isOpen ? (
                    <div className="border-t border-border/60">
                      {typeRows.length === 0 ? (
                        <p className="px-4 py-4 text-sm text-muted-foreground">
                          No types yet. Add one and its sub-types hang under it.
                        </p>
                      ) : (
                        typeRows.map(({ type, leaves }) => {
                          const typeOpen = openTypes.has(type.id);
                          return (
                          <div key={type.id} className="border-b border-border/40 last:border-0">
                            <div className="flex min-h-12 items-center gap-2 bg-muted/30 px-3 py-2 pl-6">
                              <button
                                type="button"
                                onClick={() => toggleType(type.id)}
                                aria-expanded={typeOpen}
                                aria-label={`${typeOpen ? "Collapse" : "Expand"} ${type.name}`}
                                className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                              >
                                <ChevronRight
                                  className={cn("size-3.5 transition-transform", typeOpen && "rotate-90")}
                                />
                              </button>
                              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                                {type.name}
                              </span>
                              <span className="shrink-0 text-sm text-muted-foreground">
                                {leaves.length}
                              </span>
                              {access.canEdit ? (
                                <span className="flex shrink-0 items-center gap-1">
                                  <MaterialDialog
                                    materialNameId={name.id}
                                    materialTypeId={type.id}
                                  />
                                  <MaterialTypeDialog
                                    materialNameId={name.id}
                                    type={type}
                                  />
                                  {access.canDelete ? (
                                    <DeleteButton
                                      label={`Delete ${type.name}`}
                                      title="Delete this material type?"
                                      consequence={`${type.name} has ${leaves.length} material${leaves.length === 1 ? "" : "s"} under it. Deleting a type with materials under it is refused — remove those first.`}
                                      onConfirm={(actor) => deleteMaterialType(type.id, actor)}
                                      success={`${type.name} removed`}
                                    />
                                  ) : null}
                                </span>
                              ) : null}
                            </div>
                            {typeOpen
                              ? leaves.map((m) => (
                                  <LeafRow
                                    key={m.id}
                                    material={m}
                                    // Inside the tree the two levels above are
                                    // already on screen, so the leaf shows only
                                    // what distinguishes it from its siblings.
                                    label={m.sub_type}
                                    indent
                                    suppliers={supplierCount(m.id)}
                                    canEdit={access.canEdit}
                                    canDelete={access.canDelete}
                                  />
                                ))
                              : null}
                          </div>
                          );
                        })
                      )}
                    </div>
                  ) : null}
                </Card>
              );
            })}
          </div>
        )}
      </HydrationGate>
    </div>
  );
}

/**
 * A leaf. `label` differs by context: inside the tree it is just the sub-type,
 * because the two levels above are already on screen; in a search result it
 * is the full three-part label, because there is no tree to read it from.
 */
function LeafRow({
  material,
  label,
  indent,
  suppliers,
  canEdit,
  canDelete,
}: {
  material: Material;
  /** Null on a two-level material, which has nothing at this level to show. */
  label: string | null;
  indent?: boolean;
  suppliers: number;
  canEdit: boolean;
  canDelete: boolean;
}) {
  return (
    /*
     * Stacked on a phone, in a row from `sm`. Reorder level and supplier
     * count beside a truncating label left about eight characters for the
     * material, which is the one thing the row is for.
     */
    <div
      className={cn(
        "flex min-h-12 flex-col gap-1 px-3 py-2 sm:flex-row sm:items-center sm:gap-3",
        indent && "pl-6 sm:pl-16",
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">
          {label ?? (
            // A two-level material *is* its type. Saying so is clearer than a
            // dash, which reads like data someone forgot to fill in.
            <span className="text-muted-foreground">No sub-type</span>
          )}
          {material.brand ? (
            <span className="ml-2 text-muted-foreground">{material.brand}</span>
          ) : null}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          <span className="font-mono">{material.code}</span> · HSN{" "}
          <span className="font-mono">{material.hsn_code}</span> ·{" "}
          {material.gst_percent}% GST
          {material.specification ? ` · ${material.specification}` : ""}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground sm:text-sm">
        <span>
          <Qty value={material.reorder_level} unit={material.unit} /> reorder
        </span>
        <span>
          {suppliers} supplier{suppliers === 1 ? "" : "s"}
        </span>
        {canEdit ? (
          <span className="ml-auto flex items-center gap-1 sm:ml-0">
            <MaterialDialog material={material} />
            {canDelete ? (
              <DeleteButton
                label={`Delete ${material.code}`}
                title="Delete this material?"
                consequence={`${material.code} would leave the master. If it is already on an indent, a purchase order or the stock ledger this is refused — mark it inactive instead.`}
                onConfirm={(actor) => deleteMaterial(material.id, actor)}
                success={`${material.code} removed`}
              />
            ) : null}
          </span>
        ) : null}
      </span>
    </div>
  );
}

/** Delete, with the consequence stated before it happens. */
function DeleteButton({
  label,
  title,
  consequence,
  onConfirm,
  success,
}: {
  label: string;
  title: string;
  consequence: string;
  onConfirm: (actor: ReturnType<typeof useActor>) => Promise<unknown>;
  success: string;
}) {
  const [open, setOpen] = useState(false);
  const actor = useActor();
  const { run, pending } = useServiceAction();

  return (
    <>
      <Button
        variant="ghost"
        size="xs"
        aria-label={label}
        onClick={() => setOpen(true)}
      >
        <Trash2 className="size-3" />
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={title}
        consequence={consequence}
        confirmLabel="Delete"
        tone="destructive"
        submitting={pending}
        onConfirm={() =>
          run(() => onConfirm(actor), { success, onDone: () => setOpen(false) })
        }
      />
    </>
  );
}
