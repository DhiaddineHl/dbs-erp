import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { requireUser, userRole } from "@/lib/auth/server";
import { getRoleModules, listRoles } from "@/lib/services/permissions";

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Real auth enforcement (the proxy only does an optimistic cookie check).
  const user = await requireUser();
  const role = userRole(user);
  const [modules, roles] = await Promise.all([getRoleModules(role), listRoles()]);
  const roleLabel = roles.find((r) => r.key === role)?.label ?? role;

  return (
    <div className="grid h-screen grid-cols-[248px_1fr] grid-rows-[60px_1fr]">
      <div className="row-span-2 min-h-0">
        <Sidebar modules={modules} />
      </div>
      <Topbar user={{ name: user.name, email: user.email, role, roleLabel }} />
      <main className="min-h-0 overflow-y-auto px-7 py-6">{children}</main>
    </div>
  );
}
