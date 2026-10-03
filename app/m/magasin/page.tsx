import { redirect } from "next/navigation";
import { getUser, userRole } from "@/lib/auth/server";
import { NAV_STRUCTURE, entreeAutorisee } from "@/lib/nav";
import { ORIGINES_MOUVEMENT, ROLES_SAISIE_MAGASIN, listesReception } from "@/lib/domain/aval";
import { todayISO } from "@/lib/domain/commande";
import { listBr, listCommandesAval, listMouvements } from "@/lib/services/aval";
import { getRoleModules } from "@/lib/services/permissions";
import { MagasinMobile, type SaisieJour } from "./magasin-mobile";

/* Saisie mobile du magasin produits finis — la page ouverte par le QR affiché
 * au magasin. Hors de la mise en page de l'application (pas de menu latéral) :
 * un téléphone, de gros boutons, trois touchers par réception.
 *
 * Accès : compte PilotPro obligatoire (le téléphone reste connecté ensuite).
 * Même droits que l'écran Magasin, mêmes actions serveur : ce qui est saisi
 * ici est exactement ce qui serait saisi depuis le bureau, et part au journal
 * d'activité au nom du magasinier connecté. */

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Magasin PF — saisie mobile",
  robots: { index: false, follow: false },
};

export default async function MagasinMobilePage() {
  const user = await getUser();
  if (!user) redirect("/login?suite=%2Fm%2Fmagasin");
  const role = userRole(user);

  const modules = await getRoleModules(role);
  const entree = NAV_STRUCTURE.flatMap((g) => g.items).find((i) => i.id === "magasin");
  const autorise = !!entree && entreeAutorisee(entree, modules) && ROLES_SAISIE_MAGASIN.includes(role);

  if (!autorise) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
        <div className="max-w-sm rounded-2xl bg-white p-6 text-center shadow">
          <div className="text-4xl">🔒</div>
          <h1 className="mt-2 text-lg font-bold">Saisie réservée au magasin</h1>
          <p className="mt-2 text-sm text-slate-600">
            Le compte <b>{user.name}</b> n&apos;a pas le droit de saisir les réceptions. Demandez à l&apos;administrateur
            un compte avec le rôle « Magasin produits finis ».
          </p>
        </div>
      </div>
    );
  }

  const [commandes, brs, mouvements] = await Promise.all([
    listCommandesAval({ archived: false }),
    listBr(),
    listMouvements(),
  ]);
  const jour = todayISO();
  const listes = listesReception(commandes);

  const saisies: SaisieJour[] = [
    ...brs
      .filter((b) => b.date === jour)
      .map((b) => ({
        cle: `br${b.id}`,
        genre: "br" as const,
        id: b.id,
        libelle: `${b.numero} · ${b.faconnier}`,
        of: b.of,
        modele: b.modele,
        qte: b.qteOk,
        detail: b.controle === "refuse" ? `lot refusé (${b.qteRecue} reçues)` : b.qteNc ? `${b.qteRecue} reçues · ${b.qteNc} NC` : `${b.qteRecue} reçues`,
      })),
    ...mouvements
      .filter((m) => m.date === jour && m.cle.startsWith("m") && m.type === ORIGINES_MOUVEMENT.interne.label)
      .map((m) => ({
        cle: m.cle,
        genre: "interne" as const,
        id: Number(m.cle.slice(1)),
        libelle: "Production interne",
        of: m.of,
        modele: m.modele,
        qte: m.qte,
        detail: m.note,
      })),
  ];

  const leger = <T extends (typeof commandes)[number]>(c: T) => ({
    id: c.id,
    of: c.of,
    modele: c.modele,
    couleur: c.couleur,
    client: c.client,
    faconnier: c.faconnier,
    chaine: c.chaine,
    qte: c.qte,
    produit: c.produit,
    stockQte: c.stockQte,
    produitGpao: c.produitGpao,
    gpaoExcedent: c.gpaoExcedent,
    entreesInternes: c.entreesInternes,
  });

  return (
    <MagasinMobile
      utilisateur={user.name}
      jour={jour}
      internes={listes.internes.map((c) => ({ ...leger(c), aEntrer: c.aEntrer }))}
      faconniers={listes.faconniers.map((f) => ({
        faconnier: f.faconnier,
        commandes: f.commandes.map((c) => ({ ...leger(c), reste: c.reste })),
      }))}
      saisies={saisies}
    />
  );
}
