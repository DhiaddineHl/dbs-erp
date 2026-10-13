import { CadreApp } from "@/components/layout/cadre-app";
import { requireUser, userRole } from "@/lib/auth/server";
import { getRoleModules, listRoles } from "@/lib/services/permissions";
import { compteursMenu } from "@/lib/services/compteurs-menu";
import { VeilleMessagerie } from "@/components/messagerie/veille";

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
  const badges = await compteursMenu(modules);

  return (
    <CadreApp modules={modules} badges={badges} user={{ name: user.name, email: user.email, role, roleLabel }}>
      {children}
      <VeilleMessagerie />
    </CadreApp>
  );
}
