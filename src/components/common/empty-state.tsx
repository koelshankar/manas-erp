import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Inbox, type LucideIcon } from "lucide-react";

/**
 * What a list shows when it has nothing in it: an icon, one sentence that says
 * what would put something here, and the action that starts it. Never a bare
 * "No records found" — that tells the reader nothing about what to do next.
 */
export function EmptyState({
  icon: Icon = Inbox,
  message,
  action,
}: {
  icon?: LucideIcon;
  message: string;
  action?: ReactNode;
}) {
  return (
    <Card className="border-dashed bg-muted/20 px-6 py-12 text-center">
      <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-full bg-background ring-1 ring-border">
          <Icon className="size-4 text-muted-foreground" />
        </span>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {message}
        </p>
        {action ? <div className="mt-1">{action}</div> : null}
      </div>
    </Card>
  );
}

export function EmptyRows({ message }: { message: string }) {
  return (
    <div className="px-6 py-10 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}
