"use client";

import { useEffect } from "react";
import { assertNoMoney } from "@/lib/services/queries";
import { useSession } from "@/lib/session";

/**
 * Dev-only tripwire on a value-blind screen.
 *
 * Hand it whatever the page is about to render. If a single `*_amount`,
 * `*_rate`, `*_value`, `budget*`, `spent*` or `certified*` field reached a role
 * that may not see values, it names the field and the page in the console.
 *
 * Silent in production, and free for a role that may see values.
 */
export function useMoneyLeakCheck(where: string, payload: unknown): void {
  const { role } = useSession();
  useEffect(() => {
    assertNoMoney(role, payload, where);
  }, [role, payload, where]);
}
