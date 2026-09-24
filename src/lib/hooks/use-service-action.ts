"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useSession } from "@/lib/session";
import { ServiceError, type ActingUser } from "@/lib/services/types";

/** The acting user for every service call, straight from the session. */
export function useActor(): ActingUser {
  const { user, role } = useSession();
  return { user_id: user?.id ?? "", role };
}

export type RunOptions<T> = {
  success: string | ((result: T) => string);
  /**
   * Where the record the action just wrote can be read.
   *
   * Every success toast carries a "View" link, because the one thing a person
   * wants after saving is to see what they saved — and without it a write that
   * scrolls off a long list leaves no trace they can follow.
   */
  view?: string | ((result: T) => string | null) | null;
  onDone?: (result: T) => void;
};

/**
 * The write path. Components hand a service call to `run`; errors come back as
 * toasts and never as thrown exceptions, so no screen has to know about the
 * error classes.
 */
export function useServiceAction() {
  const [pending, setPending] = useState(false);
  const router = useRouter();

  const run = useCallback(async function run<T>(
    op: () => Promise<T>,
    options: RunOptions<T>,
  ): Promise<T | null> {
    setPending(true);
    try {
      const result = await op();
      const message =
        typeof options.success === "function" ? options.success(result) : options.success;
      const href =
        typeof options.view === "function" ? options.view(result) : (options.view ?? null);
      toast.success(message, {
        action: href ? { label: "View", onClick: () => router.push(href) } : undefined,
      });
      options.onDone?.(result);
      return result;
    } catch (error) {
      if (error instanceof ServiceError) {
        toast.error(error.name === "PermissionError" ? "Not allowed" : "Could not save", {
          description: error.message,
        });
      } else {
        toast.error("Something went wrong", {
          description: error instanceof Error ? error.message : String(error),
        });
      }
      return null;
    } finally {
      setPending(false);
    }
  }, [router]);

  return { run, pending };
}
