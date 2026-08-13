import { requireUser, userRole } from "@/lib/auth/server";
import { getTauxEur, listComptesFournisseurs } from "@/lib/services/finance";
import { GrandLivreClient } from "./gl-client";

const COMPTA = ["admin", "resp", "jfl"];

export default async function GrandLivrePage() {
  const user = await requireUser();
  const role = userRole(user);
  const [comptes, taux] = await Promise.all([listComptesFournisseurs(), getTauxEur()]);

  return (
    <GrandLivreClient comptes={comptes} taux={taux} peutSaisir={role === "admin" || COMPTA.includes(role)} />
  );
}
