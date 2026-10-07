"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { HydrationGate, NativeSelect, PageHeader, PrintButton } from "@/components/common";
import { DrawingDialog } from "@/components/drawings/drawing-dialog";
import { RegisterTable } from "@/components/drawings/register-table";
import { RegisterDocument } from "@/components/drawings/register-document";
import { useAccess, useAllRows, useProjectId, useProjectRows } from "@/lib/hooks";
import { today } from "@/lib/clock";
import { drawingDisciplineLabel } from "@/config/labels";
import { DRAWING_DISCIPLINES } from "@/lib/domain";
import type { Drawing, DrawingRevision, Project } from "@/lib/domain";

/** The controlled drawing register: current revision of every drawing. */
export default function DrawingRegisterPage() {
  const projectId = useProjectId();
  const access = useAccess("drawings");
  const drawings = useProjectRows("drawings", projectId) as Drawing[];
  const revisions = useProjectRows("drawing_revisions", projectId) as DrawingRevision[];
  const projects = useAllRows("projects") as Project[];
  const project = projects.find((p) => p.id === projectId);

  const [search, setSearch] = useState("");
  const [discipline, setDiscipline] = useState("");

  const revisionsOf = (d: Drawing) => revisions.filter((r) => r.drawing_id === d.id);

  const filtered = drawings
    .filter((d) => !discipline || d.discipline === discipline)
    .filter(
      (d) =>
        !search ||
        d.drawing_no.toLowerCase().includes(search.toLowerCase()) ||
        d.title.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <div>
      <PageHeader
        resource="drawings"
        title={access.meta.label}
        description="Every drawing on the project and its revision history — architectural, structural, MEP, plumbing and electrical."
        team={access.ownerTeam}
        outsideNav={access.outsideNav}
        owned={access.owned}
        actions={
          <div className="flex items-center gap-2">
            <PrintButton label="Print register" />
            {access.canCreate ? <DrawingDialog projectId={projectId} today={today()} /> : null}
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2 print:hidden">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Drawing number or title"
          className="max-w-xs"
        />
        <NativeSelect
          value={discipline}
          onChange={(e) => setDiscipline(e.target.value)}
          className="max-w-[12rem]"
        >
          <option value="">All disciplines</option>
          {DRAWING_DISCIPLINES.map((d) => (
            <option key={d} value={d}>
              {drawingDisciplineLabel(d)}
            </option>
          ))}
        </NativeSelect>
      </div>

      <HydrationGate>
        <div className="print:hidden">
          <RegisterTable
            drawings={filtered}
            revisionsOf={revisionsOf}
            today={today()}
            canEdit={access.canEdit}
            emptyMessage="No drawings registered. Upload the architectural, structural and services sets, and each one is tracked here by revision so the site always builds to the current issue."
          />
        </div>
        <div className="hidden print:block">
          <RegisterDocument
            project_name={project?.name ?? ""}
            drawings={filtered}
            revisionsOf={revisionsOf}
            onDate={today()}
          />
        </div>
      </HydrationGate>
    </div>
  );
}
