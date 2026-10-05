"use client";

import { useEffect, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, NativeSelect } from "@/components/common";
import { useActor, useNewParam, useServiceAction } from "@/lib/hooks";
import {
  createMaterial,
  createMaterialName,
  createMaterialType,
  createSupplier,
  updateMaterial,
  updateMaterialName,
  updateMaterialType,
  updateSupplier,
} from "@/lib/services/master-service";
import {
  SUPPLIER_STATES,
  UNITS,
  type Material,
  type MaterialName,
  type MaterialType,
  type Supplier,
  type SupplierState,
  type Unit,
} from "@/lib/domain";
import {
  AppDialog,
  AppDialogBody,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from "@/components/ui-app";

/* ------------------------------------------------------------------ */
/* The material master: three levels, three dialogs                    */
/* ------------------------------------------------------------------ */

/**
 * Add and edit at each level of name -> type -> sub-type.
 *
 * Three dialogs rather than one form with three sections, because the three
 * levels are edited at different moments: a name is added once a year, a type
 * when a new product class arrives, a leaf whenever the store carries a
 * different size. Each one is the smallest form that does its job.
 */

export function MaterialNameDialog({ name }: { name?: MaterialName }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const actor = useActor();
  const { run, pending } = useServiceAction();

  useEffect(() => {
    if (open) setValue(name?.name ?? "");
  }, [open, name]);

  async function submit() {
    const payload = { name: value, sequence: name?.sequence ?? 0 };
    await run(
      () => (name ? updateMaterialName(name.id, payload, actor) : createMaterialName(payload, actor)),
      {
        success: name ? "Material name updated" : "Material name added",
        view: "/masters/materials",
        onDone: () => setOpen(false),
      },
    );
  }

  return (
    <>
      {name ? (
        <Button variant="ghost" size="xs" onClick={() => setOpen(true)} aria-label={`Edit ${name.name}`}>
          <Pencil className="size-3" /> Edit
        </Button>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <Plus className="size-3.5" /> Material name
        </Button>
      )}
      <AppDialog open={open} onOpenChange={setOpen} size="sm">
        <AppDialogHeader>
          <AppDialogTitle>{name ? "Edit material name" : "Add a material name"}</AppDialogTitle>
          <AppDialogDescription>
            The top level of the master — Cement, Steel, Aggregate.
          </AppDialogDescription>
        </AppDialogHeader>
        <AppDialogBody>
          <Field label="Name" required>
            <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Cement" />
          </Field>
        </AppDialogBody>
        <AppDialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={pending || value.trim().length < 2}>
            {name ? "Save" : "Add"}
          </Button>
        </AppDialogFooter>
      </AppDialog>
    </>
  );
}

export function MaterialTypeDialog({
  materialNameId,
  type,
}: {
  materialNameId: string;
  type?: MaterialType;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const actor = useActor();
  const { run, pending } = useServiceAction();

  useEffect(() => {
    if (open) setValue(type?.name ?? "");
  }, [open, type]);

  async function submit() {
    const payload = {
      material_name_id: type?.material_name_id ?? materialNameId,
      name: value,
      sequence: type?.sequence ?? 0,
    };
    await run(
      () => (type ? updateMaterialType(type.id, payload, actor) : createMaterialType(payload, actor)),
      {
        success: type ? "Material type updated" : "Material type added",
        view: "/masters/materials",
        onDone: () => setOpen(false),
      },
    );
  }

  return (
    <>
      {type ? (
        <Button variant="ghost" size="xs" onClick={() => setOpen(true)} aria-label={`Edit ${type.name}`}>
          <Pencil className="size-3" /> Edit
        </Button>
      ) : (
        <Button variant="ghost" size="xs" onClick={() => setOpen(true)}>
          <Plus className="size-3" /> Type
        </Button>
      )}
      <AppDialog open={open} onOpenChange={setOpen} size="sm">
        <AppDialogHeader>
          <AppDialogTitle>{type ? "Edit material type" : "Add a material type"}</AppDialogTitle>
          <AppDialogDescription>
            The second level — OPC under Cement, TMT Bar under Steel.
          </AppDialogDescription>
        </AppDialogHeader>
        <AppDialogBody>
          <Field label="Type" required>
            <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="OPC" />
          </Field>
        </AppDialogBody>
        <AppDialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={pending || value.trim().length < 1}>
            {type ? "Save" : "Add"}
          </Button>
        </AppDialogFooter>
      </AppDialog>
    </>
  );
}

const emptyMaterial = {
  code: "",
  sub_type: "",
  specification: "",
  brand: "",
  unit: "nos" as Unit,
  hsn_code: "",
  gst_percent: "18",
  reorder_level: "0",
};

/**
 * The leaf. Its two parents are fixed by where it was added from, so the form
 * asks for what distinguishes one leaf from its siblings and nothing else.
 *
 * Sub-type may be left blank: that is how a two-level material is created,
 * and the hint says so rather than leaving the reader to guess whether the
 * field is required.
 */
export function MaterialDialog({
  materialNameId,
  materialTypeId,
  material,
}: {
  materialNameId?: string;
  materialTypeId?: string;
  material?: Material;
}) {
  // The create instance is also opened by the top bar's "+ New" menu.
  const [newRequested, setOpenFromNew] = useNewParam();
  const [open, setOpenState] = useState(false);
  const isNew = !material;
  // "+ New" has no parent in hand, so it can only open an edit-less form when
  // the page gives it one; the master screen always does.
  const openState = open || (isNew && newRequested && Boolean(materialTypeId));
  const setOpen = (v: boolean) => {
    setOpenState(v);
    if (!v) setOpenFromNew(false);
  };
  const [form, setForm] = useState(emptyMaterial);
  const actor = useActor();
  const { run, pending } = useServiceAction();

  useEffect(() => {
    if (!openState) return;
    setForm(
      material
        ? {
            code: material.code,
            sub_type: material.sub_type ?? "",
            specification: material.specification,
            brand: material.brand,
            unit: material.unit,
            hsn_code: material.hsn_code,
            gst_percent: String(material.gst_percent),
            reorder_level: String(material.reorder_level),
          }
        : emptyMaterial,
    );
  }, [openState, material]);

  async function submit() {
    const payload = {
      code: form.code,
      material_name_id: material?.material_name_id ?? materialNameId ?? "",
      material_type_id: material?.material_type_id ?? materialTypeId ?? "",
      // Blank means a two-level material; the service stores it as null.
      sub_type: form.sub_type,
      specification: form.specification,
      brand: form.brand,
      unit: form.unit,
      hsn_code: form.hsn_code,
      gst_percent: Number(form.gst_percent),
      reorder_level: Number(form.reorder_level),
      is_active: material?.is_active ?? true,
    };
    await run(
      () =>
        material
          ? updateMaterial(material.id, payload, actor)
          : createMaterial(payload, actor),
      {
        success: material ? "Material updated" : "Material added",
        view: "/masters/materials",
        onDone: () => setOpen(false),
      },
    );
  }

  return (
    <>
      {material ? (
        <Button variant="ghost" size="xs" onClick={() => setOpen(true)} aria-label={`Edit ${material.code}`}>
          <Pencil className="size-3" /> Edit
        </Button>
      ) : (
        <Button variant="ghost" size="xs" onClick={() => setOpen(true)}>
          <Plus className="size-3" /> Sub-type
        </Button>
      )}

      <AppDialog open={openState} onOpenChange={setOpen} size="md">
        <AppDialogHeader>
          <AppDialogTitle>
            {material ? "Edit material" : "Add a material"}
          </AppDialogTitle>
          <AppDialogDescription>
            Unit, HSN and GST flow onto every quote, PO line and vendor bill
            line.
          </AppDialogDescription>
        </AppDialogHeader>
        <AppDialogBody>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Code" required>
              <Input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="MAT-032"
              />
            </Field>
            <Field
              label="Sub-type"
              hint="Leave blank if this material has only two levels."
            >
              <Input
                value={form.sub_type}
                onChange={(e) => setForm({ ...form, sub_type: e.target.value })}
                placeholder="53 Grade"
              />
            </Field>
            <Field label="Unit" required>
              <NativeSelect
                value={form.unit}
                onChange={(e) =>
                  setForm({ ...form, unit: e.target.value as Unit })
                }
              >
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Brand or make" hint="Blank where any make will do.">
              <Input
                value={form.brand}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field
                label="Specification"
                hint="Printed in the material column of a purchase order."
              >
                <Input
                  value={form.specification}
                  onChange={(e) =>
                    setForm({ ...form, specification: e.target.value })
                  }
                  placeholder="IS 269:2015, 53 grade, 50 kg bags"
                />
              </Field>
            </div>
            <Field label="HSN code" required>

              <Input
                value={form.hsn_code}
                onChange={(e) => setForm({ ...form, hsn_code: e.target.value })}
              />
            </Field>
            <Field label="GST %" required>
              <Input
                type="number"
                step="any"
                value={form.gst_percent}
                onChange={(e) =>
                  setForm({ ...form, gst_percent: e.target.value })
                }
              />
            </Field>
            <Field
              label="Reorder level"
              hint="Below this, site stock shows a low-stock warning."
            >
              <Input
                type="number"
                step="any"
                value={form.reorder_level}
                onChange={(e) =>
                  setForm({ ...form, reorder_level: e.target.value })
                }
              />
            </Field>
          </div>
        </AppDialogBody>

        <AppDialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </AppDialogFooter>
      </AppDialog>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Supplier                                                            */
/* ------------------------------------------------------------------ */

const emptySupplier = {
  code: "",
  name: "",
  contact_person: "",
  phone: "",
  email: "",
  pan: "",
  gstin: "",
  address: "",
  city: "",
  state: "Goa" as SupplierState,
  payment_terms_days: "30",
};

export function SupplierDialog({ supplier }: { supplier?: Supplier }) {
  // The create instance is also opened by the top bar's "+ New" menu.
  const [newRequested, setOpenFromNew] = useNewParam();
  const [open, setOpenState] = useState(false);
  const isNew = !supplier;
  const openState = open || (isNew && newRequested);
  const setOpen = (v: boolean) => {
    setOpenState(v);
    if (!v) setOpenFromNew(false);
  };
  const [form, setForm] = useState(emptySupplier);
  const actor = useActor();
  const { run, pending } = useServiceAction();

  useEffect(() => {
    if (!openState) return;
    setForm(
      supplier
        ? {
            code: supplier.code,
            name: supplier.name,
            contact_person: supplier.contact_person,
            phone: supplier.phone,
            email: supplier.email,
            pan: supplier.pan,
            gstin: supplier.gstin,
            address: supplier.address,
            city: supplier.city,
            state: supplier.state,
            payment_terms_days: String(supplier.payment_terms_days),
          }
        : emptySupplier,
    );
  }, [openState, supplier]);

  async function submit() {
    const payload = {
      code: form.code,
      name: form.name,
      contact_person: form.contact_person,
      phone: form.phone,
      email: form.email,
      pan: form.pan,
      gstin: form.gstin,
      address: form.address,
      city: form.city,
      state: form.state,
      payment_terms_days: Number(form.payment_terms_days),
      is_active: supplier?.is_active ?? true,
    };
    await run(
      () =>
        supplier
          ? updateSupplier(supplier.id, payload, actor)
          : createSupplier(payload, actor),
      {
        success: supplier ? "Supplier updated" : "Supplier added",
        view: "/masters/suppliers",
        onDone: () => setOpen(false),
      },
    );
  }

  return (
    <>
      {supplier ? (
        <Button variant="ghost" size="xs" onClick={() => setOpen(true)}>
          <Pencil className="size-3" /> Edit
        </Button>
      ) : (
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="size-3.5" /> Add supplier
        </Button>
      )}

      <AppDialog open={openState} onOpenChange={setOpen} size="md">
        <AppDialogHeader>
          <AppDialogTitle>
            {supplier ? "Edit supplier" : "Add a supplier"}
          </AppDialogTitle>
          <AppDialogDescription>
            The state decides the tax on every PO: CGST + SGST inside Goa, IGST
            outside it.
          </AppDialogDescription>
        </AppDialogHeader>
        <AppDialogBody>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Code" required>
              <Input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="SUP-007"
              />
            </Field>
            <Field label="Name" required>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label="GSTIN" required hint="15 characters.">
              <Input
                value={form.gstin}
                onChange={(e) =>
                  setForm({ ...form, gstin: e.target.value.toUpperCase() })
                }
                maxLength={15}
              />
            </Field>
            <Field label="PAN" hint="Printed on the purchase order.">
              <Input
                value={form.pan}
                onChange={(e) => setForm({ ...form, pan: e.target.value.toUpperCase() })}
                maxLength={10}
              />
            </Field>
            <Field label="State" required>
              <NativeSelect
                value={form.state}
                onChange={(e) =>
                  setForm({ ...form, state: e.target.value as SupplierState })
                }
              >
                {SUPPLIER_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Contact person">
              <Input
                value={form.contact_person}
                onChange={(e) =>
                  setForm({ ...form, contact_person: e.target.value })
                }
              />
            </Field>
            <Field label="Phone">
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </Field>
            <Field label="Email">
              <Input
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </Field>
            <Field label="City">
              <Input
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
              />
            </Field>
            <Field label="Address" className="sm:col-span-2">
              <Input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </Field>
            <Field label="Credit period (days)">
              <Input
                type="number"
                value={form.payment_terms_days}
                onChange={(e) =>
                  setForm({ ...form, payment_terms_days: e.target.value })
                }
              />
            </Field>
          </div>
        </AppDialogBody>

        <AppDialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </AppDialogFooter>
      </AppDialog>
    </>
  );
}
