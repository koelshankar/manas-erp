"use client";

import { StubPage } from "@/components/common";
import { FileStack } from "lucide-react";

/** The controlled drawing register: current revision of every drawing. */
export default function DrawingRegisterPage() {
  return (
    <StubPage
      resource="drawings"
      description="The controlled register: every drawing, its current revision and who holds it."
      message="No drawings registered. Upload the architectural, structural and services sets, and each one is tracked here by revision so the site always builds to the current issue."
      icon={FileStack}
    />
  );
}
