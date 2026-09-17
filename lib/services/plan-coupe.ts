import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  client,
  commande,
  commandeEtape,
  commandePlan,
  commandePlanMatiere,
  tissuAffectation,
  tissuLot,
  tissuMouvement,
} from "@/lib/db/schema";
import * as biz from "@/lib/domain/commande";
import * as pc from "@/lib/domain/plan-coupe";
import * as tx from "@/lib/domain/tissu";
import { type Auteur, journaliserFiche, type Tx } from "@/lib/services/journal-fiche";

/* Lecture et écriture du plan de coupe.
 *
 * Le plan s'édite d'un bloc : la modéliste ajoute des tracés, change une
 * hauteur de matelas, relance le proposeur, et n'enregistre qu'ensuite. Les
 * écrans de préparation, eux, enregistrent champ par champ — mais ici chaque
 * frappe déplace six agrégats à la fois, et un aller-retour par cellule ferait
 * de l'éditeur un formulaire. D'où un enregistrement qui REMPLACE le document
 * entier, dans une transaction. */

/* ─────────── contexte de la commande ─────────── */

/** Ce que l'éditeur doit savoir de la commande sur laquelle il travaille. */
export type ContexteCommande = {
  id: number;
  of: string;
  modele: string;
  refArticle: string;
  couleur: string;
  client: string;
  /** Quantité propre à la ligne. */
  qte: number;
  /** Pièces que la coupe doit sortir : celles du groupe pour un porteur. */
  qteGroupe: number;
  tailles: pc.LigneTaille[];
  consoTheo: number | null;
  consoReel: number | null;
  tissuRecu: number;

  /* ── rattachement ── */
  parentId: number | null;
  lienParent: string;
  /** N° OF du porteur quand cette ligne est une sous-commande. */
  porteurOf: string;
  /** Vrai quand d'autres OF dépendent de ce plan. */
  estPorteur: boolean;
  nbMembres: number;

  /* ── ce qui verrouille la correction des tailles ── */
  produit: number;
  coupeQte: number;
  magasinQte: number;
  factureQte: number;
  /** Vrai si des parts de découpe prennent sur cette quantité. */
  aDesParts: boolean;

  /* ── ce que le magasin a saisi côté tissu ──
   * Les matières reçues, avec leur laize travaillable. La modéliste les lit
   * ici pour poser ses tracés sans aller la chercher dans l'écran magasin. */
  /* ── lots du magasin tissu affectés à cette commande (nouveau modèle) ──
   * La modéliste les importe comme matières (nom + laize pré-remplis), et la
   * consommation qu'elle reporte sera déduite de ces lots. */
  tissuMagasin: {
    lotId: number;
    identifiant: string;
    nom: string;
    reference: string;
    couleur: string;
    laize: number | null;
    affecte: number;
    disponible: number;
  }[];
};

/** La commande et son entourage de groupe, en une requête large.
 *
 * Volontairement distinct de `listPreparation()` : l'éditeur travaille sur une
 * seule commande et n'a que faire des feux de toutes les autres. */
/** Les lots du magasin tissu affectés à une commande, avec leur laize et le
 * disponible physique du lot — pour l'import comme matières de plan de coupe. */
async function lotsAffectesACommande(commandeId: number): Promise<ContexteCommande["tissuMagasin"]> {
  const affs = await db
    .select({
      lotId: tissuAffectation.lotId,
      quantite: tissuAffectation.quantite,
      identifiant: tissuLot.identifiant,
      reference: tissuLot.reference,
      couleur: tissuLot.couleur,
      laize: tissuLot.laize,
      recu: tissuLot.quantiteRecue,
    })
    .from(tissuAffectation)
    .leftJoin(tissuLot, eq(tissuAffectation.lotId, tissuLot.id))
    .where(eq(tissuAffectation.commandeId, commandeId));
  if (affs.length === 0) return [];

  // Disponible physique de chaque lot concerné (reçu − consommé net).
  const lotIds = [...new Set(affs.map((a) => a.lotId))];
  const mvts = await db.select().from(tissuMouvement);
  const bilanParLot = new Map<number, number>();
  for (const id of lotIds) {
    const recu = affs.find((a) => a.lotId === id)?.recu ?? 0;
    const m = mvts.filter((x) => x.lotId === id);
    bilanParLot.set(id, tx.bilanLot(recu, [], m).disponible);
  }

  // Somme les affectations par lot (une commande peut avoir plusieurs lignes).
  const parLot = new Map<number, ContexteCommande["tissuMagasin"][number]>();
  for (const a of affs) {
    const e = parLot.get(a.lotId) ?? {
      lotId: a.lotId,
      identifiant: a.identifiant ?? "?",
      nom: a.identifiant ?? "Matière",
      reference: a.reference ?? "",
      couleur: a.couleur ?? "",
      laize: a.laize,
      affecte: 0,
      disponible: bilanParLot.get(a.lotId) ?? 0,
    };
    e.affecte += a.quantite;
    parLot.set(a.lotId, e);
  }
  return [...parLot.values()];
}

export async function contexteCommande(commandeId: number): Promise<ContexteCommande | null> {
  const [ligne] = await db
    .select({ c: commande, clientNom: client.nom })
    .from(commande)
    .leftJoin(client, eq(commande.clientId, client.id))
    .where(eq(commande.id, commandeId));
  if (!ligne) return null;
  const c = ligne.c;

  const enfants = await db.select().from(commande).where(eq(commande.parentId, c.id));
  const [porteur] = c.parentId != null ? await db.select().from(commande).where(eq(commande.id, c.parentId)) : [];

  /* Les lots affectés au groupe : c'est le porteur qui porte la réception. */
  const sourceTissuId = c.parentId ?? c.id;
  const lotsAffectes = await lotsAffectesACommande(sourceTissuId);

  return {
    id: c.id,
    of: c.ofNumber,
    modele: c.modele,
    refArticle: c.refArticle,
    couleur: c.couleur,
    client: ligne.clientNom ?? "",
    qte: c.qte,
    qteGroupe: biz.totauxGroupe(c, enfants).qte,
    tailles: c.tailles.map((t) => ({ taille: String(t.taille), qte: t.qte })),
    consoTheo: c.consoTheo,
    consoReel: c.consoReel,
    tissuRecu: c.tissuRecu,

    parentId: c.parentId,
    lienParent: c.lienParent,
    porteurOf: porteur?.ofNumber ?? "",
    estPorteur: enfants.length > 0,
    nbMembres: enfants.length + 1,

    produit: c.produit,
    coupeQte: c.coupeQte,
    magasinQte: c.magasinQte,
    factureQte: c.factureQte,
    aDesParts: enfants.some((e) => e.lienParent === "decoupe"),

    tissuMagasin: lotsAffectes,
  };
}

/* ─────────── lecture ─────────── */

const versPlan = (
  entete: typeof commandePlan.$inferSelect,
  matieres: (typeof commandePlanMatiere.$inferSelect)[],
): pc.Plan => ({
  sizes: entete.sizes,
  ordre: entete.ordre,
  contraintes: {
    maxPiecesTrace: entete.maxPiecesTrace,
    maxPlis: entete.maxPlis,
    surplusTolere: entete.surplusTolere,
  },
  matieres: matieres.map((m) => ({
    rang: m.rang,
    nom: m.nom,
    lotId: m.lotId,
    laise: m.laise,
    consoPrevue: m.consoPrevue,
    perteBout: m.perteBout,
    traces: m.traces,
  })),
  par: entete.par,
  date: entete.date,
});

export async function getPlan(commandeId: number): Promise<pc.Plan | null> {
  const [entete] = await db.select().from(commandePlan).where(eq(commandePlan.commandeId, commandeId));
  if (!entete) return null;
  const matieres = await db
    .select()
    .from(commandePlanMatiere)
    .where(eq(commandePlanMatiere.commandeId, commandeId))
    .orderBy(asc(commandePlanMatiere.rang), asc(commandePlanMatiere.id));
  return versPlan(entete, matieres);
}

/** Plan de départ quand aucun n'existe : la grille de la commande, ou un seul
 * tas « TU » sur la quantité du GROUPE — on coupe pour tous les OF réunis, pas
 * pour le seul porteur. La consommation prévue vient de la nomenclature. */
export function planInitial(ctx: ContexteCommande): pc.Plan {
  const sizes = ctx.tailles.length ? ctx.tailles.map((t) => t.taille) : [pc.TAILLE_UNIQUE];
  const ordre = ctx.tailles.length
    ? Object.fromEntries(ctx.tailles.map((t) => [t.taille, t.qte]))
    : { [pc.TAILLE_UNIQUE]: ctx.qteGroupe };

  const matiere = pc.matiereVide(sizes, 0);
  matiere.consoPrevue = ctx.consoTheo;

  return {
    sizes,
    ordre,
    contraintes: pc.CONTRAINTES_DEFAUT,
    matieres: [matiere],
    par: "",
    date: null,
  };
}

/** Le plan enregistré, ou celui qu'on proposerait à la modéliste. */
export async function planOuInitial(ctx: ContexteCommande): Promise<{ plan: pc.Plan; existe: boolean }> {
  const enregistre = await getPlan(ctx.id);
  return enregistre ? { plan: enregistre, existe: true } : { plan: planInitial(ctx), existe: false };
}

/** L'étape « tracés » est-elle déjà validée ?
 *
 * Requête ciblée plutôt que `getPreparation()`, qui recalcule les feux de
 * toutes les commandes pour répondre à une question sur une seule ligne. */
export async function etapeTracesFaite(commandeId: number): Promise<boolean> {
  const [e] = await db
    .select({ fait: commandeEtape.fait })
    .from(commandeEtape)
    .where(and(eq(commandeEtape.commandeId, commandeId), eq(commandeEtape.etape, "traces")));
  return e?.fait === true;
}

/* ─────────── résumés pour les listes ─────────── */

/** Ce que la liste Modélisme affiche d'un plan sans en charger les tracés. */
export type ResumePlan = {
  nbMatieres: number;
  nbTraces: number;
  /** Au moins une longueur n'a pas encore été mesurée après placement. */
  estime: boolean;
  /** Pièces couvertes par la matière principale. */
  pieces: number;
  /** Métrage de la matière principale. */
  metres: number;
  par: string;
  date: string | null;
};

/** Résumé de tous les plans, en deux requêtes. Appelé par `listPreparation`. */
export async function resumesPlans(): Promise<Map<number, ResumePlan>> {
  const [entetes, matieres] = await Promise.all([
    db.select().from(commandePlan),
    db.select().from(commandePlanMatiere).orderBy(asc(commandePlanMatiere.rang), asc(commandePlanMatiere.id)),
  ]);
  if (!entetes.length) return new Map();

  const parCommande = new Map<number, (typeof matieres)[number][]>();
  for (const m of matieres) {
    const l = parCommande.get(m.commandeId);
    if (l) l.push(m);
    else parCommande.set(m.commandeId, [m]);
  }

  const out = new Map<number, ResumePlan>();
  for (const e of entetes) {
    const plan = versPlan(e, parCommande.get(e.commandeId) ?? []);
    const principale = pc.matierePrincipale(plan);
    out.set(e.commandeId, {
      nbMatieres: plan.matieres.length,
      nbTraces: plan.matieres.reduce((a, m) => a + m.traces.length, 0),
      estime: plan.matieres.some(pc.estEstime),
      pieces: principale ? pc.piecesTotales(principale, plan.sizes) : 0,
      metres: principale ? pc.consoTotale(principale) : 0,
      par: e.par,
      date: e.date,
    });
  }
  return out;
}

/* ─────────── écriture ─────────── */

/** Nettoie ce qui arrive du client : un éditeur envoie ce qu'il veut, la base
 * ne reçoit que des nombres finis et des tailles nommées. */
function assainir(plan: pc.Plan): pc.Plan {
  const n = (v: unknown, min = 0) => {
    const x = Number(v);
    return Number.isFinite(x) ? Math.max(min, x) : min;
  };
  const nOuNull = (v: unknown) => {
    if (v === null || v === undefined || v === "") return null;
    const x = Number(v);
    return Number.isFinite(x) && x >= 0 ? x : null;
  };

  const sizes = [...new Set(plan.sizes.map((s) => String(s).trim()).filter(Boolean))];
  if (!sizes.length) throw new Error("Le plan doit gérer au moins une taille");
  if (sizes.length > 40) throw new Error("Gamme de tailles trop large (40 maximum)");
  if (plan.matieres.length > 20) throw new Error("20 matières au maximum");

  const grille = (src: Record<string, number> | undefined) =>
    Object.fromEntries(sizes.map((s) => [s, Math.trunc(n(src?.[s]))]));

  return {
    sizes,
    ordre: grille(plan.ordre),
    contraintes: {
      maxPiecesTrace: Math.min(40, Math.max(1, Math.trunc(n(plan.contraintes?.maxPiecesTrace, 1)))),
      maxPlis: Math.min(1000, Math.max(1, Math.trunc(n(plan.contraintes?.maxPlis, 1)))),
      surplusTolere: Math.min(500, Math.trunc(n(plan.contraintes?.surplusTolere))),
    },
    matieres: plan.matieres.slice(0, 20).map((m, i) => {
      if (m.traces.length > 200) throw new Error("200 tracés au maximum par matière");
      return {
        rang: i,
        nom: String(m.nom ?? "").trim().slice(0, 80) || `Matière ${i + 1}`,
        lotId: m.lotId ?? null,
        laise: nOuNull(m.laise),
        consoPrevue: nOuNull(m.consoPrevue),
        perteBout: nOuNull(m.perteBout),
        traces: m.traces.map((t, j) => ({
          nom: String(t.nom ?? "").trim().slice(0, 60) || `Tracé ${j + 1}`,
          longueur: n(t.longueur),
          plis: Math.trunc(n(t.plis)),
          estime: t.estime === true,
          qty: grille(t.qty),
        })),
      };
    }),
    par: plan.par,
    date: plan.date,
  };
}

/** Remplace le plan de la commande. Le document part et revient d'un bloc :
 * les matières sont réécrites, jamais rapprochées ligne à ligne — un tracé
 * n'a pas d'identité propre que l'utilisateur reconnaîtrait. */
export async function enregistrerPlan(commandeId: number, brut: pc.Plan, auteur: Auteur) {
  const plan = assainir(brut);
  const date = biz.todayISO();

  await db.transaction(async (tx) => {
    const [c] = await tx.select().from(commande).where(eq(commande.id, commandeId));
    if (!c) throw new Error("Commande introuvable");

    const [avant] = await tx.select().from(commandePlan).where(eq(commandePlan.commandeId, commandeId));

    const entete = {
      sizes: plan.sizes,
      ordre: plan.ordre,
      maxPiecesTrace: plan.contraintes.maxPiecesTrace,
      maxPlis: plan.contraintes.maxPlis,
      surplusTolere: plan.contraintes.surplusTolere,
      par: auteur.name,
      date,
      updatedAt: new Date(),
    };
    await tx
      .insert(commandePlan)
      .values({ commandeId, ...entete })
      .onConflictDoUpdate({ target: commandePlan.commandeId, set: entete });

    await tx.delete(commandePlanMatiere).where(eq(commandePlanMatiere.commandeId, commandeId));
    if (plan.matieres.length) {
      await tx.insert(commandePlanMatiere).values(
        plan.matieres.map((m) => ({
          commandeId,
          rang: m.rang,
          nom: m.nom,
          lotId: m.lotId ?? null,
          laise: m.laise,
          consoPrevue: m.consoPrevue,
          perteBout: m.perteBout,
          traces: m.traces,
        })),
      );
    }

    const nbTraces = plan.matieres.reduce((a, m) => a + m.traces.length, 0);
    const resume = `${plan.matieres.length} matière(s), ${nbTraces} tracé(s)`;
    await journaliserFiche(tx, commandeId, auteur, "modelisme", "Plan de coupe enregistré", {
      detail: resume,
      avant: avant ? "plan existant" : "aucun plan",
      apres: resume,
    });
  });

  return { ...plan, par: auteur.name, date };
}

/* ─────────── reports vers la commande ─────────── */

/** Écrit une consommation sur la commande, avec sa ligne de journal. */
async function reporterConso(
  tx: Tx,
  commandeId: number,
  champ: "consoTheo" | "consoReel",
  valeur: number,
  auteur: Auteur,
) {
  const [c] = await tx.select().from(commande).where(eq(commande.id, commandeId));
  if (!c) throw new Error("Commande introuvable");
  const avant = c[champ];
  await tx.update(commande).set({ [champ]: valeur, updatedAt: new Date() }).where(eq(commande.id, commandeId));
  const label = champ === "consoTheo" ? "consommation théorique" : "consommation réelle";
  await journaliserFiche(tx, commandeId, auteur, "nomen", `Report du plan de coupe — ${label}`, {
    detail: "reportée depuis le plan de matelassage",
    avant,
    apres: valeur,
  });
}

export async function reporterConsoReelle(commandeId: number, valeur: number, auteur: Auteur) {
  await db.transaction((tx) => reporterConso(tx, commandeId, "consoReel", valeur, auteur));
}

export async function reporterConsoPrevue(commandeId: number, valeur: number, auteur: Auteur) {
  await db.transaction((tx) => reporterConso(tx, commandeId, "consoTheo", valeur, auteur));
}

/** Déduit du magasin la consommation réelle d'une matière liée à un lot.
 *
 * C'est le sens INVERSE de l'import : une fois le matelassage fait, le métrage
 * réellement consommé sort du stock du lot (mouvement de sortie), et
 * l'inventaire reflète le reste. On ne sort jamais plus que le disponible ;
 * on ne double pas une sortie déjà passée pour ce plan (on ajuste au delta). */
export type BilanConso = { ok: true; sortie: number; lot: string } | { ok: false; error: string };

export async function consommerDepuisPlan(
  commandeId: number,
  rangMatiere: number,
  metresConsommes: number,
  auteur: Auteur,
): Promise<BilanConso> {
  return db.transaction(async (t): Promise<BilanConso> => {
    const [m] = await t
      .select()
      .from(commandePlanMatiere)
      .where(and(eq(commandePlanMatiere.commandeId, commandeId), eq(commandePlanMatiere.rang, rangMatiere)));
    if (!m) return { ok: false, error: "Matière introuvable" };
    if (m.lotId == null) return { ok: false, error: "Cette matière n'est pas liée à un lot du magasin tissu." };

    const [lot] = await t.select().from(tissuLot).where(eq(tissuLot.id, m.lotId));
    if (!lot) return { ok: false, error: "Lot introuvable au magasin." };

    const [c] = await t
      .select({ of: commande.ofNumber, modele: commande.modele })
      .from(commande)
      .where(eq(commande.id, commandeId));
    const label = c ? `${c.of} · ${c.modele}` : "";

    // Sorties déjà passées pour CE plan/matière (motif marqueur), pour n'ajouter
    // que le delta et ne pas déduire deux fois si on reporte à nouveau.
    const marqueur = `plan#${commandeId}#${rangMatiere}`;
    const mvts = await t.select().from(tissuMouvement).where(eq(tissuMouvement.lotId, m.lotId));
    const dejaSorti = mvts
      .filter((x) => x.sens === "sortie" && x.motif.includes(marqueur))
      .reduce((s, x) => s + x.quantite, 0);
    const delta = Math.round((metresConsommes - dejaSorti) * 100) / 100;
    if (Math.abs(delta) < 0.001) return { ok: true, sortie: 0, lot: lot.identifiant };

    if (delta > 0) {
      const dispo = tx.bilanLot(lot.quantiteRecue, [], mvts).disponible;
      if (delta > dispo + 0.001) {
        return { ok: false, error: `Consommation ${delta} m > disponible ${dispo} m sur ${lot.identifiant}.` };
      }
      await t.insert(tissuMouvement).values({
        lotId: m.lotId,
        sens: "sortie",
        quantite: delta,
        commandeId,
        commandeLabel: label,
        motif: `Consommation coupe (${marqueur})`,
        createdBy: auteur.name,
      });
    } else {
      // Correction à la baisse : on remet la différence par un retour.
      await t.insert(tissuMouvement).values({
        lotId: m.lotId,
        sens: "retour",
        quantite: -delta,
        commandeId,
        commandeLabel: label,
        motif: `Ajustement consommation coupe (${marqueur})`,
        createdBy: auteur.name,
      });
    }
    return { ok: true, sortie: delta, lot: lot.identifiant };
  });
}

/** Ce qui interdit de réécrire la grille de tailles d'une commande.
 *
 * PilotPro écrase `tailles` ET `qte` sans rien vérifier. Ici, `qte` est lu par
 * la facturation, les bons de livraison, le magasin, la coupe et le calcul de
 * marge : la corriger sous une commande déjà entamée déplace un chiffre
 * d'affaires. Le plan corrige donc une commande qui n'a pas encore bougé —
 * typiquement celle saisie en taille unique que la modéliste ventile — et
 * s'arrête devant les autres. */
export function motifRefusCorrectionTailles(ctx: ContexteCommande): string | null {
  if (ctx.parentId != null) {
    return `Cette commande est rattachée à ${ctx.porteurOf || "un porteur"} — sa grille se corrige sur le porteur.`;
  }
  if (ctx.aDesParts) {
    return "Cette commande a été découpée en parts : sa quantité est celle qu'elles se partagent, elle ne peut pas être réécrite depuis le plan.";
  }
  const engagee: string[] = [];
  if (ctx.coupeQte > 0) engagee.push(`${ctx.coupeQte} pièce(s) coupée(s)`);
  if (ctx.produit > 0) engagee.push(`${ctx.produit} produite(s)`);
  if (ctx.magasinQte > 0) engagee.push(`${ctx.magasinQte} en magasin`);
  if (ctx.factureQte > 0) engagee.push(`${ctx.factureQte} facturée(s)`);
  if (engagee.length) {
    return `Commande déjà engagée en aval (${engagee.join(", ")}) — corrigez la grille depuis la fiche commande.`;
  }
  return null;
}

/** Réécrit la grille de tailles de la commande depuis celle du plan.
 * La quantité totale suit : c'est la grille qui fait foi dès qu'elle existe. */
export async function reporterTailles(commandeId: number, grille: pc.LigneTaille[], auteur: Auteur) {
  const total = grille.reduce((a, t) => a + t.qte, 0);
  await db.transaction(async (tx) => {
    const [c] = await tx.select().from(commande).where(eq(commande.id, commandeId));
    if (!c) throw new Error("Commande introuvable");
    const lisible = (l: pc.LigneTaille[]) => l.map((t) => `${t.taille}:${t.qte}`).join(" · ");
    const avant = c.tailles.length ? lisible(c.tailles.map((t) => ({ taille: String(t.taille), qte: t.qte }))) : `TU (${c.qte})`;
    await tx
      .update(commande)
      .set({ tailles: grille, qte: total, updatedAt: new Date() })
      .where(eq(commande.id, commandeId));
    await journaliserFiche(tx, commandeId, auteur, "modelisme", "Grille de tailles corrigée depuis le plan de coupe", {
      detail: `quantité totale ${c.qte} → ${total}`,
      avant,
      apres: lisible(grille),
    });
  });
}
