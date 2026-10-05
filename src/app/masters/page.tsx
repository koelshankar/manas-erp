"use client";

import Link from "next/link";
import {
  ChevronRight,
  Package,
  HardHat,
  Store,
  Library,
  Users,
  ShieldCheck,
  ScrollText,
  Hash,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/common";
import { Card } from "@/components/ui/card";

type MasterLink = {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
};

/**
 * The reference data behind everything else: what we buy, who builds it, who
 * supplies it, and who in the office may see which part of it.
 */
const MASTERS: MasterLink[] = [
  {
    href: "/masters/materials",
    label: "Materials",
    description: "Every material we buy, its unit and its reorder level.",
    icon: Package,
  },
  {
    href: "/masters/contractors",
    label: "Contractors",
    description: "Labour and work-order contractors, with the constitution that sets their TDS.",
    icon: HardHat,
  },
  {
    href: "/masters/suppliers",
    label: "Suppliers",
    description: "Vendors and their quoted rates, with the state that decides the tax split.",
    icon: Store,
  },
  {
    href: "/masters/boq-library",
    label: "BOQ library",
    description: "Standard items and rates a new project's BOQ is built from.",
    icon: Library,
  },
  {
    href: "/masters/po-terms",
    label: "PO terms",
    description:
      "The numbered clauses printed overleaf on a purchase order, and the four an order fills in itself.",
    icon: ScrollText,
  },
  {
    href: "/masters/numbering",
    label: "Document numbering",
    description: "The series each document is numbered in. A change applies to the next one issued.",
    icon: Hash,
  },
  {
    href: "/masters/users",
    label: "Users & roles",
    description: "Who is in the system, what they do, and the sites they are posted to.",
    icon: Users,
  },
  {
    href: "/masters/permissions",
    label: "Permissions matrix",
    description: "Which tabs each role carries. Editing it changes the workspace immediately.",
    icon: ShieldCheck,
  },
];

export default function MastersPage() {
  return (
    <div>
      <PageHeader
        title="Masters"
        description="The reference data every project draws on, and who may see which part of it."
        team="project_budget"
        breadcrumb={[{ label: "Masters" }]}
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {MASTERS.map(({ href, label, description, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="group rounded-xl focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <Card className="flex h-full items-start gap-4 px-5 py-5 transition-shadow hover:shadow-pop">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                <Icon className="size-5 text-muted-foreground" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-base font-semibold tracking-tight">{label}</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
                  {description}
                </span>
              </span>
              <ChevronRight className="mt-1 size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
