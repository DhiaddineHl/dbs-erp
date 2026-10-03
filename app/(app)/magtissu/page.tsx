import { requireUser, userRole } from "@/lib/auth/server";
import { peutModifier } from "@/lib/domain/feux";
import { getRoleModules } from "@/lib/services/permissions";
import { bonsRetourTissu, reliquatsTissu, vueMatiereCommandes } from "@/lib/services/matiere-tissu";
import { commandesPourAffectation } from "@/lib/services/tissu";
import { chargerRouleaux, indicateursRouleaux, listBonsSortie, listRecaps } from "@/lib/services/rouleaux";
import { MagasinTissu, type OngletTissu } from "./magtissu-client";

const ONGLETS: OngletTissu[] = ["commandes", "lots", "rouleaux", "reliquats", "dashboard"];

export default async function Page({ searchParams }: { searchParams: Promise<{ onglet?: string; q?: string }> }) {
  const user = await requireUser();
  const role = userRole(user);
  const sp = await searchParams;
  const [{ commandes: parCommande, lots }, choix, bons, modules, rouleaux, kpisRouleaux, bonsSortie, recaps] = await Promise.all([
    vueMatiereCommandes(),
    commandesPourAffectation(),
    bonsRetourTissu(),
    getRoleModules(role),
    chargerRouleaux(),
    indicateursRouleaux(),
    listBonsSortie(),
    listRecaps(),
  ]);
  const { groupes } = await reliquatsTissu(lots);
  return (
    <MagasinTissu
      key={`${sp.onglet ?? ""}-${sp.q ?? ""}`}
      lots={lots}
      parCommande={parCommande}
      reliquats={groupes}
      bonsRetour={bons}
      commandes={choix}
      peutSaisir={peutModifier("tissu", role) || modules.magtissu === true}
      ongletInitial={ONGLETS.find((o) => o === sp.onglet) ?? "commandes"}
      rechercheInitiale={sp.q ?? ""}
      rouleaux={rouleaux}
      indicateursRouleaux={kpisRouleaux}
      bonsSortie={bonsSortie}
      recaps={recaps}
    />
  );
}
