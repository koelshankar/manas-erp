"use client";

import { Check, Minus, RotateCcw } from "lucide-react";
import { cn } from "cn";
import {
  CLIENT_ROLES,
  WORKSPACE_TAB_KEYS,
  type WorkspaceTabKey,
} from "@/config/permissions";
import { WORKSPACE_TABS } from "@/components/shell/nav-config";
import { PageHeader, HydrationGate } from "@/components/common";
import { useResetTabMatrix, useSetTabAccess, useTabMatrix } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import { Card } from "@/components/ui/card";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

const TAB_LABEL: Record<WorkspaceTabKey, string> = Object.fromEntries(
  WORKSPACE_TABS.map((t) => [t.key, t.label]),
) as Record<WorkspaceTabKey, string>;

/**
 * Which of the eight workspace tabs each role carries.
 *
 * This is a screen rather than a constant because the client has not settled
 * it: the split between a project engineer and a store keeper, or whether a
 * QS needs Contracts, is the kind of thing that changes in the meeting. Turn a
 * cell off and the tab disappears from that role's workspace on the next
 * render — there is nothing to save and nothing to deploy.
 *
 * A tab turned off is **hidden, not disabled**. The pages behind it keep
 * working: a link from a record trail, an approval or a dashboard still opens
 * them read-only. What a role may *do* once inside is a separate question,
 * answered by `can()`, and no amount of editing here grants an approval.
 */
export default function PermissionsMatrixPage() {
  const { role: currentRole } = useSession();
  const matrixFor = useTabMatrix();
  const setTab = useSetTabAccess();
  const resetMatrix = useResetTabMatrix();

  return (
    <div>
      <PageHeader
        resource="permissions_matrix"
        title="Permissions matrix"
        description="Which tabs each role carries in a project. Changes apply immediately."
        team="project_budget"
        breadcrumb={[{ label: "Masters", href: "/masters" }, { label: "Permissions" }]}
        menu={
          <DropdownMenuItem
            onClick={() => {
              resetMatrix();
              toast.success("Matrix reset to the approved defaults");
            }}
          >
            <RotateCcw className="size-4" />
            Reset to approved
          </DropdownMenuItem>
        }
      />

      <HydrationGate rows={4}>
        {/* Desktop: the matrix as a matrix. A grid of nine rows against eight
            columns is the whole point — the shape is the information. */}
        <Card className="hidden overflow-x-auto lg:block">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border">
                <th
                  scope="col"
                  className="sticky left-0 z-10 bg-card px-4 py-3 text-left font-medium text-muted-foreground"
                >
                  Role
                </th>
                {WORKSPACE_TAB_KEYS.map((key) => (
                  <th
                    key={key}
                    scope="col"
                    className="px-2 py-3 text-center font-medium text-muted-foreground"
                  >
                    {TAB_LABEL[key]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CLIENT_ROLES.map((entry) => {
                const access = entry.role ? matrixFor(entry.role) : null;
                return (
                  <tr
                    key={entry.label}
                    className={cn(
                      "border-b border-border/60 last:border-0",
                      entry.role === currentRole && "bg-muted/40",
                    )}
                  >
                    <th
                      scope="row"
                      className={cn(
                        "sticky left-0 z-10 max-w-[22ch] bg-card px-4 py-3 text-left font-medium",
                        entry.role === currentRole && "bg-muted/40",
                      )}
                    >
                      {entry.label}
                      {entry.role === currentRole ? (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          you
                        </span>
                      ) : null}
                      <span className="mt-0.5 block text-sm font-normal text-muted-foreground">
                        {entry.role ? entry.description : "No login yet — the project engineer covers this."}
                      </span>
                    </th>
                    {WORKSPACE_TAB_KEYS.map((key) => (
                      <td key={key} className="px-2 py-2 text-center">
                        <Cell
                          allowed={access?.[key] ?? false}
                          disabled={!entry.role}
                          label={`${TAB_LABEL[key]} for ${entry.label}`}
                          onToggle={() =>
                            entry.role && setTab(entry.role, key, !access?.[key])
                          }
                        />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>

        {/* Phone and tablet: a matrix will not fit in 390px without becoming a
            horizontal scroll of unlabelled ticks, so each role becomes a card
            of named toggles. */}
        <div className="grid gap-4 md:grid-cols-2 lg:hidden">
          {CLIENT_ROLES.map((entry) => {
            const access = entry.role ? matrixFor(entry.role) : null;
            return (
              <Card key={entry.label} className="px-5 py-5">
                <h2 className="text-base font-semibold tracking-tight">
                  {entry.label}
                  {entry.role === currentRole ? (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">you</span>
                  ) : null}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {entry.role ? entry.description : "No login yet — the project engineer covers this."}
                </p>
                <ul className="mt-4 divide-y divide-border/60">
                  {WORKSPACE_TAB_KEYS.map((key) => (
                    <li key={key} className="flex items-center justify-between gap-3 py-1">
                      <span className="text-sm">{TAB_LABEL[key]}</span>
                      <Cell
                        allowed={access?.[key] ?? false}
                        disabled={!entry.role}
                        label={`${TAB_LABEL[key]} for ${entry.label}`}
                        onToggle={() =>
                          entry.role && setTab(entry.role, key, !access?.[key])
                        }
                      />
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
      </HydrationGate>
    </div>
  );
}

/**
 * One cell. A 44px target whatever the viewport, and never colour alone: the
 * tick and the dash say which state it is in without relying on the green.
 */
function Cell({
  allowed,
  disabled,
  label,
  onToggle,
}: {
  allowed: boolean;
  disabled?: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={allowed}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "inline-flex size-11 items-center justify-center rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
        disabled
          ? "cursor-not-allowed text-muted-foreground/40"
          : allowed
            ? "bg-success-soft text-success hover:bg-success-soft/70"
            : "text-muted-foreground hover:bg-muted",
      )}
    >
      {allowed ? <Check className="size-4" /> : <Minus className="size-4" />}
      <span className="sr-only">{allowed ? "visible" : "hidden"}</span>
    </button>
  );
}
