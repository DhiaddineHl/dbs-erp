import "server-only";
import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { chaine, client, commande, commandePlan, coupe, coupeFiche, journee, liasseGabarit, modele, ouvriere, paquet, paquetReleve } from "@/lib/db/schema";
import type { JourneeOuvriere } from "@/lib/db/schema";
import { normaliserNom } from "@/lib/domain/commande";
import * as pq from "@/lib/domain/paquet";
import * as pq2 from "@/lib/domain/paquets-heure";
import { TAILLE_PAQUET_DEFAUT, taillePaquet as choisirTaille } from "@/lib/domain/paquets-heure";
import { idsFreres } from "@/lib/services/avancement";
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

/** Clé historique de la GPAO (case 🏷) : le suivi par paquets ne fait plus
 * qu'UN avec elle. Allumer l'un allume l'autre. */
export const CLE_ACTIF_GPAO = "gpao.suiviPaquets";

export async function suiviPaquetsActif(): Promise<boolean> {
  const [a, b] = await Promise.all([getSetting<boolean>(CLE_ACTIF, false), getSetting<boolean>(CLE_ACTIF_GPAO, false)]);
  return !!a || !!b;
}
export const rolesTournee = () => getSetting<string[]>(CLE_ROLES, ROLES_TOURNEE_DEFAUT);

export async function enregistrerReglagesPaquets(v: { actif?: boolean; roles?: string[] }) {
  if (v.actif !== undefined) {
    await setSetting(CLE_ACTIF, !!v.actif);
    await setSetting(CLE_ACTIF_GPAO, !!v.actif);
  }
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
export async function tailleDeLaCommande(ex: Executeur, commandeId: number): Promise<number> {
  /* Le modèle GPAO est souvent relié à UN seul OF : ses frères (même client,
     même modèle, autre couleur) prennent la même taille de paquet. */
  const ids = await idsFreres(ex as typeof db, commandeId);
  const [m] = await ex
    .select({ t: modele.taillePaquet })
    .from(modele)
    .where(and(inArray(modele.commandeId, ids.length ? ids : [commandeId]), sql`${modele.taillePaquet} > 0`))
    .limit(1);
  const usine = await getSetting<number>("gpao.taillePaquet", TAILLE_PAQUET_DEFAUT);
  return choisirTaille(m?.t ?? 0, usine);
}

/** Crée les paquets d'une fiche de coupe validée.
 *
 * Une ligne de coupe = un OF × une taille. Chaque OF numérote ses paquets
 * pour lui-même, de 1 à n, en continuant après ce qui existe déjà (recoupe,
 * réassort). Ne fait rien si le suivi n'est pas activé : inutile de créer des
 * milliers de lignes pour une usine qui ne s'en sert pas. */
/** Ce que la coupe a décidé à la validation : ses morceaux, et la quantité de
 * chaque paquet, par OF puis par taille. Sans ces choix, l'application
 * découpe toute seule (taille du paquet du modèle, le dernier porte le reste). */
export type ChoixPaquets = {
  morceaux?: string[];
  /** commandeId → taille → quantités des paquets (somme = coupé). */
  decoupage?: Record<number, Record<string, number[]>>;
};

export async function creerPaquetsPourFiche(ex: Executeur, ficheId: number, par: string, choix: ChoixPaquets = {}): Promise<number> {
  if (!(await suiviPaquetsActif())) return 0;
  const [f] = await ex.select().from(coupeFiche).where(eq(coupeFiche.id, ficheId));
  if (!f || f.statut !== "validee") return 0;
  // Coupe sous-traitée : on ne suit pas la chaîne du sous-traitant.
  if (f.type === "soustraite") return 0;

  /* Les morceaux viennent du choix fait à la validation ; sinon du plan du
   * PORTEUR (le modèle se décompose une fois). Le choix est retenu sur le
   * plan : le prochain OF du modèle le retrouvera. */
  const [plan] = await ex.select({ l: commandePlan.liasses }).from(commandePlan).where(eq(commandePlan.commandeId, f.commandeId));
  const choisis = choix.morceaux?.length ? pq.normaliserLiasses(choix.morceaux) : null;
  if (choisis && plan) await ex.update(commandePlan).set({ liasses: choisis }).where(eq(commandePlan.commandeId, f.commandeId));
  const liasses = choisis ?? pq.normaliserLiasses(plan?.l);

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
    const voulu = choix.decoupage?.[commandeId];
    const neufs = voulu
      ? pq.decouperSelonListes(
          grille.map((g) => {
            const qtes = voulu[g.taille] ?? pq.proposerDecoupage(g.qte, taille);
            const somme = qtes.reduce((a, b) => a + b, 0);
            if (somme !== g.qte || qtes.some((q) => !(q > 0) || Math.trunc(q) !== q)) {
              throw new Error(`Paquets de la taille ${g.taille} : ils font ${somme} pièces, la coupe en compte ${g.qte}.`);
            }
            return { taille: g.taille, qtes };
          }),
          deja?.numero ?? 0,
          deja?.piece ?? 0,
        )
      : pq.decouperEnPaquets(grille, taille, deja?.numero ?? 0, deja?.piece ?? 0);
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
    g.push(versReleveComplet(r));
    parPaquet.set(r.paquetId, g);
  }
  return lignes.map((p) => {
    const siens = parPaquet.get(p.id) ?? [];
    return { ...p, releves: siens, etat: pq.etatPaquet(pq.morceauxActifs(p.liasses, p.morceauxAnnules), siens) };
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
      liasses: pq.morceauxActifs(liste[0].liasses, liste[0].morceauxAnnules),
      bilan: pq.bilanOf(liste.map((p) => ({ qte: pq.qteEffective(p), etat: p.etat }))),
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
    const liasses = pq.morceauxActifs(p.liasses, p.morceauxAnnules);
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

/* ─────────── carnet pour la saisie horaire ───────────
 *
 * La GPAO saisit la production d'un MODÈLE ; les paquets appartiennent à des
 * OF. Le pont existe déjà : `modele.commandeId`, plus les OF frères (même
 * client, même modèle) que la répartition de production utilise déjà.
 *
 * Résultat : quand l'agent scanne une étiquette dans la case de l'heure,
 * l'application sait de quel paquet il s'agit, de quelle taille et combien
 * de pièces il contient. Un seul relevé, un seul endroit. */

export type PaquetCarnet = pq2.PaquetConnu;

/** Paquets actifs des OF donnés, allégés pour la saisie. */
export async function carnetDeCommandes(commandeIds: number[]): Promise<PaquetCarnet[]> {
  if (!commandeIds.length) return [];
  const lignes = await db
    .select({
      numero: paquet.numero, code: paquet.code, taille: paquet.taille, qte: paquet.qte, qteReelle: paquet.qteReelle,
      of: paquet.ofNumber, couleur: paquet.couleur, liasses: paquet.liasses, annules: paquet.morceauxAnnules,
    })
    .from(paquet)
    .where(and(inArray(paquet.commandeId, commandeIds), eq(paquet.statut, "actif")))
    .orderBy(asc(paquet.commandeId), asc(paquet.numero));
  return lignes.map((l) => ({
    numero: l.numero, code: l.code, taille: l.taille, qte: pq.qteEffective(l), of: l.of, couleur: l.couleur,
    morceaux: pq.morceauxActifs(l.liasses, l.annules),
  }));
}

/** Carnet de chaque modèle GPAO relié à une commande, pour l'écran de saisie.
 * Borné à la production en cours : seuls les modèles non archivés comptent. */
export async function carnetParModele(): Promise<Record<number, PaquetCarnet[]>> {
  if (!(await suiviPaquetsActif())) return {};
  const modeles = await db
    .select({ id: modele.id, commandeId: modele.commandeId })
    .from(modele)
    .where(and(eq(modele.archive, false), isNotNull(modele.commandeId)));
  if (!modeles.length) return {};
  const out: Record<number, PaquetCarnet[]> = {};
  for (const m of modeles) {
    // Les OF frères aussi : une chaîne enchaîne souvent plusieurs OF du
    // même modèle, et leurs paquets portent chacun leur propre numéro.
    const ids = await idsFreres(db, m.commandeId!);
    const liste = await carnetDeCommandes(ids);
    if (liste.length) out[m.id] = liste;
  }
  return out;
}

/* ─────────── ce que la CHAÎNE a fait, lu dans la saisie horaire ───────────
 *
 * Quand l'agent note (ou scanne) un numéro de paquet à côté des pièces de
 * l'heure, c'est déjà enregistré dans la journée GPAO. La grille des paquets
 * le LIT — elle ne le réenregistre pas. Une seule saisie, un seul endroit,
 * et aucun risque que les deux se contredisent. */

export type PassageChaine = {
  /** Dernier jour où la chaîne a travaillé sur ce paquet. */
  dernier: string;
  /** Nombre d'heures de passage relevées (toutes journées confondues). */
  heures: number;
  /** Qui y a touché, sans doublon. */
  ouvrieres: string[];
};

export async function passagesEnChaine(commandeIds: number[]): Promise<Map<number, PassageChaine>> {
  const out = new Map<number, PassageChaine>();
  if (!commandeIds.length) return out;

  // numéro → paquet : les OF frères partagent la numérotation, le premier
  // déclaré gagne, comme à la saisie (voir lib/domain/paquets-heure.ts).
  const paquets = await db
    .select({ id: paquet.id, numero: paquet.numero })
    .from(paquet)
    .where(and(inArray(paquet.commandeId, commandeIds), eq(paquet.statut, "actif")))
    .orderBy(asc(paquet.commandeId), asc(paquet.numero));
  if (!paquets.length) return out;
  const parNumero = new Map<number, number>();
  for (const p of paquets) if (!parNumero.has(p.numero)) parNumero.set(p.numero, p.id);

  const modeles = await db.select({ id: modele.id }).from(modele).where(inArray(modele.commandeId, commandeIds));
  if (!modeles.length) return out;
  const journees = await db
    .select({ date: journee.date, paquets: journee.paquets, ouvrieres: journee.ouvrieres })
    .from(journee)
    .where(inArray(journee.modeleId, modeles.map((m) => m.id)))
    .orderBy(asc(journee.date));

  for (const j of journees) {
    const nomDe = new Map((j.ouvrieres ?? []).map((o) => [o.id, o.nom]));
    for (const [ouvId, heures] of Object.entries(j.paquets ?? {})) {
      const nom = nomDe.get(Number(ouvId)) ?? "";
      for (const numeros of Object.values(heures ?? {})) {
        for (const n of numeros ?? []) {
          const id = parNumero.get(n);
          if (id == null) continue;
          const e = out.get(id) ?? { dernier: "", heures: 0, ouvrieres: [] };
          if (j.date > e.dernier) e.dernier = j.date;
          e.heures += 1;
          if (nom && !e.ouvrieres.includes(nom)) e.ouvrieres.push(nom);
          out.set(id, e);
        }
      }
    }
  }
  return out;
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


/* ═══════════ « FINI AU POSTE » — le scan dans la saisie horaire ═══════════
 *
 * L'agent appuie sur 🏷 en face de l'ouvrière et scanne l'étiquette du
 * morceau qu'elle vient de FINIR à son poste. Un seul relevé, dans le journal
 * du paquet (paquet_releve, etape « poste ») : l'ouvrière, le poste, l'heure
 * et la journée viennent de la saisie horaire, le morceau de l'étiquette.
 *
 * Rien ici n'écrit les pièces de l'heure : l'écran les PROPOSE, l'agent les
 * enregistre par la saisie habituelle. La production reste comptée à la
 * sortie de chaîne, exactement comme avant. */

export type PassageVue = pq.Passage & { code: string; numero: number; taille: string; of: string; couleur: string };

/** Réponse quand il manque un choix pour enregistrer le scan. */
export type BesoinChoix =
  | { besoin: "of"; numero: number; choix: { code: string; of: string; couleur: string; taille: string; qte: number }[] }
  | { besoin: "morceau"; code: string; numero: number; morceaux: string[] }
  | { besoin: "poste"; code: string; numero: number; postes: string[] };

async function contexteJournee(ex: Executeur, journeeId: number) {
  const [j] = await ex.select().from(journee).where(eq(journee.id, journeeId));
  if (!j) throw new Error("Journée introuvable.");
  const [m] = await ex.select({ commandeId: modele.commandeId, nom: modele.nom }).from(modele).where(eq(modele.id, j.modeleId));
  let roster: JourneeOuvriere[] = j.ouvrieres ?? [];
  if (!roster.length) {
    roster = await ex
      .select({ id: ouvriere.id, nom: ouvriere.nom, poste: ouvriere.poste, sam: ouvriere.sam, personnelId: ouvriere.personnelId })
      .from(ouvriere)
      .where(eq(ouvriere.chaineId, j.chaineId));
  }
  const ofs = m?.commandeId != null ? await idsFreres(ex as typeof db, m.commandeId) : [];
  return { j, roster, ofs, modeleNom: m?.nom ?? "" };
}

const versPassage = (r: typeof paquetReleve.$inferSelect, p: { code: string; numero: number; taille: string; ofNumber: string; couleur: string }): PassageVue => ({
  id: r.id, paquetId: r.paquetId, morceau: r.liasse, poste: r.poste, ouvrier: r.ouvrier, ouvId: r.ouvId, journeeId: r.journeeId,
  heure: r.heure, date: r.date, qte: r.qte ?? 0, code: p.code, numero: p.numero, taille: p.taille, of: p.ofNumber, couleur: p.couleur,
});

export async function finirAuPoste(v: {
  journeeId: number;
  ouvId: number;
  col: string;
  /** Ce que la caméra ou la douchette a lu, ou le numéro tapé. */
  scan: string;
  /** Choix complémentaires, quand le premier appel les a demandés. */
  code?: string;
  morceau?: string;
  poste?: string;
  par: string;
}): Promise<{ passage: PassageVue } | BesoinChoix> {
  if (!(await suiviPaquetsActif())) throw new Error("Le suivi par paquets n'est pas activé.");
  return db.transaction(async (t) => {
    const { j, roster, ofs } = await contexteJournee(t, v.journeeId);
    if (j.cloture) throw new Error("Journée clôturée : rouvrez-la au bureau pour scanner.");
    const o = roster.find((x) => x.id === v.ouvId);
    if (!o) throw new Error("Ouvrière introuvable dans cette journée.");
    if (!(j.cols ?? []).includes(v.col)) throw new Error("Heure inconnue pour cette journée.");
    if (!ofs.length) throw new Error("Ce modèle n'est relié à aucune commande : ses paquets sont inconnus (fiche du modèle → commande).");

    /* 1) Quel paquet ? Un code (QR, douchette) est sans ambiguïté ; un
     *    numéro tapé peut exister dans plusieurs OF du même modèle. */
    let code = (v.code ?? "").trim().toUpperCase();
    let rang: number | null = null;
    if (!code) {
      const lu = pq.lireScanPaquet(v.scan);
      if (lu) {
        code = lu.code;
        rang = lu.rang;
      } else {
        const n = Number((v.scan ?? "").trim());
        if (!Number.isInteger(n) || n < 1) throw new Error(`« ${v.scan} » n'est ni une étiquette de paquet ni un numéro.`);
        const cands = await t
          .select()
          .from(paquet)
          .where(and(inArray(paquet.commandeId, ofs), eq(paquet.numero, n), eq(paquet.statut, "actif")))
          .orderBy(asc(paquet.commandeId));
        if (!cands.length) throw new Error(`Aucun paquet n° ${n} dans les OF de ce modèle.`);
        if (cands.length > 1) {
          return {
            besoin: "of" as const,
            numero: n,
            choix: cands.map((c) => ({ code: c.code, of: c.ofNumber, couleur: c.couleur, taille: c.taille, qte: pq.qteEffective(c) })),
          };
        }
        code = cands[0].code;
      }
    } else {
      rang = pq.lireScanPaquet(v.scan ?? "")?.rang ?? null;
    }

    const [p] = await t.select().from(paquet).where(eq(paquet.code, code)).for("update");
    if (!p) throw new Error(`Paquet ${code} inconnu : vérifiez l'étiquette.`);
    if (!ofs.includes(p.commandeId)) {
      throw new Error(`Le paquet ${p.numero} (${p.ofNumber}${p.couleur ? ` · ${p.couleur}` : ""}) n'appartient pas aux OF de ce modèle.`);
    }

    // 2) Quel morceau ? Celui de l'étiquette scannée, sinon il faut choisir.
    const morceaux = pq.morceauxActifs(p.liasses, p.morceauxAnnules);
    let morceau = (v.morceau ?? "").trim() || pq.morceauDuRang(p.liasses, rang) || "";
    if (!morceau && morceaux.length === 1) morceau = morceaux[0];
    if (!morceau) return { besoin: "morceau" as const, code: p.code, numero: p.numero, morceaux };

    // 3) Quel poste ? Celui de l'heure ; deux postes dans l'heure → choisir.
    const detail = (j.opsDetail?.[v.ouvId]?.[v.col] ?? []).map((d) => d.poste).filter(Boolean);
    let poste = (v.poste ?? "").trim();
    if (!poste) {
      if (detail.length > 1) return { besoin: "poste" as const, code: p.code, numero: p.numero, postes: [...new Set(detail)] };
      poste = detail[0] || j.opsPoste?.[v.ouvId]?.[v.col] || o.poste || "";
    }

    const releves = await t.select().from(paquetReleve).where(eq(paquetReleve.paquetId, p.id)).orderBy(asc(paquetReleve.id));
    const journal = releves.map(versReleveComplet);
    const etat = pq.etatPaquet(morceaux, journal);
    const deja = pq.passagesValables(journal).map((r) => ({ morceau: r.liasse, poste: r.poste ?? "", ouvrier: r.ouvrier ?? "", date: r.date, heure: r.heure ?? "" }));
    const nom = p.liasses.find((l) => l.toLowerCase() === morceau.toLowerCase()) ?? morceau;
    const refus = pq.refusFiniAuPoste({ statutPaquet: p.statut, assemble: etat.assemble, morceau: nom, morceaux, poste, deja });
    if (refus) throw new Error(`Paquet ${p.numero} – ${nom} : ${refus}`);

    const [r] = await t
      .insert(paquetReleve)
      .values({
        paquetId: p.id, liasse: nom, etape: "poste", qte: pq.qteEffective(p), note: "", date: j.date,
        poste, ouvrier: o.nom, ouvId: o.id, journeeId: j.id, heure: v.col, createdBy: v.par,
      })
      .returning();
    return { passage: versPassage(r, p) };
  });
}

const versReleveComplet = (r: typeof paquetReleve.$inferSelect): pq.Releve => ({
  ...versReleve(r),
  poste: r.poste,
  ouvrier: r.ouvrier,
  heure: r.heure,
});

/** Les paquets finis dans une journée (passages valables), pour la saisie. */
export async function passagesDeJournee(journeeId: number): Promise<PassageVue[]> {
  const lignes = await db
    .select({ r: paquetReleve, p: paquet })
    .from(paquetReleve)
    .innerJoin(paquet, eq(paquetReleve.paquetId, paquet.id))
    .where(and(eq(paquetReleve.journeeId, journeeId), eq(paquetReleve.etape, "poste")))
    .orderBy(asc(paquetReleve.id));
  if (!lignes.length) return [];
  const annules = new Set(
    (
      await db
        .select({ a: paquetReleve.annuleId })
        .from(paquetReleve)
        .where(and(eq(paquetReleve.etape, "annulation"), inArray(paquetReleve.annuleId, lignes.map((l) => l.r.id))))
    ).map((x) => x.a),
  );
  return lignes.filter((l) => !annules.has(l.r.id)).map((l) => versPassage(l.r, l.p));
}

/** Annule un « fini au poste » scanné par erreur : il reste au journal. */
export async function annulerPassage(releveId: number, motif: string, par: string): Promise<void> {
  const [r] = await db.select({ etape: paquetReleve.etape }).from(paquetReleve).where(eq(paquetReleve.id, releveId));
  if (!r) throw new Error("Relevé introuvable.");
  if (r.etape !== "poste") throw new Error("Ce relevé n'est pas un passage au poste.");
  await annulerReleve(releveId, motif || "Scan annulé dans la saisie horaire", par);
}

/* ═══════════ corrections tracées ═══════════ */

/** La coupe corrige la quantité réelle d'un paquet (23 au lieu de 25). La
 * quantité imprimée reste figée ; la correction est tracée au journal. */
export async function corrigerQuantite(paquetId: number, qte: number, motif: string, par: string): Promise<void> {
  if (!Number.isInteger(qte) || qte < 0 || qte > pq.PIECES_PAR_PAQUET_MAX) throw new Error("Quantité invalide.");
  if (!motif.trim()) throw new Error("Le motif de la correction est obligatoire.");
  await db.transaction(async (t) => {
    const [p] = await t.select().from(paquet).where(eq(paquet.id, paquetId)).for("update");
    if (!p) throw new Error("Paquet introuvable.");
    if (p.statut !== "actif") throw new Error("Paquet annulé.");
    if (pq.qteEffective(p) === qte) throw new Error("C'est déjà la quantité du paquet.");
    await t.update(paquet).set({ qteReelle: qte === p.qte ? null : qte }).where(eq(paquet.id, paquetId));
    await t.insert(paquetReleve).values({
      paquetId, liasse: "", etape: "correction", qte, date: new Date().toISOString().slice(0, 10),
      note: `${pq.qteEffective(p)} → ${qte} : ${motif.trim().slice(0, 250)}`, createdBy: par,
    });
  });
}

/** Ajoute un morceau oublié à tous les paquets actifs d'un OF (et à son
 * plan, pour les coupes suivantes). Ses étiquettes s'impriment ensuite. */
export async function ajouterMorceau(commandeId: number, nom: string): Promise<number> {
  const propre = pq.normaliserLiasses([nom])[0];
  if (!nom.trim() || propre === pq.LIASSE_UNIQUE) throw new Error("Donnez le nom du morceau (ex. « Poignet »).");
  return db.transaction(async (t) => {
    const ps = await t.select().from(paquet).where(and(eq(paquet.commandeId, commandeId), eq(paquet.statut, "actif"))).for("update");
    let n = 0;
    for (const p of ps) {
      const base = p.liasses.length ? p.liasses : [pq.LIASSE_UNIQUE];
      if (base.some((l) => l.toLowerCase() === propre.toLowerCase())) {
        // Morceau déjà là mais annulé : on le réactive.
        if (p.morceauxAnnules.some((l) => l.toLowerCase() === propre.toLowerCase())) {
          await t.update(paquet).set({ morceauxAnnules: p.morceauxAnnules.filter((l) => l.toLowerCase() !== propre.toLowerCase()) }).where(eq(paquet.id, p.id));
          n++;
        }
        continue;
      }
      if (base.length >= pq.LIASSES_MAX) throw new Error(`Paquet ${p.numero} : ${pq.LIASSES_MAX} morceaux au plus.`);
      await t.update(paquet).set({ liasses: [...base, propre] }).where(eq(paquet.id, p.id));
      n++;
    }
    const [c] = await t.select({ parentId: commande.parentId }).from(commande).where(eq(commande.id, commandeId));
    const porteur = c?.parentId ?? commandeId;
    const [plan] = await t.select({ l: commandePlan.liasses }).from(commandePlan).where(eq(commandePlan.commandeId, porteur));
    if (plan && !plan.l.some((l) => l.toLowerCase() === propre.toLowerCase())) {
      await t.update(commandePlan).set({ liasses: pq.normaliserLiasses([...plan.l, propre]) }).where(eq(commandePlan.commandeId, porteur));
    }
    return n;
  });
}

/** Annule un morceau (ajouté par erreur) sur les paquets d'un OF. Il reste
 * dans la liste — ses étiquettes ont pu circuler — mais ne compte plus. */
export async function annulerMorceau(commandeId: number, nom: string): Promise<number> {
  return db.transaction(async (t) => {
    const ps = await t.select().from(paquet).where(and(eq(paquet.commandeId, commandeId), eq(paquet.statut, "actif"))).for("update");
    let n = 0;
    for (const p of ps) {
      const vrai = p.liasses.find((l) => l.toLowerCase() === nom.trim().toLowerCase());
      if (!vrai || p.morceauxAnnules.some((l) => l.toLowerCase() === vrai.toLowerCase())) continue;
      if (pq.morceauxActifs(p.liasses, [...p.morceauxAnnules, vrai]).length === 1 && pq.morceauxActifs(p.liasses, [...p.morceauxAnnules, vrai])[0] === pq.LIASSE_UNIQUE) {
        throw new Error("Un paquet garde au moins un morceau.");
      }
      await t.update(paquet).set({ morceauxAnnules: [...p.morceauxAnnules, vrai] }).where(eq(paquet.id, p.id));
      n++;
    }
    return n;
  });
}

/** Morceaux à proposer pour une coupe : ceux du plan ; sinon ceux du dernier
 * OF du même modèle chez le même client (« retenus pour le modèle »). */
export async function morceauxProposes(porteurId: number): Promise<string[]> {
  const [plan] = await db.select({ l: commandePlan.liasses }).from(commandePlan).where(eq(commandePlan.commandeId, porteurId));
  if (Array.isArray(plan?.l) && plan!.l.length) return plan!.l;
  const [c] = await db.select({ modele: commande.modele, clientId: commande.clientId }).from(commande).where(eq(commande.id, porteurId));
  if (!c) return [];
  const nom = normaliserNom(c.modele);
  const memes = (
    await db
      .select({ id: commande.id, modele: commande.modele })
      .from(commande)
      .where(c.clientId == null ? sql`${commande.clientId} is null` : eq(commande.clientId, c.clientId))
  )
    .filter((x) => x.id !== porteurId && normaliserNom(x.modele) === nom)
    .map((x) => x.id);
  if (!memes.length) return [];
  const [dernier] = await db
    .select({ l: paquet.liasses })
    .from(paquet)
    .where(inArray(paquet.commandeId, memes))
    .orderBy(desc(paquet.id))
    .limit(1);
  const l = dernier?.l ?? [];
  return l.length === 1 && l[0] === pq.LIASSE_UNIQUE ? [] : l;
}

/** Les fiches de coupe validées SANS paquets (validées avant l'activation du
 * suivi) : on peut leur créer leurs paquets après coup. */
export async function fichesSansPaquets(commandeIds?: number[]) {
  const fiches = await db
    .select({ id: coupeFiche.id, numero: coupeFiche.numero, commandeId: coupeFiche.commandeId, date: coupeFiche.date, type: coupeFiche.type })
    .from(coupeFiche)
    .where(and(eq(coupeFiche.statut, "validee"), commandeIds?.length ? inArray(coupeFiche.commandeId, commandeIds) : sql`true`))
    .orderBy(desc(coupeFiche.id));
  if (!fiches.length) return [];
  const avec = new Set(
    (await db.select({ f: paquet.ficheId }).from(paquet).where(inArray(paquet.ficheId, fiches.map((f) => f.id)))).map((x) => x.f),
  );
  return fiches.filter((f) => !avec.has(f.id) && f.type !== "soustraite");
}

export async function creerPaquetsApresCoup(ficheId: number, par: string): Promise<number> {
  if (!(await suiviPaquetsActif())) throw new Error("Activez d'abord le suivi par paquets.");
  return db.transaction(async (t) => {
    await t.execute(sql`select pg_advisory_xact_lock(hashtext('paquets_fiche'), ${ficheId})`);
    const [deja] = await t.select({ id: paquet.id }).from(paquet).where(eq(paquet.ficheId, ficheId)).limit(1);
    if (deja) throw new Error("Cette fiche a déjà ses paquets.");
    const n = await creerPaquetsPourFiche(t, ficheId, par);
    if (!n) throw new Error("Aucun paquet créé : fiche annulée, sous-traitée, ou sans pièce coupée.");
    return n;
  });
}

/** Tout ce qui est arrivé à un paquet : qui l'a fini à quel poste, quand. */
export async function historiquePaquet(code: string) {
  const lu = pq.lireScanPaquet(code);
  if (!lu) return null;
  const [p] = await db.select().from(paquet).where(eq(paquet.code, lu.code));
  if (!p) return null;
  const releves = await db.select().from(paquetReleve).where(eq(paquetReleve.paquetId, p.id)).orderBy(asc(paquetReleve.id));
  const annules = new Set(releves.filter((r) => r.etape === "annulation").map((r) => r.annuleId));
  const nomsChaines = new Map(
    (
      await db
        .select({ jid: journee.id, chaine: chaine.nom })
        .from(journee)
        .innerJoin(chaine, eq(journee.chaineId, chaine.id))
        .where(inArray(journee.id, [...new Set(releves.map((r) => r.journeeId).filter((x): x is number => x != null))].concat(-1)))
    ).map((x) => [x.jid, x.chaine]),
  );
  return {
    paquet: { ...p, qteEffective: pq.qteEffective(p), morceaux: pq.morceauxActifs(p.liasses, p.morceauxAnnules) },
    lignes: releves
      .filter((r) => r.etape !== "annulation")
      .map((r) => ({ ...r, annule: annules.has(r.id), chaine: r.journeeId != null ? (nomsChaines.get(r.journeeId) ?? "") : "" })),
  };
}
