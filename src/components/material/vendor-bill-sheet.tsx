"use client";

import { useState } from "react";
import { Check, Send, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Attachments,
  DetailRow,
  Field,
  RecordTrail,
  StatusPill,
} from "@/components/common";
import { useAccess, useActor, useLookups, useProjectRows, useServiceAction } from "@/lib/hooks";
import {
  handOverVendorBill,
  verifyVendorBill,
} from "@/lib/services/vendor-bill-service";
import {
  formatDate,
  formatDateTime,
  formatInr,
  formatNumber,
} from "@/lib/format";
import type { VendorBill, VendorBillLine } from "@/lib/domain";
import { cn } from "cn";
import {
  AppDialog,
  AppDialogBody,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from "@/components/ui-app";

function Mark({ ok }: { ok: boolean }) {
  return ok ? (
    <Check className="size-4 text-success" aria-label="matched" />
  ) : (
    <X className="size-4 text-destructive" aria-label="not matched" />
  );
}

/** B7 → B8 — the three-way match result, then verify and hand over. */
export function VendorBillSheet({
  bill,
  open,
  onOpenChange,
  projectId,
  canAct,
  showValues,
}: {
  bill: VendorBill | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  canAct: boolean;
  showValues: boolean;
}) {
  const allLines = useProjectRows(
    "vendor_bill_lines",
    projectId,
  ) as VendorBillLine[];
  const allBills = useProjectRows("vendor_bills", projectId) as VendorBill[];
  const lookup = useLookups();
  const actor = useActor();
  const { run, pending } = useServiceAction();
  const access = useAccess("vendor_bills");
  const [override, setOverride] = useState("");

  // Read the live row, not the snapshot the list handed us: verifying from
  // inside this sheet has to move the footer on to "hand over".
  const live = bill ? (allBills.find((b) => b.id === bill.id) ?? bill) : null;
  if (!live) return null;
  const bill_ = live;

  const lines = allLines.filter((l) => l.vendor_bill_id === bill_.id);
  const matched =
    bill_.is_quantity_matched && bill_.is_rate_matched && bill_.is_tax_matched;

  async function verify() {
    await run(
      () =>
        verifyVendorBill(
          { vendor_bill_id: bill_.id, override_reason: override },
          actor,
        ),
      {
        // The sheet stays open: handing over to Accounts is the next action
        // and it lives on this same footer.
        success: "Bill verified and posted to the supplier ledger",
        onDone: () => setOverride(""),
      },
    );
  }

  async function handOver() {
    await run(() => handOverVendorBill(bill_.id, actor), {
      success: "Sent to Accounts",
      onDone: () => onOpenChange(false),
    });
  }

  return (
    <AppDialog open={open} onOpenChange={onOpenChange} size="xl">
      <AppDialogHeader>
        <AppDialogTitle className="flex flex-wrap items-center gap-3">
          <span className="font-mono">{bill_.bill_number}</span>
          <StatusPill status={bill_.status} />
        </AppDialogTitle>
        <AppDialogDescription>
          {lookup.supplier(bill_.supplier_id)} · our ref{" "}
          <span className="font-mono">{bill_.reference_number}</span>
        </AppDialogDescription>
      </AppDialogHeader>

      <AppDialogBody className="space-y-6">
        <RecordTrail entityType="vendor_bill" entityId={bill_.id} />

        <Attachments
          entityType="vendor_bill"
          entityId={bill_.id}
          projectId={bill_.project_id}
          canEdit={access.canEdit}
        />

        <dl className="divide-y divide-border/60">
          <DetailRow label="Bill date">{formatDate(bill_.bill_date)}</DetailRow>
          <DetailRow label="Received">
            {formatDate(bill_.received_date)}
          </DetailRow>
          <DetailRow label="Entered by">
            {lookup.user(bill_.entered_by_user_id)}
          </DetailRow>
          {bill_.verified_at ? (
            <DetailRow label="Verified">
              {lookup.user(bill_.verified_by_user_id)} ·{" "}
              {formatDateTime(bill_.verified_at)}
            </DetailRow>
          ) : null}
          {bill_.handed_over_at ? (
            <DetailRow label="Handed over">
              {formatDateTime(bill_.handed_over_at)}
            </DetailRow>
          ) : null}
        </dl>

        <section>
          <h3 className="mb-3 flex items-center gap-3 text-sm font-semibold">
            Three-way match
            <span className="flex items-center gap-3 text-xs font-normal text-muted-foreground">
              <span className="flex items-center gap-1">
                <Mark ok={bill_.is_quantity_matched} /> Quantity
              </span>
              <span className="flex items-center gap-1">
                <Mark ok={bill_.is_rate_matched} /> Rate
              </span>
              <span className="flex items-center gap-1">
                <Mark ok={bill_.is_tax_matched} /> Tax
              </span>
            </span>
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/70 text-xs text-muted-foreground">
                  <th className="py-2 pr-3 text-left font-medium">Material</th>
                  <th className="py-2 pr-3 text-right font-medium">
                    Billed qty
                  </th>
                  <th className="py-2 pr-3 text-right font-medium">GRN qty</th>
                  {showValues ? (
                    <>
                      <th className="py-2 pr-3 text-right font-medium">
                        Billed rate
                      </th>
                      <th className="py-2 pr-3 text-right font-medium">
                        PO rate
                      </th>
                      <th className="py-2 pr-3 text-right font-medium">GST</th>
                      <th className="py-2 pr-3 text-right font-medium">
                        Variance
                      </th>
                    </>
                  ) : null}
                  <th className="py-2 text-left font-medium">Match</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr
                    key={l.id}
                    className="border-b border-border/40 last:border-0"
                  >
                    <td className="py-2 pr-3">
                      {lookup.material(l.material_id)}
                    </td>
                    <td
                      className={cn(
                        "py-2 pr-3 text-right tabular-nums",
                        !l.qty_matched && "text-destructive",
                      )}
                    >
                      {formatNumber(l.billed_qty, 2)}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                      {formatNumber(l.grn_accepted_qty, 2)}
                    </td>
                    {showValues ? (
                      <>
                        <td
                          className={cn(
                            "py-2 pr-3 text-right tabular-nums",
                            !l.rate_matched && "text-destructive",
                          )}
                        >
                          {formatInr(l.billed_rate)}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                          {formatInr(l.po_rate)}
                        </td>
                        <td
                          className={cn(
                            "py-2 pr-3 text-right tabular-nums",
                            !l.tax_matched && "text-destructive",
                          )}
                        >
                          {l.billed_gst_percent}%
                        </td>
                        <td
                          className={cn(
                            "py-2 pr-3 text-right tabular-nums",
                            l.variance_amount !== 0 && "text-destructive",
                          )}
                        >
                          {formatInr(l.variance_amount)}
                        </td>
                      </>
                    ) : null}
                    <td className="py-2">
                      <span className="flex items-center gap-1">
                        <Mark ok={l.qty_matched} />
                        <Mark ok={l.rate_matched} />
                        <Mark ok={l.tax_matched} />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {showValues ? (
          <section className="ml-auto w-full max-w-sm space-y-1.5 text-sm">
            <Row label="Billed basic" value={bill_.bill_basic_amount} />
            <Row label="Billed tax" value={bill_.bill_tax_amount} />
            <Row label="Billed total" value={bill_.bill_total_amount} strong />
            <div className="pt-2" />
            <Row
              label="Expected total"
              value={bill_.expected_total_amount}
              muted
            />
            <Row
              label="Variance"
              value={bill_.amount_variance}
              tone={bill_.amount_variance !== 0}
            />
          </section>
        ) : null}

        {bill_.override_reason ? (
          <p className="rounded-lg bg-warning-soft px-3 py-2.5 text-xs text-warning ring-1 ring-warning/30">
            Verified despite the mismatch: “{bill_.override_reason}”
          </p>
        ) : null}

        {canAct && bill_.status === "mismatch" ? (
          <Field
            label="Override reason"
            required
            hint="This bill failed the three-way match. Say why it is being accepted."
          >
            <Input
              value={override}
              onChange={(e) => setOverride(e.target.value)}
              placeholder="Rate revision agreed by email on 18 Sep."
            />
          </Field>
        ) : null}
      </AppDialogBody>

      {canAct ? (
        <AppDialogFooter>
          {bill_.status === "matched" || bill_.status === "mismatch" ? (
            <Button onClick={verify} disabled={pending}>
              <Check className="size-3.5" />
              {pending
                ? "Verifying…"
                : matched
                  ? "Verify"
                  : "Verify with override"}
            </Button>
          ) : null}
          {bill_.status === "verified" ? (
            <Button onClick={handOver} disabled={pending}>
              <Send className="size-3.5" />{" "}
              {pending ? "Sending…" : "Hand over to Accounts"}
            </Button>
          ) : null}
        </AppDialogFooter>
      ) : null}
    </AppDialog>
  );
}

function Row({
  label,
  value,
  strong,
  muted,
  tone,
}: {
  label: string;
  value: number;
  strong?: boolean;
  muted?: boolean;
  tone?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between",
        strong && "border-t border-border pt-1.5 font-semibold",
        muted && "text-muted-foreground",
      )}
    >
      <span>{label}</span>
      <span className={cn("tabular-nums", tone && "text-destructive")}>
        {formatInr(value)}
      </span>
    </div>
  );
}
