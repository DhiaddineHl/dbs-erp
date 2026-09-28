import { requireUser, userRole } from "@/lib/auth/server";
import { listBr, listCommandesAval, listMouvements } from "@/lib/services/aval";
import { ROLES_SAISIE_MAGASIN } from "@/lib/domain/aval";
import { MagasinClient, type Onglet } from "./magasin-client";

const ONGLETS: Onglet[] = ["stock", "receptions", "mouvements"];

/* Magasin produits finis — module unique (fusion de « Réception ST » et de
 * « Produits finis ») : tout ce qui entre au stock (production interne,
 * réceptions façonniers, retouches), ce qui en sort (bons de livraison) et le
 * journal des mouvements, sur une seule page à onglets. */
export default async function MagasinPage({ searchParams }: { searchParams: Promise<{ onglet?: string }> }) {
  const user = await requireUser();
  const role = userRole(user);
  const { onglet } = await searchParams;
  const [commandes, brs, mouvements] = await Promise.all([
    listCommandesAval({ archived: false }),
    listBr(),
    listMouvements(),
  ]);

  return (
    <MagasinClient
      commandes={commandes}
      brs={brs}
      mouvements={mouvements}
      peutSaisir={ROLES_SAISIE_MAGASIN.includes(role)}
      ongletInitial={ONGLETS.includes(onglet as Onglet) ? (onglet as Onglet) : "stock"}
    />
  );
}
