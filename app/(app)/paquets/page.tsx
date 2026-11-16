import { requireUser, userRole } from "@/lib/auth/server";
import { listCommandesInternes } from "@/lib/services/gpao";
import * as svc from "@/lib/services/paquets";
import * as pq from "@/lib/domain/paquet";
import { PaquetsClient } from "./paquets-client";

/* SUIVI PAR PAQUETS — où en est chaque paquet, de la coupe à l'assemblage.
 *
 * Les paquets naissent à la validation d'une fiche de coupe ; ils meurent à
 * l'assemblage, où les pièces entières reprennent le circuit habituel. Cet
 * écran ne compte aucune production : il montre où sont les morceaux.
 *
 * L'OF affiché passe par l'adresse (?of=) : le serveur ne charge que les
 * paquets de celui-là, pas les milliers des autres. */

export default async function PaquetsPage({ searchParams }: { searchParams: Promise<{ of?: string; onglet?: string }> }) {
  const user = await requireUser();
  const role = userRole(user);
  const sp = await searchParams;
  const [actif, roles, ofs, gabarits, commandesInternes, sansPaquets] = await Promise.all([
    svc.suiviPaquetsActif(),
    svc.rolesTournee(),
    svc.ofsAvecPaquets(),
    svc.listGabarits(),
    listCommandesInternes(),
    svc.fichesSansPaquets(),
  ]);
  const demande = Number(sp.of) || 0;
  const courant = ofs.find((o) => o.commandeId === demande) ?? ofs[0] ?? null;
  const paquets = courant ? await svc.paquetsDeCommande(courant.commandeId) : [];
  /* Ce que la CHAÎNE a fait, lu dans la saisie horaire de la GPAO : la
   * grille l'affiche sans rien réenregistrer. */
  const passages = courant ? await svc.passagesEnChaine([courant.commandeId]) : new Map();

  return (
    <PaquetsClient
      actif={actif}
      roles={roles}
      ofs={ofs}
      ofCourant={courant?.commandeId ?? null}
      paquets={paquets.map((p) => ({
        id: p.id,
        code: p.code,
        numero: p.numero,
        taille: p.taille,
        qte: pq.qteEffective(p),
        qteImprimee: p.qte,
        pieceDebut: p.pieceDebut,
        pieceFin: p.pieceFin,
        statut: p.statut,
        cases: p.etat.cases,
        assemble: p.etat.assemble,
        assembleLe: p.etat.assembleLe,
        assemblePar: p.etat.assemblePar,
        avancement: p.etat.avancement,
        chaine: passages.get(p.id) ?? null,
      }))}
      gabarits={gabarits.map((g) => ({ id: g.id, nom: g.nom, liasses: g.liasses }))}
      commandes={commandesInternes.map((c) => ({ id: c.id, of: c.of, modele: c.modele }))}
      ongletInitial={sp.onglet === "reglages" ? "reglages" : "grille"}
      peutRelever={await svc.peutRelever(role)}
      peutRegler={["admin", "resp"].includes(role)}
      fichesSansPaquets={sansPaquets.map((f) => ({ id: f.id, numero: f.numero, date: f.date }))}
    />
  );
}
