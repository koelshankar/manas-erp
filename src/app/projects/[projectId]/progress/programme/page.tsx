"use client";

import { StubPage } from "@/components/common";
import { CalendarRange } from "lucide-react";

/** The project programme — the bar chart the site tasks run against. */
export default function ProgrammePage() {
  return (
    <StubPage
      resource="programme"
      description="The dated programme every site task and work order runs against."
      message="Nothing is programmed yet. Import the construction programme, or set planned start and finish dates on the work-order activities in Site tasks, and the bars appear here."
      icon={CalendarRange}
    />
  );
}
