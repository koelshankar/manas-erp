"use client";

import Link from "next/link";
import {
  PageHeader,
  DataTable,
  HydrationGate,
  OwnerTag,
  type Column,
} from "@/components/common";
import { useAllRows } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import { ROLE_LABEL } from "@/config/permissions";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import type { Project, User } from "@/lib/domain";

/**
 * Who is in the system, what they do, and the sites they are posted to.
 *
 * The posting matters as much as the role: it is what scopes My work and the
 * Approvals inbox, so a bill sitting on a manager who is not posted to that
 * site is a thing you can see the cause of here.
 */
export default function UsersPage() {
  const { user: me } = useSession();
  const users = useAllRows("users") as User[];
  const projects = useAllRows("projects") as Project[];
  const projectName = new Map(projects.map((p) => [p.id, p.name]));

  const columns: Array<Column<User>> = [
    {
      key: "name",
      header: "Name",
      primary: true,
      cell: (r) => (
        <span className="flex items-center gap-2">
          {r.full_name}
          {r.id === me?.id ? (
            <span className="text-xs text-muted-foreground">you</span>
          ) : null}
        </span>
      ),
    },
    { key: "role", header: "Role", secondary: true, cell: (r) => ROLE_LABEL[r.role] },
    { key: "team", header: "Team", cell: (r) => <OwnerTag team={r.team} /> },
    { key: "email", header: "Email", cell: (r) => r.email },
    { key: "phone", header: "Phone", cell: (r) => r.phone },
    {
      key: "posting",
      header: "Posted to",
      cell: (r) =>
        r.assigned_project_ids.length === projects.length
          ? "All projects"
          : r.assigned_project_ids.map((id) => projectName.get(id) ?? "—").join(", ") ||
            "—",
    },
  ];

  return (
    <div>
      <PageHeader
        resource="users"
        title="Users & roles"
        description="Who is in the system, what they do, and the sites they are posted to."
        team="project_budget"
        breadcrumb={[{ label: "Masters", href: "/masters" }, { label: "Users & roles" }]}
        menu={
          <DropdownMenuItem render={<Link href="/masters/permissions" />}>
            Open the permissions matrix
          </DropdownMenuItem>
        }
      />
      <HydrationGate>
        <DataTable
          columns={columns}
          rows={users}
          rowKey={(r) => r.id}
          emptyMessage="No users yet."
          caption={`${users.length} people across ${projects.length} sites. A role decides which tabs they carry — see the permissions matrix.`}
        />
      </HydrationGate>
    </div>
  );
}
