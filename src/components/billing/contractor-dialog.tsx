"use client";

import { useEffect, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, NativeSelect } from "@/components/common";
import { useActor, useNewParam, useServiceAction } from "@/lib/hooks";
import {
  createContractor,
  updateContractor,
} from "@/lib/services/master-service";
import {
  CONTRACTOR_TYPES,
  TDS_PERCENT,
  TRADES,
  type Contractor,
  type ContractorType,
  type Trade,
} from "@/lib/domain";
import { formatPercent } from "@/lib/format";
import {
  AppDialog,
  AppDialogBody,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from "@/components/ui-app";
import { contractorTypeLabel, tradeLabel } from "@/config/labels";

const empty = {
  code: "",
  name: "",
  trade: "rcc" as Trade,
  type: "firm" as ContractorType,
  contact_person: "",
  phone: "",
  pan: "",
  gstin: "",
  address: "",
  default_retention_percent: "5",
};

/** Contractor master — owned by Project & Budget, because the rates start here. */
export function ContractorDialog({ contractor }: { contractor?: Contractor }) {
  // The create instance is also opened by the top bar's "+ New" menu.
  const [newRequested, setOpenFromNew] = useNewParam();
  const [open, setOpenState] = useState(false);
  const isNew = !contractor;
  const openState = open || (isNew && newRequested);
  const setOpen = (v: boolean) => {
    setOpenState(v);
    if (!v) setOpenFromNew(false);
  };
  const [form, setForm] = useState(empty);
  const actor = useActor();
  const { run, pending } = useServiceAction();

  useEffect(() => {
    if (!openState) return;
    setForm(
      contractor
        ? {
            code: contractor.code,
            name: contractor.name,
            trade: contractor.trade,
            type: contractor.type,
            contact_person: contractor.contact_person,
            phone: contractor.phone,
            pan: contractor.pan,
            gstin: contractor.gstin,
            address: contractor.address,
            default_retention_percent: String(
              contractor.default_retention_percent,
            ),
          }
        : empty,
    );
  }, [openState, contractor]);

  async function submit() {
    const payload = {
      ...form,
      default_retention_percent: Number(form.default_retention_percent),
      is_active: contractor?.is_active ?? true,
    };
    await run(
      () =>
        contractor
          ? updateContractor(contractor.id, payload, actor)
          : createContractor(payload, actor),
      {
        success: contractor ? "Contractor updated" : "Contractor added",
        view: "/masters/contractors",
        onDone: () => setOpen(false),
      },
    );
  }

  return (
    <>
      {contractor ? (
        <Button variant="ghost" size="xs" onClick={() => setOpen(true)}>
          <Pencil className="size-3" /> Edit
        </Button>
      ) : (
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="size-3.5" /> Add contractor
        </Button>
      )}

      <AppDialog open={openState} onOpenChange={setOpen} size="md">
        <AppDialogHeader>
          <AppDialogTitle>
            {contractor ? "Edit contractor" : "Add a contractor"}
          </AppDialogTitle>
          <AppDialogDescription>
            The constitution decides the TDS rate on every RA bill; retention is
            the default carried onto new work orders.
          </AppDialogDescription>
        </AppDialogHeader>
        <AppDialogBody>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Code" required>
              <Input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="CON-009"
              />
            </Field>
            <Field label="Name" required>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label="Trade" required>
              <NativeSelect
                value={form.trade}
                onChange={(e) =>
                  setForm({ ...form, trade: e.target.value as Trade })
                }
              >
                {TRADES.map((t) => (
                  <option key={t} value={t}>
                    {tradeLabel(t)}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field
              label="Constitution"
              required
              hint={`TDS ${formatPercent(TDS_PERCENT[form.type])} under s.194C`}
            >
              <NativeSelect
                value={form.type}
                onChange={(e) =>
                  setForm({ ...form, type: e.target.value as ContractorType })
                }
              >
                {CONTRACTOR_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {contractorTypeLabel(t)}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="PAN" required hint="10 characters.">
              <Input
                value={form.pan}
                onChange={(e) =>
                  setForm({ ...form, pan: e.target.value.toUpperCase() })
                }
                maxLength={10}
              />
            </Field>
            <Field label="GSTIN" hint="Leave blank if unregistered.">
              <Input
                value={form.gstin}
                onChange={(e) =>
                  setForm({ ...form, gstin: e.target.value.toUpperCase() })
                }
                maxLength={15}
              />
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
            <Field label="Address" className="sm:col-span-2">
              <Input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </Field>
            <Field label="Default retention %" required>
              <Input
                type="number"
                step="any"
                min={0}
                max={100}
                value={form.default_retention_percent}
                onChange={(e) =>
                  setForm({
                    ...form,
                    default_retention_percent: e.target.value,
                  })
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
