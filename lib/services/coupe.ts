import "server-only";
import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { client, commande, coupe, coupeFiche, faconnier, pvCoupe, tissuLot, tissuMouvement, tissuRouleau } from "@/lib/db/schema";
import * as biz from "@/lib/domain/commande";
import * as cp from "@/lib/domain/coupe";
import * as pc from "@/lib/domain/plan-coupe";
import * as rl from "@/lib/domain/rouleau";
import { getSetting } from "@/lib/services/permissions";
import { getPlan } from "@/lib/services/plan-coupe";
import { recalculerCommande } from "@/lib/services/aval";
import { chargerRouleaux, declarerConsommation, recalculerStatut } from "@/lib/services/rouleaux";

/* Module COUPE — la coupe part du PLAN DE COUPE.
 *
 *   Commande → OF → Plan de coupe → Fiche de coupe → Consommation → PV client
 *
 * Rien n'est dupliqué : la fiche LIT la commande, le plan, les rouleaux ; elle
 * écrit le coupé dans la table `coupe` existante (une ligne par OF × taille,
 * le prévu figé à côté), qui reste la seule source de `commande.coupeQte`. La
 * consommation tissu passe par les mouvements de rouleaux existants ; la fiche
 * ne SORT rien du stock (la sortie a été faite au magasin). */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executeur = typeof db | Tx;
const r2 = (n: number) => Math.round(n * 100) / 100 + 0;
const versGrille = (t: { taille: string; qte: number }[]) => Object.fromEntries(t.map((x) => [String(x.taille), x.qte]));

export const seuilEcart = () => getSetting<number>(cp.CLE_SEUIL_ECART, cp.SEUIL_ECART_DEFAUT);

/* ═══════════ contexte d'une nouvelle fiche ═══════════ */

export type MembreContexte = cp.MembreCoupe & { modele: string; couleur: string; qte: number; coupeQte: number };

export type RouleauCoupe = {
  code: string;
  lot: string;
  tissu: string;
  couleur: string;
  unite: string;
  /** Sorti vers les OF du groupe (net des retours). */
  sorti: number;
  /** Encore dehors, non déclaré (ce qu'on peut déclarer maintenant). */
  enCoupe: number;
  /** Consommé + chute déjà déclarés au scan pour ces OF, pas encore rattachés à une fiche. */
  dejaDeclare: number;
};

export type ContexteCoupe = {
  porteur: { id: number; of: string; modele: string; refArticle: string; couleur: string; client: string; faconnier: string; sousTraitee: boolean; consoTheo: number | null };
  membres: MembreContexte[];
  plan: {
    etat: pc.EtatPlan;
    sizes: string[];
    prevu: Record<string, number>;
    /** traces = pièces des matelas (plis × tracé) ; ordre = quantités à couper du plan. */
    source: "traces" | "ordre";
    matieres: { rang: number; nom: string; lotId: number | null; consoPrevue: number | null; metrage: number }[];
  } | null;
  rouleaux: RouleauCoupe[];
  /** Mouvements de lots suivis en bloc (sans rouleaux) pour ces OF, non rattachés. */
  lotsBloc: { lot: string; tissu: string; couleur: string; unite: string; net: number }[];
  seuil: number;
  fiches: FicheResume[];
};

/** Le porteur d'une commande (elle-même si elle n'est rattachée à rien). */
export async function porteurDe(commandeId: number): Promise<number | null> {
  const [c] = await db.select({ id: commande.id, parentId: commande.parentId }).from(commande).where(eq(commande.id, commandeId));
  if (!c) return null;
  return c.parentId ?? c.id;
}

async function membresDuGroupe(ex: Executeur, porteurId: number) {
  const [p] = await ex
    .select({ c: commande, clientNom: client.nom, faconnierNom: faconnier.nom })
    .from(commande)
    .leftJoin(client, eq(commande.clientId, client.id))
    .leftJoin(faconnier, eq(commande.faconnierId, faconnier.id))
    .where(eq(commande.id, porteurId));
  if (!p) return null;
  const enfants = await ex.select().from(commande).where(eq(commande.parentId, porteurId)).orderBy(asc(commande.id));
  /* Porteur d'une DÉCOUPE : sa grille est celle du contrat entier ; ses parts
     en prennent une portion. Sa part propre = sa grille moins celles des parts. */
  const grillePorteur = versGrille(p.c.tailles);
  for (const e of enfants.filter((x) => x.lienParent === "decoupe")) {
    for (const t of e.tailles) grillePorteur[String(t.taille)] = Math.max(0, (grillePorteur[String(t.taille)] ?? 0) - t.qte);
  }
  const membres: MembreContexte[] = [
    {
      id: p.c.id, of: p.c.ofNumber, porteur: true, qtePropre: biz.qtePropre(p.c, enfants), tailles: grillePorteur,
      modele: p.c.modele, couleur: p.c.couleur, qte: p.c.qte, coupeQte: p.c.coupeQte,
    },
    ...enfants.map((e) => ({
      id: e.id, of: e.ofNumber, porteur: false, qtePropre: e.qte, tailles: versGrille(e.tailles),
      modele: e.modele, couleur: e.couleur, qte: e.qte, coupeQte: e.coupeQte,
    })),
  ];
  return { porteur: p, membres };
}

/** Prévu par taille : les pièces réellement posées dans les matelas (plis ×
 * tracé) quand la modéliste a fait ses tracés ; sinon les quantités à couper
 * du plan. */
function prevuDuPlan(plan: pc.Plan) {
  const m = pc.matierePrincipale(plan);
  const traces = m ? pc.piecesParTaille(m, plan.sizes) : {};
  const total = Object.values(traces).reduce((s, x) => s + x, 0);
  if (total > 0) return { prevu: traces, source: "traces" as const };
  return { prevu: Object.fromEntries(plan.sizes.map((s) => [s, Math.round(Number(plan.ordre[s]) || 0)])), source: "ordre" as const };
}

async function tissuDuGroupe(ex: Executeur, ids: number[]) {
  const mvts = await ex.select().from(tissuMouvement).where(inArray(tissuMouvement.commandeId, ids));
  const tous = await ex
    .select()
    .from(tissuMouvement)
    .where(inArray(tissuMouvement.rouleauId, [...new Set(mvts.map((m) => m.rouleauId).filter((x): x is number => x != null))].concat(-1)));
  const annules = new Set(tous.filter((m) => m.sens === "annulation" && m.annuleId != null).map((m) => m.annuleId!));
  const annulesLot = new Set(mvts.filter((m) => m.sens === "annulation" && m.annuleId != null).map((m) => m.annuleId!));
  const effectif = (m: { id: number; sens: string }) => m.sens !== "annulation" && !annules.has(m.id) && !annulesLot.has(m.id);
  return { mvts: mvts.filter(effectif), tous };
}

export async function contexteCoupe(commandeId: number): Promise<ContexteCoupe | null> {
  const porteurId = await porteurDe(commandeId);
  if (porteurId == null) return null;
  const g = await membresDuGroupe(db, porteurId);
  if (!g) return null;
  const ids = g.membres.map((m) => m.id);
  const [plan, seuil, fiches, { mvts }] = await Promise.all([getPlan(porteurId), seuilEcart(), listFiches({ commandeIds: [porteurId] }), tissuDuGroupe(db, ids)]);

  // Rouleaux sortis pour les OF du groupe.
  const parRouleau = new Map<number, { sorti: number; deja: number }>();
  for (const m of mvts) {
    if (m.rouleauId == null) continue;
    const e = parRouleau.get(m.rouleauId) ?? { sorti: 0, deja: 0 };
    if (m.sens === "sortie") e.sorti += m.quantite;
    if (m.sens === "retour") e.sorti -= m.quantite;
    if ((m.sens === "consommation" || m.sens === "chute") && m.coupeFicheId == null) e.deja += m.quantite;
    parRouleau.set(m.rouleauId, e);
  }
  const rs = await chargerRouleaux({ ids: [...parRouleau.keys()] });
  const rouleaux: RouleauCoupe[] = rs
    .map((r) => ({
      code: r.code,
      lot: r.lot.identifiant,
      tissu: [r.lot.reference, r.lot.composition].filter(Boolean).join(" · "),
      couleur: [r.lot.couleur, r.lot.codeCouleur].filter(Boolean).join(" · "),
      unite: r.lot.unite,
      sorti: r2(parRouleau.get(r.id)?.sorti ?? 0),
      enCoupe: r2(r.bilan.enCoupe),
      dejaDeclare: r2(parRouleau.get(r.id)?.deja ?? 0),
    }))
    .filter((r) => r.sorti > 0.001 || r.dejaDeclare > 0.001);

  // Lots suivis en bloc : sorties nettes vers ces OF, pas encore rattachées.
  const parLot = new Map<number, number>();
  for (const m of mvts) {
    if (m.rouleauId != null || m.coupeFicheId != null) continue;
    if (m.sens === "sortie") parLot.set(m.lotId, (parLot.get(m.lotId) ?? 0) + m.quantite);
    if (m.sens === "retour") parLot.set(m.lotId, (parLot.get(m.lotId) ?? 0) - m.quantite);
  }
  const lots = parLot.size ? await db.select().from(tissuLot).where(inArray(tissuLot.id, [...parLot.keys()])) : [];
  const lotsBloc = lots
    .map((l) => ({ lot: l.identifiant, tissu: [l.reference, l.composition].filter(Boolean).join(" · "), couleur: l.couleur, unite: l.unite, net: r2(parLot.get(l.id) ?? 0) }))
    .filter((l) => l.net > 0.001);

  const p = g.porteur;
  return {
    porteur: {
      id: p.c.id, of: p.c.ofNumber, modele: p.c.modele, refArticle: p.c.refArticle, couleur: p.c.couleur, client: p.clientNom ?? "",
      faconnier: p.faconnierNom ?? "", sousTraitee: biz.estSousTraitee({ faconnier: p.faconnierNom ?? "" }), consoTheo: p.c.consoTheo,
    },
    membres: g.membres,
    plan: plan
      ? {
          etat: pc.etatPlan(plan),
          sizes: plan.sizes,
          ...prevuDuPlan(plan),
          matieres: plan.matieres.map((m) => ({ rang: m.rang, nom: m.nom, lotId: m.lotId, consoPrevue: m.consoPrevue, metrage: r2(pc.consoTotale(m)) })),
        }
      : null,
    rouleaux,
    lotsBloc,
    seuil,
    fiches,
  };
}

/* ═══════════ validation ═══════════ */

export type SaisieFiche = {
  commandeId: number;
  date: string;
  type: string;
  /** Coupé par OF (id) et par taille. */
  coupe: Record<number, Record<string, number>>;
  motif: string;
  precision: string;
  note: string;
  matiereRang: number;
  /** Consommation déclarée maintenant, rouleau par rouleau. */
  consommations: { code: string; consomme: number; chute: number }[];
};

export async function validerFiche(v: SaisieFiche, par: string): Promise<{ id: number; numero: string }> {
  return db.transaction(async (t) => {
    const porteurId = await porteurDe(v.commandeId);
    if (porteurId == null) throw new Error("Commande introuvable.");
    const g = await membresDuGroupe(t, porteurId);
    const plan = await getPlan(porteurId);
    if (!g || !plan) throw new Error("Pas de plan de coupe pour cette commande : la coupe part du plan (Bureau modélisme → Plan de coupe).");
    const { prevu } = prevuDuPlan(plan);
    const sizes = plan.sizes;
    const seuil = await seuilEcart();

    // Totaux par taille sur le groupe, depuis la saisie par OF.
    const ids = new Set(g.membres.map((m) => m.id));
    for (const k of Object.keys(v.coupe ?? {})) if (!ids.has(Number(k))) throw new Error("Un OF saisi n'appartient pas à ce groupe.");
    const ent = (x: unknown) => {
      const n = Number(x);
      if (!Number.isFinite(n) || n < 0 || Math.round(n) !== n) throw new Error("Quantité coupée invalide (entier positif attendu).");
      return n;
    };
    const coupeTotal: Record<string, number> = Object.fromEntries(sizes.map((s) => [s, 0]));
    for (const m of g.membres) for (const s of sizes) coupeTotal[s] += ent(v.coupe?.[m.id]?.[s] ?? 0);
    const cmdMembre = cp.commandeParMembre(sizes, prevu, g.membres);
    const cmdTotal: Record<string, number> = Object.fromEntries(sizes.map((s) => [s, g.membres.reduce((a, m) => a + cmdMembre[m.id][s], 0)]));
    const lignes = cp.ecartsCoupe(sizes, cmdTotal, prevu, coupeTotal, seuil);
    const refus = cp.refusValidation(lignes, v.motif, v.precision ?? "");
    if (refus) throw new Error(refus);
    if (v.motif && !cp.MOTIFS_ECART.some((m) => m.value === v.motif)) throw new Error("Motif d'écart inconnu.");

    // Numéro CP-AAAA-NNN (verrou : deux validations simultanées ne prennent pas le même).
    await t.execute(sql`select pg_advisory_xact_lock(hashtext('coupe_fiche'))`);
    const nums = await t.select({ n: coupeFiche.numero }).from(coupeFiche);
    const numero = cp.prochainNumero("CP", new Date().getFullYear(), nums.map((x) => x.n));
    const m = plan.matieres.find((x) => x.rang === v.matiereRang) ?? pc.matierePrincipale(plan);
    const [fiche] = await t
      .insert(coupeFiche)
      .values({
        numero,
        commandeId: porteurId,
        date: v.date || new Date().toISOString().slice(0, 10),
        type: v.type === "soustraite" ? "soustraite" : "interne",
        matiereRang: m?.rang ?? 0,
        matiereNom: m?.nom ?? "",
        consoPrevuePiece: m?.consoPrevue ?? g.porteur.c.consoTheo ?? null,
        metragePlan: m ? r2(pc.consoTotale(m)) || null : null,
        seuilEcartPct: seuil,
        motifEcart: lignes.some((l) => l.ecart !== 0) ? v.motif ?? "" : "",
        precisionEcart: (v.precision ?? "").trim().slice(0, 300),
        note: (v.note ?? "").trim().slice(0, 500),
        createdBy: par,
      })
      .returning({ id: coupeFiche.id });

    // Une ligne par OF × taille : coupé, prévu (part de l'OF) et commandé, figés.
    const prevuMembre = cp.repartitionParDefaut(sizes, prevu, g.membres);
    const valeurs = [];
    for (const mb of g.membres) {
      for (const s of sizes) {
        const q = ent(v.coupe?.[mb.id]?.[s] ?? 0);
        if (q === 0 && prevuMembre[mb.id][s] === 0 && cmdMembre[mb.id][s] === 0) continue;
        valeurs.push({
          commandeId: mb.id, date: v.date || new Date().toISOString().slice(0, 10), qte: q, taille: s,
          type: v.type === "soustraite" ? "soustraite" : "interne", note: numero, ficheId: fiche.id,
          qtePrevue: prevuMembre[mb.id][s], qteCommandee: cmdMembre[mb.id][s],
        });
      }
    }
    if (valeurs.length) await t.insert(coupe).values(valeurs);

    // Tissu : consommations déclarées maintenant (sur les rouleaux sortis)…
    for (const c of v.consommations ?? []) {
      if (!(c.consomme > 0 || c.chute > 0)) continue;
      await declarerConsommation(t, { code: c.code, consomme: c.consomme, chute: c.chute, motif: `Coupe ${numero}`, par, coupeFicheId: fiche.id });
    }
    // …et celles déjà déclarées au scan pour ces OF, rattachées à la fiche.
    const groupe = [...ids];
    await t
      .update(tissuMouvement)
      .set({ coupeFicheId: fiche.id })
      .where(
        and(
          inArray(tissuMouvement.commandeId, groupe),
          isNull(tissuMouvement.coupeFicheId),
          or(
            and(sql`${tissuMouvement.rouleauId} is not null`, inArray(tissuMouvement.sens, ["consommation", "chute"])),
            and(isNull(tissuMouvement.rouleauId), inArray(tissuMouvement.sens, ["sortie", "retour"])),
          ),
        ),
      );

    for (const id of groupe) await recalculerCommande(t, id);
    return { id: fiche.id, numero };
  });
}

/** Annule une fiche : elle reste visible (barrée), ses lignes sortent du
 * coupé, les consommations qu'ELLE a déclarées sont annulées (mouvements
 * d'annulation, l'original reste), celles qu'elle avait seulement rattachées
 * sont détachées pour pouvoir l'être à la fiche refaite. */
export async function annulerFiche(id: number, motif: string, par: string): Promise<string> {
  if (!motif.trim()) throw new Error("Le motif de l'annulation est obligatoire.");
  return db.transaction(async (t) => {
    const [f] = await t.select().from(coupeFiche).where(eq(coupeFiche.id, id)).for("update");
    if (!f) throw new Error("Fiche introuvable.");
    if (f.statut !== "validee") throw new Error(`La fiche ${f.numero} est déjà annulée.`);
    await t.update(coupeFiche).set({ statut: "annulee", annulePar: par, annuleLe: new Date(), motifAnnulation: motif.trim().slice(0, 300) }).where(eq(coupeFiche.id, id));

    const rattaches = await t.select().from(tissuMouvement).where(eq(tissuMouvement.coupeFicheId, id));
    const dejaAnnules = new Set(
      (await t.select({ a: tissuMouvement.annuleId }).from(tissuMouvement).where(and(eq(tissuMouvement.sens, "annulation"), inArray(tissuMouvement.annuleId, rattaches.map((m) => m.id).concat(-1))))).map((x) => x.a),
    );
    const rouleaux = new Set<number>();
    for (const m of rattaches) {
      if (m.motif === `Coupe ${f.numero}` && (m.sens === "consommation" || m.sens === "chute")) {
        if (dejaAnnules.has(m.id)) continue;
        await t.insert(tissuMouvement).values({
          lotId: m.lotId, rouleauId: m.rouleauId, sens: "annulation", quantite: 0, annuleId: m.id,
          commandeId: m.commandeId, commandeLabel: m.commandeLabel, motif: `Annulation fiche ${f.numero} : ${motif.trim()}`.slice(0, 300),
          valeurAvant: `${rl.sensLabel(m.sens)} ${m.quantite}`, valeurApres: "annulé", createdBy: par, coupeFicheId: id,
        });
        if (m.rouleauId != null) rouleaux.add(m.rouleauId);
      } else {
        await t.update(tissuMouvement).set({ coupeFicheId: null }).where(eq(tissuMouvement.id, m.id));
      }
    }
    for (const r of rouleaux) await recalculerStatut(t, r);
    const lignes = await t.select({ c: coupe.commandeId }).from(coupe).where(eq(coupe.ficheId, id));
    for (const c of new Set([f.commandeId, ...lignes.map((l) => l.c)])) await recalculerCommande(t, c);
    return f.numero;
  });
}

/* ═══════════ lecture ═══════════ */

export type FicheResume = {
  id: number;
  numero: string;
  date: string;
  statut: string;
  commandeId: number;
  pieces: number;
  prevu: number;
  pv: string;
  pvVersion: number;
};

export async function listFiches(f: { commandeIds?: number[] } = {}): Promise<FicheResume[]> {
  const fiches = await db
    .select()
    .from(coupeFiche)
    .where(f.commandeIds ? inArray(coupeFiche.commandeId, f.commandeIds.concat(-1)) : undefined)
    .orderBy(desc(coupeFiche.id));
  if (!fiches.length) return [];
  const ids = fiches.map((x) => x.id);
  const [tot, pvs] = await Promise.all([
    db
      .select({ ficheId: coupe.ficheId, q: sql<number>`coalesce(sum(${coupe.qte}),0)::int`, p: sql<number>`coalesce(sum(${coupe.qtePrevue}),0)::int` })
      .from(coupe)
      .where(inArray(coupe.ficheId, ids))
      .groupBy(coupe.ficheId),
    db.select({ ficheId: pvCoupe.ficheId, numero: pvCoupe.numero, v: pvCoupe.version }).from(pvCoupe).where(inArray(pvCoupe.ficheId, ids)),
  ]);
  return fiches.map((x) => {
    const t = tot.find((y) => y.ficheId === x.id);
    const v = pvs.filter((p) => p.ficheId === x.id).sort((a, b) => b.v - a.v)[0];
    return { id: x.id, numero: x.numero, date: x.date, statut: x.statut, commandeId: x.commandeId, pieces: t?.q ?? 0, prevu: t?.p ?? 0, pv: v?.numero ?? "", pvVersion: v?.v ?? 0 };
  });
}

export type LigneTailleFiche = cp.LigneEcart & { parOf: { of: string; commande: number; prevu: number; coupe: number }[] };

export type DetailFiche = {
  id: number;
  numero: string;
  date: string;
  statut: string;
  type: string;
  createdBy: string;
  createdAt: string;
  annulePar: string;
  annuleLe: string;
  motifAnnulation: string;
  motifEcart: string;
  precisionEcart: string;
  note: string;
  seuil: number;
  commande: { id: number; of: string; modele: string; refArticle: string; couleur: string; client: string; designation: string };
  ofs: { id: number; of: string; modele: string; couleur: string }[];
  matiere: string;
  tissu: { references: string[]; couleurs: string[] };
  sizes: string[];
  lignes: LigneTailleFiche[];
  totaux: { commande: number; prevu: number; coupe: number; ecart: number };
  consommation: { tissu: string; couleur: string; lot: string; rouleau: string; consomme: number; chute: number; total: number; unite: string }[];
  bilan: { theorique: number | null; reel: number; ecart: number | null; pct: number | null; consoPiece: number | null; metragePlan: number | null };
  pvs: { numero: string; version: number; createdBy: string; createdAt: string }[];
};

export async function lireFiche(numero: string, ex: Executeur = db): Promise<DetailFiche | null> {
  const [f] = await ex.select().from(coupeFiche).where(eq(coupeFiche.numero, numero));
  if (!f) return null;
  const [p] = await ex
    .select({ c: commande, clientNom: client.nom })
    .from(commande)
    .leftJoin(client, eq(commande.clientId, client.id))
    .where(eq(commande.id, f.commandeId));
  const lignes = await ex
    .select({ l: coupe, of: commande.ofNumber, modele: commande.modele, couleur: commande.couleur })
    .from(coupe)
    .innerJoin(commande, eq(coupe.commandeId, commande.id))
    .where(eq(coupe.ficheId, f.id))
    .orderBy(asc(coupe.id));
  // Gamme dans l'ordre d'écriture (celui du plan au moment de la coupe).
  const sizes: string[] = [];
  for (const { l } of lignes) if (!sizes.includes(l.taille)) sizes.push(l.taille);
  const ofs: DetailFiche["ofs"] = [];
  for (const x of lignes) if (!ofs.some((o) => o.id === x.l.commandeId)) ofs.push({ id: x.l.commandeId, of: x.of, modele: x.modele, couleur: x.couleur });
  const somme = (k: "qte" | "qtePrevue" | "qteCommandee", s: string) => lignes.filter((x) => x.l.taille === s).reduce((a, x) => a + (x.l[k] ?? 0), 0);
  const base = cp.ecartsCoupe(
    sizes,
    Object.fromEntries(sizes.map((s) => [s, somme("qteCommandee", s)])),
    Object.fromEntries(sizes.map((s) => [s, somme("qtePrevue", s)])),
    Object.fromEntries(sizes.map((s) => [s, somme("qte", s)])),
    f.seuilEcartPct,
  );
  const lignesTaille: LigneTailleFiche[] = base.map((b) => ({
    ...b,
    parOf: ofs.map((o) => {
      const x = lignes.find((y) => y.l.commandeId === o.id && y.l.taille === b.taille);
      return { of: o.of, commande: x?.l.qteCommandee ?? 0, prevu: x?.l.qtePrevue ?? 0, coupe: x?.l.qte ?? 0 };
    }),
  }));

  // Consommation : les mouvements rattachés à la fiche (effectifs).
  const mvts = await ex
    .select({ m: tissuMouvement, code: tissuRouleau.code, lot: tissuLot })
    .from(tissuMouvement)
    .innerJoin(tissuLot, eq(tissuMouvement.lotId, tissuLot.id))
    .leftJoin(tissuRouleau, eq(tissuMouvement.rouleauId, tissuRouleau.id))
    .where(eq(tissuMouvement.coupeFicheId, f.id))
    .orderBy(asc(tissuMouvement.id));
  const annules = new Set(mvts.filter((x) => x.m.sens === "annulation" && x.m.annuleId != null).map((x) => x.m.annuleId!));
  const conso = new Map<string, DetailFiche["consommation"][number]>();
  for (const { m, code, lot } of mvts) {
    if (m.sens === "annulation" || annules.has(m.id)) continue;
    const cle = code ?? `lot:${lot.identifiant}`;
    const e = conso.get(cle) ?? {
      tissu: [lot.reference, lot.composition].filter(Boolean).join(" · "),
      couleur: [lot.couleur, lot.codeCouleur].filter(Boolean).join(" · "),
      lot: lot.identifiant,
      rouleau: code ?? "(lot en bloc)",
      consomme: 0,
      chute: 0,
      total: 0,
      unite: lot.unite,
    };
    if (m.sens === "consommation" || m.sens === "sortie") e.consomme += m.quantite;
    if (m.sens === "retour") e.consomme -= m.quantite;
    if (m.sens === "chute") e.chute += m.quantite;
    e.consomme = r2(e.consomme);
    e.chute = r2(e.chute);
    e.total = r2(e.consomme + e.chute);
    conso.set(cle, e);
  }
  const consommation = [...conso.values()].filter((c) => Math.abs(c.total) > 0.001);
  const reel = consommation.reduce((s, c) => s + c.total, 0);
  const totaux = cp.totalLignes(lignesTaille);
  const pvs = await ex.select().from(pvCoupe).where(eq(pvCoupe.ficheId, f.id)).orderBy(desc(pvCoupe.version));
  const iso = (d: Date | null) => (d ? d.toISOString() : "");
  return {
    id: f.id,
    numero: f.numero,
    date: f.date,
    statut: f.statut,
    type: f.type,
    createdBy: f.createdBy,
    createdAt: iso(f.createdAt),
    annulePar: f.annulePar,
    annuleLe: iso(f.annuleLe),
    motifAnnulation: f.motifAnnulation,
    motifEcart: f.motifEcart,
    precisionEcart: f.precisionEcart,
    note: f.note,
    seuil: f.seuilEcartPct,
    commande: {
      id: p?.c.id ?? f.commandeId, of: p?.c.ofNumber ?? "", modele: p?.c.modele ?? "", refArticle: p?.c.refArticle ?? "", couleur: p?.c.couleur ?? "",
      client: p?.clientNom ?? "", designation: p?.c.modele ?? "",
    },
    ofs,
    matiere: f.matiereNom,
    tissu: { references: [...new Set(consommation.map((c) => c.tissu).filter(Boolean))], couleurs: [...new Set(consommation.map((c) => c.couleur).filter(Boolean))] },
    sizes,
    lignes: lignesTaille,
    totaux,
    consommation,
    bilan: { ...cp.bilanConsommation(f.consoPrevuePiece, totaux.coupe, reel), consoPiece: f.consoPrevuePiece, metragePlan: f.metragePlan },
    pvs: pvs.map((x) => ({ numero: x.numero, version: x.version, createdBy: x.createdBy, createdAt: iso(x.createdAt) })),
  };
}

/* ═══════════ PV de coupe client (versionné) ═══════════ */

export type DonneesPv = DetailFiche & { genereLe: string; generePar: string };

/** Génère le PV (version 1) ou une nouvelle version : les données de la
 * fiche sont COPIÉES dans la version, qui ne changera plus jamais. */
export async function genererPv(ficheId: number, par: string): Promise<{ numero: string; version: number }> {
  return db.transaction(async (t) => {
    const [f] = await t.select().from(coupeFiche).where(eq(coupeFiche.id, ficheId)).for("update");
    if (!f) throw new Error("Fiche introuvable.");
    if (f.statut !== "validee") throw new Error(`La fiche ${f.numero} est annulée : pas de PV.`);
    const detail = await lireFiche(f.numero, t);
    if (!detail) throw new Error("Fiche introuvable.");
    const existants = await t.select({ numero: pvCoupe.numero, version: pvCoupe.version }).from(pvCoupe).where(eq(pvCoupe.ficheId, ficheId));
    let numero = existants[0]?.numero;
    if (!numero) {
      await t.execute(sql`select pg_advisory_xact_lock(hashtext('pv_coupe'))`);
      const tous = await t.selectDistinct({ n: pvCoupe.numero }).from(pvCoupe);
      numero = cp.prochainNumero("PVC", new Date().getFullYear(), tous.map((x) => x.n));
    }
    const version = existants.reduce((m, x) => Math.max(m, x.version), 0) + 1;
    const donnees: DonneesPv = { ...detail, pvs: [], genereLe: new Date().toISOString(), generePar: par };
    await t.insert(pvCoupe).values({ numero, version, ficheId, donnees, createdBy: par });
    return { numero, version };
  });
}

export async function lirePv(numero: string, version?: number) {
  const versions = await db.select().from(pvCoupe).where(eq(pvCoupe.numero, numero)).orderBy(desc(pvCoupe.version));
  if (!versions.length) return null;
  const v = (version ? versions.find((x) => x.version === version) : versions[0]) ?? versions[0];
  const [f] = await db.select({ statut: coupeFiche.statut, numero: coupeFiche.numero }).from(coupeFiche).where(eq(coupeFiche.id, v.ficheId));
  return {
    numero: v.numero,
    version: v.version,
    derniere: versions[0].version,
    versions: versions.map((x) => ({ version: x.version, createdAt: x.createdAt.toISOString(), createdBy: x.createdBy })),
    donnees: v.donnees as DonneesPv,
    ficheAnnulee: f?.statut === "annulee",
  };
}
