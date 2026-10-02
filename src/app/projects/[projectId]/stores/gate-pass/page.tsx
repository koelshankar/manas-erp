"use client";

import { StubPage } from "@/components/common";
import { DoorOpen } from "lucide-react";

/** Material leaving site — returnable and non-returnable gate passes. */
export default function GatePassPage() {
  return (
    <StubPage
      resource="gate_pass"
      description="Material leaving the gate: returnable and non-returnable passes, and what is still out."
      message="No gate passes raised. One is raised when material leaves site — plant going for repair, surplus going back to a supplier, or stock moving to another project."
      icon={DoorOpen}
    />
  );
}
