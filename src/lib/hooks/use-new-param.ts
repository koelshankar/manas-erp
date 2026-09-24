"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * True once, when a page is opened with `?new=1`.
 *
 * That is how the "+ New" menu in the top bar starts a record from anywhere:
 * it navigates to the page that owns the record and lets that page open its
 * own create dialog, so the form and the list it writes into stay together.
 * The flag is consumed on mount, so closing the dialog does not reopen it.
 */
export function useNewParam(): [boolean, (v: boolean) => void] {
  const params = useSearchParams();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (params?.get("new") !== "1") return;
    setOpen(true);
    window.history.replaceState(null, "", pathname ?? window.location.pathname);
  }, [params, pathname]);

  return [open, setOpen];
}
