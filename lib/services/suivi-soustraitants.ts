import "server-only";
import { and, asc, desc, eq, gte, inArray, isNotNull, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { br, client, commande, faconnier, portailAcces, stDeclaration, stLivraison, stRapportCoupe, stReceptionTissu, tissuMouvement, tissuRouleau } from "@/lib/db/schema";
import * as st from "@/lib/domain/soustraitant";
import { todayISO } from "@/lib/domain/commande";
import { setSetting } from "@/lib/services/permissions";
import { getPlan } from "@/lib/services/plan-coupe";
import { attenduDeLOf, validerFiche } from "@/lib/services/coupe";
import { messageBureau, type Moi } from "@/lib/services/messagerie";
import { journal } from "@/lib/services/portail-acces";
import { reglagesSt } from "@/lib/services/portail-soustraitant";
import * as pc from "@/lib/domain/plan-coupe";

/* SUIVI DES SOUS-TRAITANTS — côté bureau.
 *
 * Ce que les ateliers ont déclaré sur leur portail, à côté de ce que VOUS avez
 * validé. Les déclarations n'écrivent jamais la production : une livraison
 * annoncée devient réalité quand le magasin la valide à l'arrivée, ce qui
 * crée le BR habituel (lib/services/aval.ts → creerBr). */

const iso = (d: unknown) => (d instanceof Date ? d.toISOString() : d ? String(d) : "");
const jourIso = (d: unknown) => iso(d).slice(0, 10);
const r2 = (n: number) => Math.round(n * 100) / 100 + 0;

export { reglagesSt };
export async function enregistrerReglagesSt(v: { montrerClient: boolean; delai: number }) {
  const delai = Math.round(Number(v.delai));
  if (!Number.isFinite(delai) || delai < 0 || delai > 60) throw new Error("Délai entre 0 et 60 jours.");
  await setSetting(st.CLE_MONTRER_CLIENT, !!v.montrerClient);
  await setSetting(st.CLE_DELAI_RETOUR, delai);
}

export type LivraisonBureau = {
  id: number;
  numero: string;
  statut: string;
  atelier: string;
  faconnierId: number;
  commandeId: number;
  of: string;
  modele: string;
  couleur: string;
  client: string;
  annonceeLe: string;
  recueLe: string;
  recuePar: string;
  par: string;
  lignes: st.Ligne[];
  recues: st.Ligne[];
  motif: string;
  note: string;
  brNumero: string;
  prixFacon: number | null;
};
export type LigneSuivi = {
  commandeId: number;
  of: string;
  modele: string;
  couleur: string;
  client: string;
  atelier: string;
  qte: number;
  coupe: number;
  recuValide: number;
  exportPrevu: string;
  aLivrerLe: string | null;
  derniere: { jour: string; lance: number; produit: number; emballe: number; alertes: string[]; par: string } | null;
  sansNouvelle: boolean;
  finEstimee: string | null;
  enRetard: boolean;
  montantDu: number;
};
export type RapportBureau = {
  id: number;
  atelier: string;
  commandeId: number;
  of: string;
  modele: string;
  statut: string;
  le: string;
  par: string;
  coupe: { of: string; parTaille: Record<string, number> }[];
  rouleaux: { code: string; consomme: number; chute: number; reste: number }[];
  note: string;
  motifRefus: string;
  ficheId: number | null;
};
export type EcartTissu = { id: number; atelier: string; rouleau: string; of: string; etat: string; envoye: number; constate: number | null; note: string; le: string };
export type FiabiliteAtelier = { atelier: string } & ReturnType<typeof st.fiabilite>;

async function livraisons(filtre: { statut?: string; numero?: string; depuis?: Date }) {
  const conds = [];
  if (filtre.statut) conds.push(eq(stLivraison.statut, filtre.statut));
  if (filtre.numero) conds.push(eq(stLivraison.numero, filtre.numero));
  if (filtre.depuis) conds.push(gte(stLivraison.annonceeLe, filtre.depuis));
  const rows = await db
    .select({ l: stLivraison, atelier: faconnier.nom, of: commande.ofNumber, modele: commande.modele, couleur: commande.couleur, client: client.nom, prixFacon: commande.prixFacon, brNumero: br.numero })
    .from(stLivraison)
    .innerJoin(commande, eq(stLivraison.commandeId, commande.id))
    .innerJoin(faconnier, eq(stLivraison.faconnierId, faconnier.id))
    .leftJoin(client, eq(commande.clientId, client.id))
    .leftJoin(br, eq(stLivraison.brId, br.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(stLivraison.id))
    .limit(300);
  return rows.map(
    (r): LivraisonBureau => ({
      id: r.l.id, numero: r.l.numero, statut: r.l.statut, atelier: r.atelier, faconnierId: r.l.faconnierId, commandeId: r.l.commandeId, of: r.of, modele: r.modele,
      couleur: r.couleur, client: r.client ?? "", annonceeLe: iso(r.l.annonceeLe), recueLe: iso(r.l.recueLe), recuePar: r.l.recuePar, par: r.l.par,
      lignes: r.l.lignes, recues: r.l.lignesRecues, motif: r.l.motif, note: r.l.note, brNumero: r.brNumero ?? "", prixFacon: r.prixFacon,
    }),
  );
}

/** Pour le bandeau du magasin produits finis. */
export async function livraisonsAnnoncees() {
  return (await livraisons({ statut: "annoncee" })).map((l) => ({ numero: l.numero, atelier: l.atelier, of: l.of, pieces: l.lignes.reduce((s, x) => s + x.premier + x.second, 0) }));
}

export const compterAValider = async () => {
  const [l, r] = await Promise.all([
    db.select({ id: stLivraison.id }).from(stLivraison).where(eq(stLivraison.statut, "annoncee")),
    db.select({ id: stRapportCoupe.id }).from(stRapportCoupe).where(eq(stRapportCoupe.statut, "annonce")),
  ]);
  return l.length + r.length;
};

export async function suiviSt() {
  const aujourdhui = todayISO();
  const reglages = await reglagesSt();
  // Ateliers qui ont un portail ouvert : eux seuls sont attendus le soir.
  const ateliers = await db.select({ id: portailAcces.faconnierId }).from(portailAcces).where(and(eq(portailAcces.type, "soustraitant"), eq(portailAcces.actif, true), isNotNull(portailAcces.faconnierId)));
  const idsAteliers = [...new Set(ateliers.map((a) => a.id!))];

  const cmds = idsAteliers.length
    ? await db
        .select({
          id: commande.id, of: commande.ofNumber, modele: commande.modele, couleur: commande.couleur, qte: commande.qte, coupe: commande.coupeQte,
          dateExport: commande.dateExport, exportPrev: commande.exportPrev, prixFacon: commande.prixFacon, client: client.nom, atelier: faconnier.nom,
        })
        .from(commande)
        .innerJoin(faconnier, eq(commande.faconnierId, faconnier.id))
        .leftJoin(client, eq(commande.clientId, client.id))
        .where(and(inArray(commande.faconnierId, idsAteliers), eq(commande.archived, false)))
        .orderBy(asc(commande.dateExport))
    : [];
  const ids = cmds.map((c) => c.id);
  const [decls, recus, aValider, recentes, rapports, ecarts] = await Promise.all([
    ids.length ? db.select().from(stDeclaration).where(inArray(stDeclaration.commandeId, ids)).orderBy(asc(stDeclaration.id)) : Promise.resolve([]),
    ids.length ? db.select({ commandeId: br.commandeId, qteOk: br.qteOk }).from(br).where(inArray(br.commandeId, ids)) : Promise.resolve([]),
    livraisons({ statut: "annoncee" }),
    livraisons({ depuis: new Date(Date.now() - 90 * 86_400_000) }),
    listRapports(),
    ecartsTissu(),
  ]);

  const lignes: LigneSuivi[] = cmds.map((c) => {
    const d = decls.filter((x) => x.commandeId === c.id);
    const der = d.at(-1);
    const parJour = new Map<string, number>();
    for (const x of d) parJour.set(jourIso(x.jour), x.produit);
    const total = c.coupe > 0 ? c.coupe : c.qte;
    const exportPrevu = jourIso(c.exportPrev) || jourIso(c.dateExport);
    const aLivrerLe = st.dateALivrer(exportPrevu || null, reglages.delai);
    const finEstimee = st.dateFinEstimee([...parJour].map(([jour, produit]) => ({ jour, produit })), total, aujourdhui);
    const recuValide = recus.filter((r) => r.commandeId === c.id).reduce((s, r) => s + (r.qteOk || 0), 0);
    const premierRecu = recentes.filter((l) => l.commandeId === c.id && l.statut === "recue").reduce((s, l) => s + st.totalLignes(l.recues).premier, 0);
    return {
      commandeId: c.id, of: c.of, modele: c.modele, couleur: c.couleur, client: c.client ?? "", atelier: c.atelier, qte: c.qte, coupe: c.coupe, recuValide, exportPrevu, aLivrerLe,
      derniere: der ? { jour: jourIso(der.jour), lance: der.lance, produit: der.produit, emballe: der.emballe, alertes: der.alertes, par: der.par } : null,
      sansNouvelle: recuValide < c.qte && st.sansNouvelle(der ? jourIso(der.jour) : null, aujourdhui),
      finEstimee,
      enRetard: !!(aLivrerLe && finEstimee && finEstimee > aLivrerLe),
      montantDu: st.montantDu(premierRecu, c.prixFacon),
    };
  });

  const parAtelier = new Map<string, { annonce: st.Ligne[]; recu: st.Ligne[] }[]>();
  for (const l of recentes.filter((x) => x.statut === "recue")) parAtelier.set(l.atelier, [...(parAtelier.get(l.atelier) ?? []), { annonce: l.lignes, recu: l.recues }]);
  const fiabilite: FiabiliteAtelier[] = [...parAtelier].map(([atelier, ls]) => ({ atelier, ...st.fiabilite(ls) }));

  return { aujourdhui, reglages, lignes, aValider, recentes: recentes.filter((l) => l.statut !== "annoncee").slice(0, 60), rapports, ecarts, fiabilite };
}

/* ═══════════ réception d'une livraison annoncée ═══════════ */

export async function livraisonBureau(numero: string) {
  const [l] = await livraisons({ numero });
  if (!l) return null;
  const attendu = await attenduDeLOf(l.commandeId);
  const autres = (await livraisons({})).filter((x) => x.commandeId === l.commandeId && x.id !== l.id && x.statut !== "annulee");
  const deja: Record<string, number> = {};
  for (const x of autres) for (const y of x.statut === "recue" ? x.recues : x.lignes) deja[y.taille] = (deja[y.taille] ?? 0) + y.premier + y.second;
  return { livraison: l, attendu, comparaison: st.comparerAuPlan(l.lignes, attendu.parTaille, deja) };
}

/** Bloque la livraison pendant qu'on crée le BR (deux clics ne font pas deux BR). */
export async function reserverLivraison(numero: string, recuesBrutes: st.Ligne[]) {
  const d = await livraisonBureau(numero);
  if (!d) throw new Error("Livraison introuvable.");
  if (d.livraison.statut !== "annoncee") throw new Error(d.livraison.statut === "recue" ? "Cette livraison est déjà reçue." : "Cette livraison a été retirée par l'atelier.");
  const tailles = [...new Set([...d.attendu.sizes, ...Object.keys(d.attendu.parTaille), ...d.livraison.lignes.map((l) => l.taille)])];
  const recues = st.lignesPropres(recuesBrutes.map((l) => ({ taille: String(l.taille), premier: Number(l.premier), second: Number(l.second) })), tailles);
  const b = st.versBr(recues);
  if (b.qteRecue <= 0) throw new Error("Indiquez les pièces reçues (ou laissez l'atelier retirer la livraison).");
  const pris = await db
    .update(stLivraison)
    .set({ statut: "en_reception" })
    .where(and(eq(stLivraison.id, d.livraison.id), eq(stLivraison.statut, "annoncee")))
    .returning({ id: stLivraison.id });
  if (!pris.length) throw new Error("Cette livraison vient d'être prise en charge par quelqu'un d'autre.");
  return { ...d, recues, br: b };
}

export async function relacherLivraison(id: number) {
  await db.update(stLivraison).set({ statut: "annoncee" }).where(and(eq(stLivraison.id, id), eq(stLivraison.statut, "en_reception")));
}

export async function marquerRecue(id: number, recues: st.Ligne[], brNumero: string, moi: Moi) {
  const [b] = await db.select({ id: br.id }).from(br).where(eq(br.numero, brNumero));
  const [l] = await db
    .update(stLivraison)
    .set({ statut: "recue", lignesRecues: recues, recueLe: new Date(), recuePar: moi.nom, brId: b?.id ?? null })
    .where(eq(stLivraison.id, id))
    .returning();
  if (!l) return;
  const e = st.ecartAnnonce(l.lignes, recues).filter((x) => x.ecart !== 0);
  const t = st.totalLignes(recues);
  const texte = `✅ Livraison ${l.numero} reçue : ${t.premier} en 1er choix${t.second ? `, ${t.second} en 2e choix` : ""} (${brNumero}).${
    e.length ? ` Écart avec l'annonce : ${e.map((x) => `${x.taille} ${x.ecart > 0 ? "+" : ""}${x.ecart}`).join(", ")}.` : ""
  }`;
  if (l.accesId) {
    const [a] = await db.select({ conv: portailAcces.conversationId }).from(portailAcces).where(eq(portailAcces.id, l.accesId));
    await journal(l.accesId, "livraison", l.commandeId, texte);
    if (a?.conv) await messageBureau(a.conv, moi, texte, l.commandeId).catch(() => 0);
  }
}

/* ═══════════ rapports de coupe ═══════════ */

async function listRapports(): Promise<RapportBureau[]> {
  const rows = await db
    .select({ r: stRapportCoupe, atelier: faconnier.nom, of: commande.ofNumber, modele: commande.modele })
    .from(stRapportCoupe)
    .innerJoin(commande, eq(stRapportCoupe.commandeId, commande.id))
    .innerJoin(faconnier, eq(stRapportCoupe.faconnierId, faconnier.id))
    .orderBy(desc(stRapportCoupe.id))
    .limit(60);
  const ofIds = [...new Set(rows.flatMap((x) => Object.keys(x.r.coupe).map(Number)))];
  const ofs = ofIds.length ? await db.select({ id: commande.id, of: commande.ofNumber }).from(commande).where(inArray(commande.id, ofIds)) : [];
  const nomOf = new Map(ofs.map((o) => [o.id, o.of]));
  return rows.map(({ r, atelier, of, modele }) => ({
    id: r.id, atelier, commandeId: r.commandeId, of, modele, statut: r.statut, le: iso(r.createdAt), par: r.par,
    coupe: Object.entries(r.coupe).map(([id, parTaille]) => ({ of: nomOf.get(Number(id)) ?? id, parTaille })),
    rouleaux: r.rouleaux, note: r.note, motifRefus: r.motifRefus, ficheId: r.ficheId,
  }));
}

async function prevenirAtelier(accesId: number | null, moi: Moi, texte: string, commandeId: number) {
  if (!accesId) return;
  const [a] = await db.select({ conv: portailAcces.conversationId }).from(portailAcces).where(eq(portailAcces.id, accesId));
  await journal(accesId, "coupe_rapport", commandeId, texte);
  if (a?.conv) await messageBureau(a.conv, moi, texte, commandeId).catch(() => 0);
}

/** Valide le rapport : il devient une fiche de coupe « sous-traitée » (pas de
 * paquets), qui écrit le coupé et la consommation des rouleaux comme chez
 * vous. Le reste déclaré reste dehors : c'est le retour attendu. */
export async function validerRapport(id: number, v: { motif: string; precision: string }, moi: Moi) {
  const [r] = await db.select().from(stRapportCoupe).where(eq(stRapportCoupe.id, id));
  if (!r) throw new Error("Rapport introuvable.");
  if (r.statut !== "annonce") throw new Error("Ce rapport a déjà été traité.");
  const plan = await getPlan(r.commandeId);
  /* Garde-fou : un OF déjà coupé (chez vous ou par un rapport précédent) ne
   * se recoupe pas sans le dire — sinon le coupé compterait deux fois. */
  const ofIds = Object.keys(r.coupe).map(Number);
  const deja = ofIds.length ? await db.select({ of: commande.ofNumber, coupe: commande.coupeQte }).from(commande).where(inArray(commande.id, ofIds)) : [];
  const dejaCoupes = deja.filter((d) => d.coupe > 0);
  if (dejaCoupes.length && v.motif !== "complement") {
    throw new Error(
      `${dejaCoupes.map((d) => `${d.of} a déjà ${d.coupe} pièces coupées`).join(", ")} : choisissez le motif « Complément coupe » si c'est bien une coupe en plus, sinon renvoyez le rapport à l'atelier.`,
    );
  }
  const coupe: Record<number, Record<string, number>> = {};
  for (const [of, parTaille] of Object.entries(r.coupe)) coupe[Number(of)] = parTaille;
  const fiche = await validerFiche(
    {
      commandeId: r.commandeId,
      date: todayISO(),
      type: "soustraite",
      coupe,
      motif: v.motif ?? "",
      precision: v.precision ?? "",
      note: `Rapport de coupe de l'atelier (${r.par})${r.note ? ` — ${r.note}` : ""}`,
      matiereRang: plan ? (pc.matierePrincipale(plan)?.rang ?? 0) : 0,
      consommations: r.rouleaux.map((x) => ({ code: x.code, consomme: x.consomme, chute: x.chute })),
    },
    moi.nom,
  );
  const fait = await db
    .update(stRapportCoupe)
    .set({ statut: "valide", traiteLe: new Date(), traitePar: moi.nom, ficheId: fiche.id })
    .where(and(eq(stRapportCoupe.id, id), eq(stRapportCoupe.statut, "annonce")))
    .returning({ id: stRapportCoupe.id });
  if (!fait.length) throw new Error("Ce rapport a déjà été traité.");
  const reste = r.rouleaux.reduce((s, x) => s + x.reste, 0);
  await prevenirAtelier(r.accesId, moi, `✅ Rapport de coupe validé (${fiche.numero}).${reste > 0 ? ` Merci de nous rendre ${r2(reste)} m de reste.` : ""}`, r.commandeId);
  return fiche;
}

export async function refuserRapport(id: number, motif: string, moi: Moi) {
  const m = (motif ?? "").trim();
  if (m.length < 3) throw new Error("Dites à l'atelier ce qui ne va pas.");
  const [r] = await db
    .update(stRapportCoupe)
    .set({ statut: "refuse", traiteLe: new Date(), traitePar: moi.nom, motifRefus: m.slice(0, 300) })
    .where(and(eq(stRapportCoupe.id, id), eq(stRapportCoupe.statut, "annonce")))
    .returning();
  if (!r) throw new Error("Ce rapport a déjà été traité.");
  await prevenirAtelier(r.accesId, moi, `↩ Rapport de coupe à refaire : ${m}`, r.commandeId);
}

/* ═══════════ tissu : écarts signalés ═══════════ */

async function ecartsTissu(): Promise<EcartTissu[]> {
  const rows = await db
    .select({ r: stReceptionTissu, quantite: tissuMouvement.quantite, atelier: tissuMouvement.faconnierNom, rouleau: tissuRouleau.code, of: commande.ofNumber })
    .from(stReceptionTissu)
    .innerJoin(tissuMouvement, eq(stReceptionTissu.mouvementId, tissuMouvement.id))
    .leftJoin(tissuRouleau, eq(tissuMouvement.rouleauId, tissuRouleau.id))
    .leftJoin(commande, eq(tissuMouvement.commandeId, commande.id))
    .where(and(ne(stReceptionTissu.etat, "recu"), gte(stReceptionTissu.createdAt, new Date(Date.now() - 60 * 86_400_000))))
    .orderBy(desc(stReceptionTissu.id))
    .limit(50);
  return rows.map(({ r, quantite, atelier, rouleau, of }) => ({
    id: r.id, atelier, rouleau: rouleau ?? "", of: of ?? "", etat: r.etat, envoye: r2(quantite), constate: r.metrageConstate, note: r.note, le: iso(r.createdAt),
  }));
}
