import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { client, commande, commandePlan, coupe, coupeFiche, liasseGabarit, modele, paquet, paquetReleve } from "@/lib/db/schema";
import * as pq from "@/lib/domain/paquet";
import { TAILLE_PAQUET_DEFAUT, taillePaquet as choisirTaille } from "@/lib/domain/paquets";
import { getSetting, setSetting } from "@/lib/services/permissions";

/* PAQUETS DE COUPE — service.
 *
 * Le paquet naît à la validation d'une fiche de coupe, et meurt à
 * l'assemblage. Ce module LIT la fiche de coupe, le plan et la commande ; il
 * n'écrit que dans `paquet` et `paquet_releve`.
 *
 * Il ne touche JAMAIS `commande.produit`, `coupe_qte` ni `magasin_qte` : la
 * production reste comptée par la sortie de chaîne, exactement comme avant.
 * Un test automatique (lib/domain/paquet-cloisonnement.test.ts) fait échouer
 * la compilation si quelqu'un franchit cette cloison. */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executeur = typeof db | Tx;

/* ─────────── réglages ─────────── */

export const CLE_ACTIF = "paquets.actif";
export const CLE_ROLES = "paquets.roles";
/** Rôles autorisés à faire la tournée : responsable de production (qui couvre
 * l'agent de méthode), chef de chaîne, et l'administrateur. */
export const ROLES_TOURNEE_DEFAUT = ["admin", "resp", "chef"];

export const suiviPaquetsActif = () => getSetting<boolean>(CLE_ACTIF, false);
export const rolesTournee = () => getSetting<string[]>(CLE_ROLES, ROLES_TOURNEE_DEFAUT);

export async function enregistrerReglagesPaquets(v: { actif?: boolean; roles?: string[] }) {
  if (v.actif !== undefined) await setSetting(CLE_ACTIF, !!v.actif);
  if (v.roles !== undefined) {
    const propres = [...new Set(v.roles.map((r) => String(r).trim()).filter(Boolean))].slice(0, 20);
    // L'administrateur garde toujours la main : sans lui, un réglage malheureux
    // fermerait la tournée à tout le monde sans moyen de rouvrir.
    await setSetting(CLE_ROLES, propres.includes("admin") ? propres : ["admin", ...propres]);
  }
}

export async function peutRelever(role: string): Promise<boolean> {
  return role === "admin" || (await rolesTournee()).includes(role);
}

/* ─────────── naissance des paquets ─────────── */

async function prochainCode(ex: Executeur): Promise<string> {
  const res = await ex.execute(sql`select nextval('paquet_seq')::int as n`);
  const n = Number((res as unknown as { rows?: { n: number }[] }).rows?.[0]?.n ?? (res as unknown as { n: number }[])[0]?.n ?? 0);
  return pq.formatCodePaquet(new Date().getFullYear(), n);
}

/** Pièces par paquet de cette commande : celle du modèle GPAO qui lui est
 * relié, sinon le réglage de l'usine (25 par défaut). Mêmes valeurs que le
 * relevé horaire — il n'y a qu'un seul endroit où cela se règle. */
async function tailleDeLaCommande(ex: Executeur, commandeId: number): Promise<number> {
  const [m] = await ex.select({ t: modele.taillePaquet }).from(modele).where(eq(modele.commandeId, commandeId)).limit(1);
  const usine = await getSetting<number>("gpao.taillePaquet", TAILLE_PAQUET_DEFAUT);
  return choisirTaille(m?.t ?? 0, usine);
}

/** Crée les paquets d'une fiche de coupe validée.
 *
 * Une ligne de coupe = un OF × une taille. Chaque OF numérote ses paquets
 * pour lui-même, de 1 à n, en continuant après ce qui existe déjà (recoupe,
 * réassort). Ne fait rien si le suivi n'est pas activé : inutile de créer des
 * milliers de lignes pour une usine qui ne s'en sert pas. */
export async function creerPaquetsPourFiche(ex: Executeur, ficheId: number, par: string): Promise<number> {
  if (!(await suiviPaquetsActif())) return 0;
  const [f] = await ex.select().from(coupeFiche).where(eq(coupeFiche.id, ficheId));
  if (!f || f.statut !== "validee") return 0;

  // Les liasses viennent du plan du PORTEUR : le modèle se décompose une fois.
  const [plan] = await ex.select({ l: commandePlan.liasses }).from(commandePlan).where(eq(commandePlan.commandeId, f.commandeId));
  const liasses = pq.normaliserLiasses(plan?.l);

  const lignes = await ex
    .select({ commandeId: coupe.commandeId, taille: coupe.taille, qte: coupe.qte })
    .from(coupe)
    .where(eq(coupe.ficheId, ficheId))
    .orderBy(asc(coupe.commandeId), asc(coupe.id));

  const parOf = new Map<number, { taille: string; qte: number }[]>();
  for (const l of lignes) {
    if (l.qte <= 0) continue;
    const g = parOf.get(l.commandeId) ?? [];
    g.push({ taille: l.taille, qte: l.qte });
    parOf.set(l.commandeId, g);
  }

  let crees = 0;
  for (const [commandeId, grille] of parOf) {
    const [c] = await ex
      .select({ of: commande.ofNumber, modele: commande.modele, couleur: commande.couleur })
      .from(commande)
      .where(eq(commande.id, commandeId));
    const [deja] = await ex
      .select({ numero: sql<number>`coalesce(max(${paquet.numero}), 0)::int`, piece: sql<number>`coalesce(max(${paquet.pieceFin}), 0)::int` })
      .from(paquet)
      .where(eq(paquet.commandeId, commandeId));
    const taille = await tailleDeLaCommande(ex, commandeId);
    const neufs = pq.decouperEnPaquets(grille, taille, deja?.numero ?? 0, deja?.piece ?? 0);
    for (const n of neufs) {
      await ex.insert(paquet).values({
        code: await prochainCode(ex),
        commandeId,
        ficheId,
        numero: n.numero,
        taille: n.taille,
        qte: n.qte,
        pieceDebut: n.pieceDebut,
        pieceFin: n.pieceFin,
        liasses,
        modele: c?.modele ?? "",
        couleur: c?.couleur ?? "",
        ofNumber: c?.of ?? "",
        createdBy: par,
      });
      crees += 1;
    }
  }
  return crees;
}

/** Annule les paquets d'une fiche annulée. Rien n'est supprimé : les
 * étiquettes ont pu être collées, et l'historique reste consultable. */
export async function annulerPaquetsDeFiche(ex: Executeur, ficheId: number, motif: string, par: string): Promise<number> {
  const r = await ex
    .update(paquet)
    .set({ statut: "annule", annuleLe: new Date(), annulePar: par, motifAnnulation: motif.slice(0, 300) })
    .where(and(eq(paquet.ficheId, ficheId), eq(paquet.statut, "actif")))
    .returning({ id: paquet.id });
  return r.length;
}

/* ─────────── lecture ─────────── */

export type PaquetRow = typeof paquet.$inferSelect;
export type PaquetVue = PaquetRow & { etat: pq.EtatPaquet; releves: pq.Releve[] };

const versReleve = (r: typeof paquetReleve.$inferSelect): pq.Releve => ({
  id: r.id, paquetId: r.paquetId, liasse: r.liasse, etape: r.etape,
  qte: r.qte, note: r.note, date: r.date, annuleId: r.annuleId, par: r.createdBy,
});

async function habiller(ex: Executeur, lignes: PaquetRow[]): Promise<PaquetVue[]> {
  if (!lignes.length) return [];
  const releves = await ex
    .select()
    .from(paquetReleve)
    .where(inArray(paquetReleve.paquetId, lignes.map((p) => p.id)))
    .orderBy(asc(paquetReleve.id));
  const parPaquet = new Map<number, pq.Releve[]>();
  for (const r of releves) {
    const g = parPaquet.get(r.paquetId) ?? [];
    g.push(versReleve(r));
    parPaquet.set(r.paquetId, g);
  }
  return lignes.map((p) => {
    const siens = parPaquet.get(p.id) ?? [];
    return { ...p, releves: siens, etat: pq.etatPaquet(p.liasses, siens) };
  });
}

/** Tous les paquets d'un OF, dans l'ordre des numéros. */
export async function paquetsDeCommande(commandeId: number): Promise<PaquetVue[]> {
  const lignes = await db.select().from(paquet).where(eq(paquet.commandeId, commandeId)).orderBy(asc(paquet.numero));
  return habiller(db, lignes);
}

/** Un paquet par son code QR, avec son OF — ce que la tournée affiche. */
export async function paquetParCode(code: string): Promise<PaquetVue | null> {
  const [p] = await db.select().from(paquet).where(eq(paquet.code, code));
  if (!p) return null;
  return (await habiller(db, [p]))[0] ?? null;
}

/** Les OF qui ont des paquets, pour le choix en tête de l'écran. */
export type OfAvecPaquets = {
  commandeId: number;
  of: string;
  modele: string;
  couleur: string;
  client: string;
  liasses: string[];
  bilan: pq.BilanOf;
};

export async function ofsAvecPaquets(): Promise<OfAvecPaquets[]> {
  const lignes = await db
    .select({ p: paquet, client: client.nom })
    .from(paquet)
    .leftJoin(commande, eq(paquet.commandeId, commande.id))
    .leftJoin(client, eq(commande.clientId, client.id))
    .where(eq(paquet.statut, "actif"))
    .orderBy(desc(paquet.commandeId), asc(paquet.numero));
  if (!lignes.length) return [];
  const vues = await habiller(db, lignes.map((l) => l.p));
  const clientDe = new Map(lignes.map((l) => [l.p.id, l.client ?? ""]));
  const parOf = new Map<number, PaquetVue[]>();
  for (const v of vues) {
    const g = parOf.get(v.commandeId) ?? [];
    g.push(v);
    parOf.set(v.commandeId, g);
  }
  return [...parOf.entries()]
    .map(([commandeId, liste]) => ({
      commandeId,
      of: liste[0].ofNumber,
      modele: liste[0].modele,
      couleur: liste[0].couleur,
      client: clientDe.get(liste[0].id) ?? "",
      liasses: liste[0].liasses.length ? liste[0].liasses : [pq.LIASSE_UNIQUE],
      bilan: pq.bilanOf(liste.map((p) => ({ qte: p.qte, etat: p.etat }))),
    }))
    .sort((a, b) => a.of.localeCompare(b.of));
}

/* ─────────── la tournée ───────────
 *
 * Un relevé s'AJOUTE, il ne remplace rien. Rien ne bloque : une liasse peut
 * être relevée après l'assemblage d'un autre paquet, un jour peut être sauté,
 * la responsable peut relever la veille. */

export async function relever(v: {
  code: string;
  etape: "liasse" | "assemble" | "probleme";
  liasse?: string;
  qte?: number | null;
  note?: string;
  date?: string;
  par: string;
}): Promise<{ paquet: PaquetVue; message: string }> {
  return db.transaction(async (t) => {
    const [p] = await t.select().from(paquet).where(eq(paquet.code, v.code)).for("update");
    if (!p) throw new Error(`Paquet ${v.code} introuvable.`);
    const [vue] = await habiller(t, [p]);
    const liasses = p.liasses.length ? p.liasses : [pq.LIASSE_UNIQUE];
    const liasse = v.etape === "assemble" ? "" : (v.liasse ?? "").trim();
    const refus = pq.refusReleve({ statutPaquet: p.statut, etape: v.etape, liasse, liasses, etat: vue.etat });
    if (refus) throw new Error(refus);

    const date = /^\d{4}-\d{2}-\d{2}$/.test(v.date ?? "") ? v.date! : new Date().toISOString().slice(0, 10);
    const qte = v.qte == null || !Number.isFinite(Number(v.qte)) ? null : Math.max(0, Math.trunc(Number(v.qte)));
    // Le nom exact de la liasse du paquet, pas celui tapé (casse, espaces).
    const nom = liasses.find((l) => l.toLowerCase() === liasse.toLowerCase()) ?? liasse;
    await t.insert(paquetReleve).values({
      paquetId: p.id, liasse: nom, etape: v.etape, qte, note: (v.note ?? "").trim().slice(0, 300), date, createdBy: v.par,
    });
    const [apres] = await habiller(t, [p]);
    return { paquet: apres, message: pq.resumeScan(p.numero, p.taille, apres.etat) };
  });
}

/** Annule un relevé posé par erreur. L'original reste dans le journal. */
export async function annulerReleve(releveId: number, motif: string, par: string): Promise<void> {
  await db.transaction(async (t) => {
    const [r] = await t.select().from(paquetReleve).where(eq(paquetReleve.id, releveId));
    if (!r) throw new Error("Relevé introuvable.");
    if (r.etape === "annulation") throw new Error("On n'annule pas une annulation.");
    const [deja] = await t
      .select({ id: paquetReleve.id })
      .from(paquetReleve)
      .where(and(eq(paquetReleve.etape, "annulation"), eq(paquetReleve.annuleId, releveId)));
    if (deja) throw new Error("Ce relevé est déjà annulé.");
    await t.insert(paquetReleve).values({
      paquetId: r.paquetId, liasse: r.liasse, etape: "annulation", annuleId: releveId,
      note: motif.trim().slice(0, 300) || "Relevé annulé", date: new Date().toISOString().slice(0, 10), createdBy: par,
    });
  });
}

/* ─────────── gabarits de liasses ─────────── */

export const listGabarits = () => db.select().from(liasseGabarit).orderBy(asc(liasseGabarit.nom));

export async function enregistrerGabarit(v: { id?: number; nom: string; liasses: string[] }, par: string) {
  const nom = v.nom.trim().slice(0, 60);
  if (!nom) throw new Error("Donnez un nom à cette liste (ex. « Chemise »).");
  const liasses = pq.normaliserLiasses(v.liasses);
  if (v.id) {
    await db.update(liasseGabarit).set({ nom, liasses }).where(eq(liasseGabarit.id, v.id));
    return v.id;
  }
  const [row] = await db.insert(liasseGabarit).values({ nom, liasses, createdBy: par }).returning({ id: liasseGabarit.id });
  return row.id;
}

export async function supprimerGabarit(id: number) {
  // Un gabarit n'est qu'un raccourci de saisie : les listes déjà posées sur
  // les plans et figées sur les paquets ne bougent pas.
  await db.delete(liasseGabarit).where(eq(liasseGabarit.id, id));
}

/** Liasses retenues pour une commande (sur son plan de coupe). */
export async function liassesDuPlan(commandeId: number): Promise<string[]> {
  const [p] = await db.select({ l: commandePlan.liasses }).from(commandePlan).where(eq(commandePlan.commandeId, commandeId));
  return Array.isArray(p?.l) ? p!.l : [];
}

export async function enregistrerLiassesPlan(commandeId: number, liste: string[]): Promise<string[]> {
  const liasses = pq.normaliserLiasses(liste);
  const [existe] = await db.select({ c: commandePlan.commandeId }).from(commandePlan).where(eq(commandePlan.commandeId, commandeId));
  if (!existe) throw new Error("Cette commande n'a pas encore de plan de coupe (Bureau modélisme → Plan de coupe).");
  await db.update(commandePlan).set({ liasses, updatedAt: new Date() }).where(eq(commandePlan.commandeId, commandeId));
  return liasses;
}
