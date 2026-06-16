import { requireAdmin } from "@/lib/auth/server";
import { listUsers } from "@/lib/services/users";
import { getPermMatrix, getSetting } from "@/lib/services/permissions";
import { ParametresClient } from "./parametres-client";

export default async function ParametresPage() {
  // Admins only — non-admins are bounced to the cockpit.
  await requireAdmin();
  const [users, matrix, prixFacon] = await Promise.all([
    listUsers(),
    getPermMatrix(),
    getSetting<number>("prixFacon", 3.5),
  ]);

  return <ParametresClient users={users} matrix={matrix} prixFacon={prixFacon} />;
}
