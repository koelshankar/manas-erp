"use client";

import { StubPage } from "@/components/common";
import { Send } from "lucide-react";

/** Drawing issue records — who was sent which revision, and when. */
export default function TransmittalsPage() {
  return (
    <StubPage
      resource="transmittals"
      description="Who was issued which revision, when, and what they acknowledged."
      message="Nothing issued yet. A transmittal records a set of drawings going out to a contractor or consultant, so a superseded revision on site can always be traced back."
      icon={Send}
    />
  );
}
