import "server-only";
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { commande, coupeFiche, resultatCoupe, stLivraison, tissuRouleau } from "@/lib/db/schema";
import * as pv from "@/lib/domain/pv-client";
import { lireFiche } from "@/lib/services/coupe";
import { listLots } from "@/lib/services/tissu";
import { getPlan } from "@/lib/services/plan-coupe";

/* Données du PV de coupe au format client (« Résultat de coupe »), lues sur
 * la fiche de coupe validée (avec les CONSTATS du coupeur ou de l'atelier :
 * laize, 2e choix, défauts et manquants de rouleaux), le magasin tissu et le
 * plan de coupe. Le
 * « Façonnier » écrit sur le document est TOUJOURS l'usine (jamais un
 * atelier extérieur) : c'est nous, le façonnier du client. */

export const FACONNIER_DOCUMENT = "STE DBS FASHION";

export async function donneesPvClient(numero: string): Promise<pv.DonneesPvClient | null> {
  const f = await lireFiche(numero);
  if (!f || f.statut !== "validee") return null;
  const ofIds = f.ofs.map((o) => o.id);
  const [lots, rouleaux, livraisons, plan, couleurs] = await Promise.all([
    listLots(),
    db.select({ code: tissuRouleau.code, observations: tissuRouleau.observations }).from(tissuRouleau).where(inArray(tissuRouleau.code, f.consommation.map((c) => c.rouleau).concat("-"))),
    ofIds.length ? db.select({ lignes: stLivraison.lignesRecues }).from(stLivraison).where(and(inArray(stLivraison.commandeId, ofIds), eq(stLivraison.statut, "recue"))) : Promise.resolve([]),
    getPlan(f.commande.id),
    ofIds.length ? db.select({ id: commande.id, couleur: commande.couleur }).from(commande).where(and(inArray(commande.id, ofIds), ne(commande.couleur, ""))) : Promise.resolve([]),
  ]);
  const idsLots = new Set(f.consommation.map((c) => c.lot));
  const cst = f.constats ?? pv.CONSTATS_VIDES;
  const manquantDe = new Map(cst.rouleaux.map((r) => [r.code, r.manquant]));
  const lotsPv: pv.LotPv[] = lots
    .filter((l) => idsLots.has(l.identifiant))
    .map((l) => ({ identifiant: l.identifiant, reference: l.reference, couleur: l.couleur, unite: l.unite, laize: l.laize, recu: l.bilan.recu, reste: l.bilan.disponible + l.enCoupe }));
  // Pièces coupées par couleur d'OF (pour l'emploi moyen de chaque coloris).
  const couleurDe = new Map(couleurs.map((c) => [c.id, c.couleur]));
  const piecesParCouleur: Record<string, number> = {};
  for (const l of f.lignes) for (const p of l.parOf) {
    const o = f.ofs.find((x) => x.of === p.of);
    const c = (o && couleurDe.get(o.id)) || "";
    if (c) piecesParCouleur[c] = (piecesParCouleur[c] ?? 0) + p.coupe;
  }
  const autres = pv.autresMatieres((plan?.matieres ?? []).map((m) => ({ nom: m.nom, consoPrevue: m.consoPrevue })), f.matiere);
  return {
    faconnier: FACONNIER_DOCUMENT,
    dateCoupe: f.date,
    numeroOf: f.ofs.map((o) => o.of).join(" / ") || f.commande.of,
    client: f.commande.client,
    modele: f.commande.modele,
    reference: f.commande.refArticle,
    tissuPrincipal: f.tissu.references.join(" / "),
    // Laize CONSTATÉE à la coupe ; à défaut, celle relevée au magasin tissu.
    laize: cst.laize ? cst.laize.toFixed(2) : pv.laizeMetres(lotsPv.map((l) => l.laize)),
    tailles: f.sizes,
    commandees: Object.fromEntries(f.lignes.map((l) => [l.taille, l.commande])),
    coupees: Object.fromEntries(f.lignes.map((l) => [l.taille, l.coupe])),
    // 2e choix constaté à la coupe ; à défaut, celui des livraisons reçues.
    second: pv.secondDesConstats(cst) ?? pv.secondChoix(livraisons.map((x) => x.lignes)),
    tissus: pv.emploiTissu({
      conso: f.consommation.map((c) => ({ lot: c.lot, rouleau: c.rouleau, consomme: c.consomme, chute: c.chute, manquant: manquantDe.get(c.rouleau) ?? 0 })),
      lots: lotsPv,
      rouleauxDefaut: [...new Set([...cst.rouleaux.filter((r) => r.defaut).map((r) => r.code), ...rouleaux.filter((r) => r.observations.trim()).map((r) => r.code)])],
      piecesParCouleur,
      piecesTotal: f.totaux.coupe,
    }),
    ...autres,
    numeroFiche: f.numero,
  };
}

/* ═══════════ génération automatique ═══════════ */

/** Génère et FIGE le Résultat de coupe d'une fiche (nouvelle version).
 * Appelé tout seul à la validation de la fiche — par le coupeur, ou à la
 * validation du rapport de coupe d'un atelier. */
export async function enregistrerResultat(numero: string, par: string): Promise<number | null> {
  const d = await donneesPvClient(numero);
  if (!d) return null;
  const [f] = await db.select({ id: coupeFiche.id }).from(coupeFiche).where(eq(coupeFiche.numero, numero));
  if (!f) return null;
  return db.transaction(async (t) => {
    await t.execute(sql`select pg_advisory_xact_lock(hashtext('resultat_coupe'), ${f.id})`);
    const [{ n }] = await t.select({ n: sql<number>`coalesce(max(${resultatCoupe.version}), 0)::int` }).from(resultatCoupe).where(eq(resultatCoupe.ficheId, f.id));
    await t.insert(resultatCoupe).values({ ficheId: f.id, version: Number(n) + 1, donnees: d as unknown as Record<string, unknown>, createdBy: par });
    return Number(n) + 1;
  });
}

/** Le Résultat de coupe à remettre : la dernière version figée ; pour une
 * fiche validée avant cette fonction, il est calculé à la demande. */
export async function resultatAEnvoyer(numero: string, version?: number): Promise<{ donnees: pv.DonneesPvClient; version: number | null; le: string } | null> {
  const [f] = await db.select({ id: coupeFiche.id, statut: coupeFiche.statut }).from(coupeFiche).where(eq(coupeFiche.numero, numero));
  if (!f || f.statut !== "validee") return null;
  const [r] = await db
    .select()
    .from(resultatCoupe)
    .where(version ? and(eq(resultatCoupe.ficheId, f.id), eq(resultatCoupe.version, version)) : eq(resultatCoupe.ficheId, f.id))
    .orderBy(desc(resultatCoupe.version))
    .limit(1);
  if (r) return { donnees: r.donnees as unknown as pv.DonneesPvClient, version: r.version, le: r.createdAt.toISOString() };
  const d = await donneesPvClient(numero);
  return d ? { donnees: d, version: null, le: new Date().toISOString() } : null;
}

export async function versionsResultat(ficheId: number) {
  const rs = await db.select({ version: resultatCoupe.version, createdBy: resultatCoupe.createdBy, createdAt: resultatCoupe.createdAt }).from(resultatCoupe).where(eq(resultatCoupe.ficheId, ficheId)).orderBy(desc(resultatCoupe.version));
  return rs.map((r) => ({ version: r.version, par: r.createdBy, le: r.createdAt.toISOString() }));
}
