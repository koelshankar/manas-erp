"use client";

import { StubPage } from "@/components/common";
import { Library } from "lucide-react";

/** Standard BOQ items a new project's bill of quantities is built from. */
export default function BoqLibraryPage() {
  return (
    <StubPage
      resource="boq_library"
      description="Standard items, units and indicative rates a new project's BOQ is built from."
      message="The library is empty. Items added here can be pulled into any project's BOQ, so a trade is described the same way on every site."
      icon={Library}
    />
  );
}
