import { requireUser, userRole } from "@/lib/auth/server";
import { listBr, listCommandesAval, listMouvements } from "@/lib/services/aval";
import { ROLES_SAISIE_MAGASIN } from "@/lib/domain/aval";
import { livraisonsAnnoncees } from "@/lib/services/suivi-soustraitants";
import Link from "next/link";
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
  const [commandes, brs, mouvements, annoncees] = await Promise.all([
    listCommandesAval({ archived: false }),
    listBr(),
    listMouvements(),
    livraisonsAnnoncees(),
  ]);

  return (
    <>
      {/* Livraisons annoncées sur le portail des ateliers : à l'arrivée, on
          compte et on valide — le BR se crée tout seul. */}
      {annoncees.length > 0 && (
        <div className="mb-3 rounded-lg border-2 border-amber-300 bg-amber-50 px-4 py-2 text-sm">
          <b>🚚 {annoncees.length} livraison(s) annoncée(s) par les ateliers</b> — à l&apos;arrivée, ouvrez-la (ou scannez le QR du bon) et validez :
          <span className="ml-1 inline-flex flex-wrap gap-1">
            {annoncees.slice(0, 8).map((l) => (
              <Link key={l.numero} href={`/suivi_st/livraison/${encodeURIComponent(l.numero)}`} className="rounded border border-amber-400 bg-white px-2 py-0.5 text-xs font-semibold">
                {l.numero} · {l.atelier} · {l.of} · {l.pieces} pcs
              </Link>
            ))}
          </span>
        </div>
      )}
      <MagasinClient
      commandes={commandes}
      brs={brs}
      mouvements={mouvements}
      peutSaisir={ROLES_SAISIE_MAGASIN.includes(role)}
      ongletInitial={ONGLETS.includes(onglet as Onglet) ? (onglet as Onglet) : "stock"}
      />
    </>
  );
}
