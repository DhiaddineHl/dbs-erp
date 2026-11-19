import "server-only";
import { and, asc, desc, eq, gte, inArray, ne, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { br, client, commande, faconnier, stDeclaration, stLivraison, stRapportCoupe, stReceptionTissu, tissuLot, tissuMouvement, tissuRouleau } from "@/lib/db/schema";
import * as st from "@/lib/domain/soustraitant";
import * as cp from "@/lib/domain/coupe";
import * as pv from "@/lib/domain/pv-client";
import { todayISO } from "@/lib/domain/commande";
import { getSetting } from "@/lib/services/permissions";
import { getPlan } from "@/lib/services/plan-coupe";
import { attenduDeLOf, contexteCoupe, demandeDeCoupe, lignesCoupeValides, porteurDe } from "@/lib/services/coupe";
import { filPortail, messageExterieur } from "@/lib/services/messagerie";
import { journal, type Acces } from "@/lib/services/portail-acces";

/* PORTAIL SOUS-TRAITANT — ce que l'atelier voit et ce qu'il DÉCLARE.
 *
 * Liste fermée, champ par champ : ses commandes (OF, modèle, couleur,
 * quantités, prix de FAÇON, dates), le plan de coupe, ses livraisons, le tissu
 * que vous lui avez envoyé. Jamais le prix de vente ni ce que gagne l'usine ;
 * le nom du client seulement si le réglage le permet (non par défaut). Un test
 * (lib/domain/soustraitant.test.ts) y veille.
 *
 * Ce qu'il déclare n'est PAS de la production : `commande.produit` reste
 * calculé par lib/services/avancement.ts, depuis les BR que vous validez. */

const iso = (d: unknown) => (d instanceof Date ? d.toISOString() : d ? String(d) : "");
const jourIso = (d: unknown) => iso(d).slice(0, 10);
const r2 = (n: number) => Math.round(n * 100) / 100 + 0;

export async function reglagesSt() {
  const [montrerClient, delai] = await Promise.all([
    getSetting<boolean>(st.CLE_MONTRER_CLIENT, false),
    getSetting<number>(st.CLE_DELAI_RETOUR, st.DELAI_RETOUR_DEFAUT),
  ]);
  return { montrerClient: !!montrerClient, delai: Number(delai) || 0 };
}

/* ═══════════ vue ═══════════ */

export type DeclarationSt = { jour: string; lance: number; produit: number; emballe: number; alertes: string[]; le: string };
export type LivraisonSt = { numero: string; statut: string; annonceeLe: string; recueLe: string; lignes: st.Ligne[]; recues: st.Ligne[]; motif: string; note: string };
export type TraceSt = { nom: string; longueur: number; plis: number; pieces: string };
export type CommandeSt = {
  id: number;
  of: string;
  modele: string;
  reference: string;
  couleur: string;
  qte: number;
  /** null sauf si le réglage « montrer le client » est activé. */
  client: string | null;
  prixFacon: number | null;
  exportPrevu: string;
  aLivrerLe: string | null;
  tailles: string[];
  attendu: Record<string, number>;
  sourceAttendu: "coupe" | "plan" | "commande";
  dejaLivre: Record<string, number>;
  coupe: number;
  /** Reçu et validé chez nous (BR) : ce qui compte vraiment. */
  recuValide: number;
  /** Avancement : cible, cumuls déclarés, reçu, journal jour par jour, livrée ? */
  avancement: Avancement;
  declaration: DeclarationSt | null;
  finEstimee: string | null;
  plan: { matiere: string; traces: TraceSt[] }[];
  livraisons: LivraisonSt[];
  porteurId: number;
};
export type EnvoiTissu = {
  mouvementId: number;
  date: string;
  bon: string;
  rouleau: string;
  tissu: string;
  couleur: string;
  bain: string;
  metrage: number;
  unite: string;
  of: string;
  modele: string;
  commandeId: number | null;
  etat: "" | st.EtatReception;
  metrageConstate: number | null;
  noteReception: string;
};
export type RapportSt = { id: number; of: string; statut: string; le: string; motifRefus: string };
export type VueSt = {
  atelier: string;
  personne: string;
  commandes: CommandeSt[];
  tissu: EnvoiTissu[];
  rapports: RapportSt[];
  messages: { id: number; auteur: string; interne: boolean; texte: string; commande: string; le: string }[];
  aujourdhui: string;
};

async function commandesDeLAtelier(faconnierId: number) {
  return db
    .select({
      id: commande.id, of: commande.ofNumber, modele: commande.modele, reference: commande.refArticle, couleur: commande.couleur,
      qte: commande.qte, prixFacon: commande.prixFacon, dateExport: commande.dateExport, exportPrev: commande.exportPrev,
      coupe: commande.coupeQte, parentId: commande.parentId, clientNom: client.nom, archived: commande.archived,
    })
    .from(commande)
    .leftJoin(client, eq(commande.clientId, client.id))
    // En cours, et celles rangées depuis moins de 120 jours (ses archives).
    .where(and(eq(commande.faconnierId, faconnierId), or(eq(commande.archived, false), gte(commande.updatedAt, new Date(Date.now() - 120 * 86_400_000)))))
    .orderBy(asc(commande.dateExport), asc(commande.id));
}

/** La commande appartient-elle à cet atelier ? (chaque action le revérifie) */
export async function commandeDeLAtelier(faconnierId: number, commandeId: number) {
  const [c] = await db
    .select({ id: commande.id, of: commande.ofNumber, qte: commande.qte, coupe: commande.coupeQte, prixFacon: commande.prixFacon })
    .from(commande)
    .where(and(eq(commande.id, commandeId), eq(commande.faconnierId, faconnierId), eq(commande.archived, false)));
  return c ?? null;
}

function lignesLivrees(ls: { statut: string; lignes: st.Ligne[]; lignesRecues: st.Ligne[] }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of ls) {
    if (l.statut === "annulee") continue;
    for (const x of l.statut === "recue" ? l.lignesRecues : l.lignes) out[x.taille] = (out[x.taille] ?? 0) + x.premier + x.second;
  }
  return out;
}

/* ═══════════ avancement d'une commande confiée ═══════════ */

export type Avancement = {
  /** Ce qu'on attend de l'atelier : le coupé, sinon la quantité commandée. */
  cible: number;
  qte: number;
  coupe: number;
  /** Derniers cumuls déclarés (saisie du soir). */
  lance: number;
  produit: number;
  emballe: number;
  /** Reçu chez nous (BR) : 1er + 2e choix, dont conforme. */
  recu: number;
  recuOk: number;
  reste: number;
  livree: boolean;
  journal: st.JourAvancement[];
  finEstimee: string | null;
  /** Historique (jour → produit cumulé), pour le rythme de l'atelier. */
  historique: { jour: string; produit: number }[];
};

/** Avancement de commandes : coupe jour par jour (lignes de coupe valides),
 * lancé / produit (saisies du soir), livré (BR). Lecture seule — partagé par
 * le portail de l'atelier et l'écran « Suivi sous-traitants ». */
export async function avancementCommandes(ids: number[], aujourdhui = todayISO()): Promise<Map<number, Avancement>> {
  const out = new Map<number, Avancement>();
  if (!ids.length) return out;
  const [cmds, coupes, decls, brs, livs] = await Promise.all([
    db.select({ id: commande.id, qte: commande.qte, coupe: commande.coupeQte, archived: commande.archived }).from(commande).where(inArray(commande.id, ids)),
    lignesCoupeValides(ids),
    db.select().from(stDeclaration).where(inArray(stDeclaration.commandeId, ids)).orderBy(asc(stDeclaration.jour), asc(stDeclaration.id)),
    db.select({ commandeId: br.commandeId, date: br.date, qteRecue: br.qteRecue, qteOk: br.qteOk }).from(br).where(inArray(br.commandeId, ids)),
    db.select({ commandeId: stLivraison.commandeId, motif: stLivraison.motif, recueLe: stLivraison.recueLe }).from(stLivraison).where(and(inArray(stLivraison.commandeId, ids), eq(stLivraison.statut, "recue"))),
  ]);
  for (const c of cmds) {
    const d = decls.filter((x) => x.commandeId === c.id);
    const parJour = new Map<string, { lance: number; produit: number }>();
    for (const x of d) parJour.set(jourIso(x.jour), { lance: x.lance, produit: x.produit });
    const der = d.at(-1);
    const b = brs.filter((x) => x.commandeId === c.id);
    const recu = b.reduce((s2, x) => s2 + (x.qteRecue || 0), 0);
    const cible = c.coupe > 0 ? c.coupe : c.qte;
    const derniereRecue = livs.filter((l) => l.commandeId === c.id).sort((a, z) => iso(a.recueLe).localeCompare(iso(z.recueLe))).at(-1) ?? null;
    const etat = st.etatLivraison({ attendu: cible, recu, archivee: c.archived, derniereRecue });
    const historique = [...parJour].map(([jour, v]) => ({ jour, produit: v.produit }));
    out.set(c.id, {
      cible,
      qte: c.qte,
      coupe: c.coupe,
      lance: der?.lance ?? 0,
      produit: der?.produit ?? 0,
      emballe: der?.emballe ?? 0,
      recu,
      recuOk: b.reduce((s2, x) => s2 + (x.qteOk || 0), 0),
      reste: etat.reste,
      livree: etat.livree,
      journal: st.journalJourParJour({
        coupe: coupes.filter((x) => x.commandeId === c.id).map((x) => ({ date: jourIso(x.date), qte: x.qte })),
        declarations: [...parJour].map(([jour, v]) => ({ jour, ...v })),
        livraisons: b.map((x) => ({ date: jourIso(x.date), pieces: x.qteRecue })),
      }),
      finEstimee: etat.livree ? null : st.dateFinEstimee(historique, cible, aujourdhui),
      historique,
    });
  }
  return out;
}

export async function vueSt(acces: Acces): Promise<VueSt | null> {
  if (acces.faconnierId == null) return null;
  const [f] = await db.select({ nom: faconnier.nom }).from(faconnier).where(eq(faconnier.id, acces.faconnierId));
  if (!f) return null;
  const reglages = await reglagesSt();
  const rows = await commandesDeLAtelier(acces.faconnierId);
  const ids = rows.map((r) => r.id);
  const aujourdhui = todayISO();

  const [decls, livs, recus, rapports, tissu, messages, avancements] = await Promise.all([
    ids.length ? db.select().from(stDeclaration).where(inArray(stDeclaration.commandeId, ids)).orderBy(asc(stDeclaration.jour), asc(stDeclaration.id)) : Promise.resolve([]),
    ids.length ? db.select().from(stLivraison).where(inArray(stLivraison.commandeId, ids)).orderBy(desc(stLivraison.id)) : Promise.resolve([]),
    ids.length
      ? db.select({ commandeId: br.commandeId, ok: sql<number>`coalesce(sum(${br.qteOk}),0)::int` }).from(br).where(inArray(br.commandeId, ids)).groupBy(br.commandeId)
      : Promise.resolve([] as { commandeId: number | null; ok: number }[]),
    db
      .select({ id: stRapportCoupe.id, of: commande.ofNumber, statut: stRapportCoupe.statut, le: stRapportCoupe.createdAt, motifRefus: stRapportCoupe.motifRefus })
      .from(stRapportCoupe)
      .innerJoin(commande, eq(stRapportCoupe.commandeId, commande.id))
      .where(eq(stRapportCoupe.faconnierId, acces.faconnierId))
      .orderBy(desc(stRapportCoupe.id))
      .limit(30),
    tissuEnvoye(acces.faconnierId),
    acces.conversationId != null ? filPortail(acces.conversationId) : Promise.resolve([]),
    avancementCommandes(ids, aujourdhui),
  ]);
  const recuParCmd = new Map(recus.map((r) => [Number(r.commandeId), Number(r.ok)]));

  const commandes: CommandeSt[] = [];
  for (const r of rows) {
    const [attendu, porteurId] = await Promise.all([attenduDeLOf(r.id), porteurDe(r.id)]);
    const plan = porteurId != null ? await getPlan(porteurId) : null;
    const mesDecls = decls.filter((d) => d.commandeId === r.id);
    const der = mesDecls.at(-1);
    const av = avancements.get(r.id)!;
    const mesLivs = livs.filter((l) => l.commandeId === r.id);
    const exportPrevu = jourIso(r.exportPrev) || jourIso(r.dateExport);
    commandes.push({
      id: r.id,
      of: r.of,
      modele: r.modele,
      reference: r.reference,
      couleur: r.couleur,
      qte: r.qte,
      client: reglages.montrerClient ? r.clientNom ?? "" : null,
      prixFacon: r.prixFacon,
      exportPrevu,
      aLivrerLe: st.dateALivrer(exportPrevu || null, reglages.delai),
      tailles: attendu.sizes.length ? attendu.sizes : Object.keys(attendu.parTaille),
      attendu: attendu.parTaille,
      sourceAttendu: attendu.source,
      dejaLivre: lignesLivrees(mesLivs),
      coupe: r.coupe,
      recuValide: recuParCmd.get(r.id) ?? 0,
      avancement: av,
      declaration: der ? { jour: jourIso(der.jour), lance: der.lance, produit: der.produit, emballe: der.emballe, alertes: der.alertes, le: iso(der.createdAt) } : null,
      finEstimee: av.finEstimee,
      plan: (plan?.matieres ?? []).map((m) => ({
        matiere: m.nom,
        traces: m.traces.map((t) => ({
          nom: t.nom,
          longueur: t.longueur,
          plis: t.plis,
          pieces: Object.entries(t.qty ?? {})
            .filter(([, q]) => Number(q) > 0)
            .map(([s, q]) => `${s}×${q}`)
            .join(" "),
        })),
      })),
      livraisons: mesLivs.map((l) => ({
        numero: l.numero, statut: l.statut, annonceeLe: iso(l.annonceeLe), recueLe: iso(l.recueLe), lignes: l.lignes, recues: l.lignesRecues, motif: l.motif, note: l.note,
      })),
      porteurId: porteurId ?? r.id,
    });
  }
  return {
    atelier: f.nom,
    personne: acces.nom,
    commandes,
    tissu,
    rapports: rapports.map((x) => ({ id: x.id, of: x.of, statut: x.statut, le: iso(x.le), motifRefus: x.motifRefus })),
    messages,
    aujourdhui,
  };
}

/* ═══════════ tissu envoyé à l'atelier ═══════════ */

export async function tissuEnvoye(faconnierId: number): Promise<EnvoiTissu[]> {
  const rows = await db
    .select({
      id: tissuMouvement.id, date: tissuMouvement.createdAt, bon: tissuMouvement.bon, quantite: tissuMouvement.quantite, commandeId: tissuMouvement.commandeId,
      of: commande.ofNumber, modele: commande.modele, rouleau: tissuRouleau.code, reference: tissuLot.reference, couleur: tissuLot.couleur, codeCouleur: tissuLot.codeCouleur,
      bain: tissuLot.lotFournisseur, unite: tissuLot.unite,
    })
    .from(tissuMouvement)
    .innerJoin(tissuLot, eq(tissuMouvement.lotId, tissuLot.id))
    .leftJoin(tissuRouleau, eq(tissuMouvement.rouleauId, tissuRouleau.id))
    .leftJoin(commande, eq(tissuMouvement.commandeId, commande.id))
    .where(and(eq(tissuMouvement.faconnierId, faconnierId), eq(tissuMouvement.sens, "sortie")))
    .orderBy(desc(tissuMouvement.id))
    .limit(200);
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [annules, receptions] = await Promise.all([
    db.select({ id: tissuMouvement.annuleId }).from(tissuMouvement).where(inArray(tissuMouvement.annuleId, ids)),
    db.select().from(stReceptionTissu).where(inArray(stReceptionTissu.mouvementId, ids)).orderBy(asc(stReceptionTissu.id)),
  ]);
  const annule = new Set(annules.map((a) => a.id));
  const derniere = new Map(receptions.map((x) => [x.mouvementId, x]));
  return rows
    .filter((r) => !annule.has(r.id))
    .map((r) => {
      const rec = derniere.get(r.id);
      return {
        mouvementId: r.id,
        date: iso(r.date),
        bon: r.bon,
        rouleau: r.rouleau ?? "",
        tissu: r.reference,
        couleur: [r.couleur, r.codeCouleur].filter(Boolean).join(" · "),
        bain: r.bain,
        metrage: r2(r.quantite),
        unite: r.unite,
        of: r.of ?? "",
        modele: r.modele ?? "",
        commandeId: r.commandeId,
        etat: (rec?.etat ?? "") as EnvoiTissu["etat"],
        metrageConstate: rec?.metrageConstate ?? null,
        noteReception: rec?.note ?? "",
      };
    });
}

/* ═══════════ ce que l'atelier déclare ═══════════ */

const signature = (a: Acces) => `${a.nom}`.slice(0, 120);

/** Saisie du soir (cumuls). Contrôlée ; jamais comptée comme production. */
export async function declarer(a: Acces, commandeId: number, s: st.Cumuls, note: string) {
  const c = await commandeDeLAtelier(a.faconnierId ?? -1, commandeId);
  if (!c) throw new Error("Commande introuvable.");
  const saisie = { lance: Number(s.lance), produit: Number(s.produit), emballe: Number(s.emballe) };
  const refus = st.refusDeclaration(saisie);
  if (refus) throw new Error(refus);
  const [prec] = await db.select().from(stDeclaration).where(eq(stDeclaration.commandeId, commandeId)).orderBy(desc(stDeclaration.jour), desc(stDeclaration.id)).limit(1);
  const jour = todayISO();
  const alertes = st.alertesDeclaration({
    saisie,
    precedent: prec ?? null,
    reference: c.coupe > 0 ? c.coupe : c.qte,
    joursDepuis: prec ? st.joursEntre(jourIso(prec.jour), jour) : 1,
  });
  await db.insert(stDeclaration).values({
    accesId: a.id, faconnierId: a.faconnierId!, commandeId, jour, ...saisie, alertes, note: (note ?? "").trim().slice(0, 300), par: signature(a),
  });
  await journal(a.id, "declaration", commandeId, `${c.of} : lancé ${saisie.lance} · produit ${saisie.produit} · emballé ${saisie.emballe}${alertes.length ? ` ⚠ ${alertes.join(" ")}` : ""}`);
  return { alertes };
}

/** Livraison annoncée par taille, 1er / 2e choix → notification chez vous. */
export async function annoncerLivraison(a: Acces, commandeId: number, lignesBrutes: st.Ligne[], motif: string, note: string): Promise<{ numero: string }> {
  const c = await commandeDeLAtelier(a.faconnierId ?? -1, commandeId);
  if (!c) throw new Error("Commande introuvable.");
  const attendu = await attenduDeLOf(commandeId);
  const tailles = [...new Set([...attendu.sizes, ...Object.keys(attendu.parTaille)])];
  const lignes = st.lignesPropres(lignesBrutes.map((l) => ({ taille: String(l.taille), premier: Number(l.premier), second: Number(l.second) })), tailles);
  const precedentes = await db.select().from(stLivraison).where(eq(stLivraison.commandeId, commandeId));
  const comparaison = st.comparerAuPlan(lignes, attendu.parTaille, lignesLivrees(precedentes));
  const refus = st.refusLivraison(lignes, comparaison, motif ?? "", note ?? "");
  if (refus) throw new Error(refus);
  const numero = await db.transaction(async (t) => {
    await t.execute(sql`select pg_advisory_xact_lock(hashtext('st_livraison'))`);
    const nums = await t.select({ n: stLivraison.numero }).from(stLivraison);
    const n = cp.prochainNumero("LST", new Date().getFullYear(), nums.map((x) => x.n));
    await t.insert(stLivraison).values({
      numero: n, accesId: a.id, faconnierId: a.faconnierId!, commandeId, lignes, motif: motif ?? "", note: (note ?? "").trim().slice(0, 500), par: signature(a),
    });
    return n;
  });
  const tot = st.totalLignes(lignes);
  const texte = `🚚 Livraison annoncée ${numero} — ${c.of} : ${tot.premier} en 1er choix${tot.second ? ` + ${tot.second} en 2e choix` : ""}${motif ? ` (${st.MOTIFS_LIVRAISON.find((m) => m.value === motif)?.label})` : ""}. À valider à l'arrivée.`;
  await journal(a.id, "livraison", commandeId, texte);
  if (a.conversationId) await messageExterieur(a.conversationId, a.nom, texte, commandeId);
  return { numero };
}

/** L'atelier retire une livraison annoncée (pas encore reçue). */
export async function annulerLivraison(a: Acces, numero: string) {
  const [l] = await db.select().from(stLivraison).where(and(eq(stLivraison.numero, numero), eq(stLivraison.faconnierId, a.faconnierId ?? -1)));
  if (!l) throw new Error("Livraison introuvable.");
  if (l.statut !== "annoncee") throw new Error("Cette livraison a déjà été reçue : elle ne s'annule plus.");
  await db.update(stLivraison).set({ statut: "annulee" }).where(and(eq(stLivraison.id, l.id), eq(stLivraison.statut, "annoncee")));
  await journal(a.id, "livraison", l.commandeId, `Livraison ${numero} retirée par l'atelier`);
  if (a.conversationId) await messageExterieur(a.conversationId, a.nom, `↩ Livraison ${numero} retirée (ne pas l'attendre).`, l.commandeId);
}

/** Confirmation (ou écart) des rouleaux reçus. Le stock ne bouge pas : un
 * écart arrive chez vous, qui décidez de la correction au magasin tissu. */
export async function confirmerTissu(a: Acces, mouvementIds: number[], etat: string, metrageConstate: number | null, note: string) {
  if (!st.estEtatReception(etat)) throw new Error("État inconnu.");
  if (!mouvementIds.length) throw new Error("Choisissez au moins un rouleau.");
  if (etat !== "recu" && !(note ?? "").trim()) throw new Error("Dites en quelques mots ce qui ne va pas.");
  const envois = await tissuEnvoye(a.faconnierId ?? -1);
  const miens = envois.filter((e) => mouvementIds.includes(e.mouvementId));
  if (miens.length !== new Set(mouvementIds).size) throw new Error("Rouleau introuvable.");
  if (etat === "ecart" && miens.length !== 1) throw new Error("Un écart de métrage se signale rouleau par rouleau.");
  await db.insert(stReceptionTissu).values(
    miens.map((m) => ({ accesId: a.id, mouvementId: m.mouvementId, etat, metrageConstate: etat === "ecart" ? metrageConstate : null, note: (note ?? "").trim().slice(0, 300), par: signature(a) })),
  );
  const quoi = miens.map((m) => m.rouleau || m.tissu).join(", ");
  const texte =
    etat === "recu"
      ? `📦 Tissu reçu : ${quoi}.`
      : etat === "manquant"
        ? `⚠ Tissu NON reçu : ${quoi} — « ${note.trim()} »`
        : `⚠ Écart sur ${quoi} : ${metrageConstate ?? "?"} ${miens[0].unite} mesurés pour ${miens[0].metrage} envoyés — « ${note.trim()} »`;
  await journal(a.id, "reception", miens[0].commandeId, texte);
  if (a.conversationId && etat !== "recu") await messageExterieur(a.conversationId, a.nom, texte, miens[0].commandeId);
}

/** Ce qu'il faut pour remplir un rapport de coupe : tailles, OF de l'atelier
 * dans le groupe, rouleaux envoyés pour ce groupe. */
export async function contexteRapport(a: Acces, commandeId: number) {
  const c = await commandeDeLAtelier(a.faconnierId ?? -1, commandeId);
  if (!c) throw new Error("Commande introuvable.");
  const porteurId = (await porteurDe(commandeId)) ?? commandeId;
  const plan = await getPlan(porteurId);
  if (!plan) throw new Error("Pas encore de plan de coupe pour cette commande : demandez-le au bureau.");
  const groupe = await db
    .select({ id: commande.id, of: commande.ofNumber, faconnierId: commande.faconnierId, parentId: commande.parentId })
    .from(commande)
    .where(sql`${commande.id} = ${porteurId} or ${commande.parentId} = ${porteurId}`);
  const ofs = await Promise.all(
    groupe
      .filter((g) => g.faconnierId === a.faconnierId)
      // Tailles demandées à couper pour cet OF (plan de coupe, sinon commande).
      .map(async (g) => ({ id: g.id, of: g.of, demande: (await demandeDeCoupe(g.id)).parTaille })),
  );
  const ids = new Set(groupe.map((g) => g.id));
  const rouleaux = (await tissuEnvoye(a.faconnierId!)).filter((e) => e.rouleau && e.commandeId != null && ids.has(e.commandeId));
  /* Ce qu'il reste chez l'atelier sur chaque rouleau : le sorti non encore
   * déclaré (un 2e rapport ne repart pas du métrage d'origine), moins le
   * manque qu'il a signalé à la réception. */
  const enCoupe = new Map(((await contexteCoupe(porteurId))?.rouleaux ?? []).map((r) => [r.code, r.enCoupe]));
  return {
    porteurId,
    sizes: plan.sizes,
    ofs,
    rouleaux: rouleaux
      .map((r) => {
        const dehors = enCoupe.get(r.rouleau) ?? r.metrage;
        const manque = r.metrageConstate != null ? Math.max(0, r.metrage - r.metrageConstate) : 0;
        return { code: r.rouleau, tissu: r.tissu, couleur: r.couleur, recu: r2(Math.max(0, dehors - manque)), unite: r.unite };
      })
      .filter((r) => r.recu > 0.001),
  };
}

/** Le rapport de coupe part chez vous ; validé, il devient une fiche de coupe. */
export async function envoyerRapport(
  a: Acces,
  commandeId: number,
  coupe: Record<string, Record<string, number>>,
  rouleaux: { code: string; consomme: number; chute: number; reste: number }[],
  note: string,
  constatsBruts?: Partial<pv.ConstatsCoupe>,
) {
  const ctx = await contexteRapport(a, commandeId);
  const ofs = new Set(ctx.ofs.map((o) => String(o.id)));
  const propre: Record<string, Record<string, number>> = {};
  let total = 0;
  for (const [of, parTaille] of Object.entries(coupe ?? {})) {
    if (!ofs.has(of)) throw new Error("Un OF saisi n'est pas confié à votre atelier.");
    for (const [t, q] of Object.entries(parTaille ?? {})) {
      const n = Number(q);
      if (!ctx.sizes.includes(t)) throw new Error(`Taille inconnue : ${t}.`);
      if (!Number.isFinite(n) || n < 0 || Math.round(n) !== n) throw new Error("Des nombres entiers, sans virgule.");
      if (n > 0) (propre[of] ??= {})[t] = n;
      total += n;
    }
  }
  if (total <= 0) throw new Error("Indiquez les pièces coupées.");
  const rs: { code: string; consomme: number; chute: number; reste: number }[] = [];
  for (const r of rouleaux ?? []) {
    const connu = ctx.rouleaux.find((x) => x.code === r.code);
    if (!connu) throw new Error(`Rouleau inconnu : ${r.code}.`);
    const v = { code: r.code, consomme: Number(r.consomme) || 0, chute: Number(r.chute) || 0, reste: Number(r.reste) || 0 };
    if (v.consomme + v.chute + v.reste <= 0) continue;
    const e = st.controleRouleauRapport(v, connu.recu);
    if (e) throw new Error(`${r.code} : ${e}`);
    rs.push(v);
  }
  // Laize constatée, 2e choix à la coupe, défauts / manquants par rouleau.
  const constats = pv.normaliserConstats(constatsBruts, {
    ofs: ctx.ofs.map((o) => String(o.id)),
    tailles: ctx.sizes,
    coupe: propre,
    rouleaux: ctx.rouleaux.map((r) => r.code),
  });
  const [en] = await db
    .select({ id: stRapportCoupe.id })
    .from(stRapportCoupe)
    .where(and(eq(stRapportCoupe.commandeId, ctx.porteurId), eq(stRapportCoupe.faconnierId, a.faconnierId!), eq(stRapportCoupe.statut, "annonce")));
  if (en) throw new Error("Un rapport de coupe attend déjà d'être validé pour cette commande.");
  await db.insert(stRapportCoupe).values({ accesId: a.id, faconnierId: a.faconnierId!, commandeId: ctx.porteurId, coupe: propre, rouleaux: rs, constats, note: (note ?? "").trim().slice(0, 500), par: signature(a) });
  const reste = rs.reduce((s, r) => s + r.reste, 0);
  const texte = `✂ Rapport de coupe : ${total} pièces coupées${rs.length ? ` sur ${rs.length} rouleau(x)` : ""}${reste > 0 ? `, reste ${r2(reste)} m à rendre` : ""}. À valider.`;
  await journal(a.id, "coupe_rapport", ctx.porteurId, texte);
  if (a.conversationId) await messageExterieur(a.conversationId, a.nom, texte, ctx.porteurId);
}

/** « Un problème » : un message (et une photo) dans votre Messagerie. */
export async function signalerProbleme(a: Acces, commandeId: number | null, texte: string, fichier: { hash: string; nom: string; mime: string; taille: number } | null) {
  if (!a.conversationId) throw new Error("Messagerie indisponible pour cet accès.");
  const c = commandeId ? await commandeDeLAtelier(a.faconnierId ?? -1, commandeId) : null;
  if (commandeId && !c) throw new Error("Commande introuvable.");
  const t = (texte ?? "").trim();
  if (t.length < 2 && !fichier) throw new Error("Décrivez le problème.");
  await messageExterieur(a.conversationId, a.nom, t ? `⚠ ${t.slice(0, 2000)}` : "⚠ (photo)", c?.id ?? null, fichier);
  await journal(a.id, "question", c?.id ?? null, t.slice(0, 200) || "photo");
}

/** Livraisons d'un atelier encore à valider, par numéro (pour le QR). */
export async function livraisonDeLAtelier(a: Acces, numero: string) {
  const [l] = await db.select().from(stLivraison).where(and(eq(stLivraison.numero, numero), eq(stLivraison.faconnierId, a.faconnierId ?? -1), ne(stLivraison.statut, "annulee")));
  if (!l) return null;
  const [c] = await db.select({ of: commande.ofNumber, modele: commande.modele, couleur: commande.couleur }).from(commande).where(eq(commande.id, l.commandeId));
  return { numero: l.numero, statut: l.statut, annonceeLe: iso(l.annonceeLe), lignes: l.lignes, motif: l.motif, of: c?.of ?? "", modele: c?.modele ?? "", couleur: c?.couleur ?? "" };
}
