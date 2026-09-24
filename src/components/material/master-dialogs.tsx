"use client";

import { useEffect, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, NativeSelect } from "@/components/common";
import { useActor, useNewParam, useServiceAction } from "@/lib/hooks";
import {
  createMaterial,
  createSupplier,
  updateMaterial,
  updateSupplier,
} from "@/lib/services/master-service";
import {
  SUPPLIER_STATES,
  UNITS,
  type Material,
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
/* Material                                                            */
/* ------------------------------------------------------------------ */

const emptyMaterial = {
  code: "",
  name: "",
  category: "",
  unit: "nos" as Unit,
  hsn_code: "",
  gst_percent: "18",
  reorder_level: "0",
};

export function MaterialDialog({ material }: { material?: Material }) {
  // The create instance is also opened by the top bar's "+ New" menu.
  const [newRequested, setOpenFromNew] = useNewParam();
  const [open, setOpenState] = useState(false);
  const isNew = !material;
  const openState = open || (isNew && newRequested);
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
            name: material.name,
            category: material.category,
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
      name: form.name,
      category: form.category,
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
        <Button variant="ghost" size="xs" onClick={() => setOpen(true)}>
          <Pencil className="size-3" /> Edit
        </Button>
      ) : (
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="size-3.5" /> Add material
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
                placeholder="MAT-016"
              />
            </Field>
            <Field label="Name" required>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label="Category" required>
              <Input
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="Cement"
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
