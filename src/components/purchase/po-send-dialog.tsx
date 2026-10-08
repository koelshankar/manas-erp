"use client";

import { useState } from "react";
import { FileText, Info, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/common";
import { useActor, useServiceAction } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import { issuePurchaseOrder } from "@/lib/services/po-service";
import { buildPoSendDefaults } from "@/lib/services/po-send";
import { buildPoPdf, type PoPdfInput } from "@/lib/files/po-pdf";
import type { PurchaseOrder } from "@/lib/domain";
import {
  AppDialog,
  AppDialogBody,
  AppDialogFooter,
  AppDialogHeader,
  SubmitButton,
} from "@/components/ui-app";

/**
 * Issuing an order looks like sending it: who from, who to, the covering note,
 * and the PDF that goes with it.
 *
 * **Nothing is sent.** There is no mail service behind this. Confirming marks
 * the order issued and keeps what was written on the order (`send_record`,
 * flagged `simulated`), which the order sheet shows afterwards. The dialog says
 * so, because a demo that quietly pretends to send mail is worse than one that
 * admits it.
 */
export function PoSendDialog({
  po,
  pdf,
  open,
  onOpenChange,
  onDone,
}: {
  po: PurchaseOrder;
  pdf: PoPdfInput;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone?: () => void;
}) {
  return (
    <AppDialog open={open} onOpenChange={onOpenChange} size="lg">
      {open ? <SendForm po={po} pdf={pdf} onClose={() => onOpenChange(false)} onDone={onDone} /> : null}
    </AppDialog>
  );
}

function SendForm({
  po,
  pdf,
  onClose,
  onDone,
}: {
  po: PurchaseOrder;
  pdf: PoPdfInput;
  onClose: () => void;
  onDone?: () => void;
}) {
  const { user } = useSession();
  const actor = useActor();
  const { run, pending } = useServiceAction();
  const defaults = buildPoSendDefaults({
    po_number: po.po_number,
    amend_no: po.amend_no,
    expected_delivery_date: po.expected_delivery_date,
    project_name: pdf.project?.name ?? "",
    supplier_name: pdf.supplier?.name ?? "Supplier",
    contact_person: pdf.supplier?.contact_person ?? "",
    supplier_email: pdf.supplier?.email ?? "",
    sender_name: user?.full_name ?? "",
    sender_email: user?.email ?? "",
  });
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [cc, setCc] = useState(defaults.cc);
  const [bcc, setBcc] = useState(defaults.bcc);
  const [subject, setSubject] = useState(defaults.subject);
  const [body, setBody] = useState(defaults.body);
  const [previewing, setPreviewing] = useState(false);

  async function preview() {
    setPreviewing(true);
    try {
      const { blob } = await buildPoPdf(pdf);
      window.open(URL.createObjectURL(blob), "_blank", "noopener");
    } catch (error) {
      toast.error("The PDF could not be built", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setPreviewing(false);
    }
  }

  const missing = !to.trim()
    ? "Say who the order is going to."
    : !from.trim()
      ? "Say who it is from."
      : !subject.trim()
        ? "Give the email a subject."
        : undefined;

  return (
    <>
      <AppDialogHeader
        title={`Send ${po.po_number} to the supplier`}
        context="Review the email below. Sending issues the order, so nothing can be edited afterwards without an amendment."
      />
      <AppDialogBody className="space-y-4">
        <p className="flex items-start gap-2 rounded-lg bg-info-soft px-3 py-2 text-sm text-info">
          <Info className="mt-0.5 size-4 shrink-0" />
          <span>
            Demo: no email is actually sent. The order is marked issued and this message is kept on
            it.
          </span>
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="From" required>
            <Input type="email" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="To" required hint="Defaults to the supplier's address in the supplier master.">
            <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@supplier.com" />
          </Field>
          <Field label="CC" hint="Separate several addresses with a comma.">
            <Input value={cc} onChange={(e) => setCc(e.target.value)} />
          </Field>
          <Field label="BCC">
            <Input value={bcc} onChange={(e) => setBcc(e.target.value)} />
          </Field>
        </div>

        <Field label="Subject" required>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
        </Field>
        <Field label="Message">
          <Textarea rows={8} value={body} onChange={(e) => setBody(e.target.value)} />
        </Field>

        <div className="flex items-center gap-3 rounded-lg p-2.5 ring-1 ring-border">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <FileText className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium" title={defaults.attachment_name}>
              {defaults.attachment_name}
            </p>
            <p className="text-xs text-muted-foreground">PDF · A4 · attached</p>
          </div>
          <Button variant="outline" size="sm" disabled={previewing} onClick={() => void preview()}>
            {previewing ? "Building…" : "Preview"}
          </Button>
        </div>
      </AppDialogBody>
      <AppDialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <SubmitButton
          type="button"
          submitting={pending}
          invalidReason={missing}
          onClick={() =>
            void run(() => issuePurchaseOrder(po.id, actor, { from, to, cc, bcc, subject, body }), {
              success: `${po.po_number} issued — email to ${to.split(/[,;]/)[0].trim()} recorded (demo, not sent)`,
              onDone: () => {
                onClose();
                onDone?.();
              },
            })
          }
        >
          <Send className="size-3.5" /> Send and issue
        </SubmitButton>
      </AppDialogFooter>
    </>
  );
}
