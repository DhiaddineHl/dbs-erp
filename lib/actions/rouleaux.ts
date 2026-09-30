"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq, inArray, isNull, like, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  commande,
  faconnier,
  tissuEmplacement,
  tissuInventaire,
  tissuInventaireScan,
  tissuLot,
  tissuMouvement,
  tissuReception,
  tissuRouleau,
} from "@/lib/db/schema";
import { assertUser } from "@/lib/auth/server";
import { auteurTissu } from "@/lib/auth/tissu";
import * as rl from "@/lib/domain/rouleau";
import * as tx from "@/lib/domain/tissu";
import { getInventaire, prochainCodeRouleau, recalculerStatut, type Executeur } from "@/lib/services/rouleaux";

/* Rouleaux physiques — écritures.
 *
 * Mêmes règles que le magasin tissu (lib/actions/tissu.ts), au grain du
 * rouleau :
 *   - aucune quantité ne bouge sans un mouvement dans tissu_mouvement (le
 *     mouvement porte le lot ET le rouleau : le bilan du lot reste juste) ;
 *   - l'ID, le métrage initial et la date de réception ne se modifient jamais
 *     (verrou en base) ; on corrige par une CORRECTION motivée, on défait par
 *     une ANNULATION (lib/actions/tissu.ts → annulerMouvement) ;
 *   - chaque écriture verrouille la ligne du rouleau (FOR UPDATE) : deux
 *     téléphones qui scannent le même rouleau ne peuvent pas sortir deux fois
 *     le même métrage. */

export type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : "Erreur" });
const revalider = (code?: string) => {
  for (const p of ["/magtissu", "/m/tissu", "/commandes", "/preparation"]) revalidatePath(p);
  if (code) {
    revalidatePath(`/magtissu/rouleaux/${code}`);
    revalidatePath(`/m/tissu/r/${code}`);
  }
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const nombre = (s: string | number | undefined | null): number => {
  const n = Number(String(s ?? "").replace(",", ".").trim());
  return Number.isFinite(n) ? n : NaN;
};
const positif = (s: string | number | undefined | null) => {
  const n = nombre(s);
  return Number.isFinite(n) && n > 0 ? r2(n) : 0;
};

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Charge et VERROUILLE un rouleau par son code (ou le texte scanné). */
async function verrouiller(t: Tx, codeOuScan: string) {
  const lu = rl.lireScan(codeOuScan);
  if (!lu || lu.type !== "rouleau") throw new Error("Ce n'est pas un code rouleau (R-AAAA-NNNNNN).");
  const [r] = await t.select().from(tissuRouleau).where(eq(tissuRouleau.code, lu.code)).for("update");
  if (!r) throw new Error(`Rouleau ${lu.code} inconnu : il n'a pas été enregistré à la réception.`);
  const ms = await t
    .select({ id: tissuMouvement.id, sens: tissuMouvement.sens, quantite: tissuMouvement.quantite, annuleId: tissuMouvement.annuleId, commandeId: tissuMouvement.commandeId, commandeLabel: tissuMouvement.commandeLabel })
    .from(tissuMouvement)
    .where(eq(tissuMouvement.rouleauId, r.id))
    .orderBy(asc(tissuMouvement.id));
  return { r, ms, bilan: rl.bilanRouleau(r.metrageInitial, ms), valide: r.valideLe != null };
}

async function libelleCommande(ex: Executeur, commandeId: number | null | undefined): Promise<string> {
  if (!commandeId) return "";
  const [c] = await ex.select({ of: commande.ofNumber, modele: commande.modele }).from(commande).where(eq(commande.id, commandeId));
  if (!c) throw new Error("Commande introuvable.");
  return `${c.of} · ${c.modele}`;
}

async function emplacementParCode(ex: Executeur, code: string) {
  const c = rl.normaliserEmplacement(rl.lireScan(code)?.type === "emplacement" ? rl.lireScan(code)!.code : code);
  if (!c) return null;
  const [e] = await ex.select().from(tissuEmplacement).where(eq(tissuEmplacement.code, c));
  if (!e) throw new Error(`Emplacement ${c} inconnu : créez-le d'abord (Magasin tissu → Emplacements).`);
  if (!e.actif) throw new Error(`Emplacement ${c} désactivé.`);
  return e;
}

/* ─────────── scan : que désigne ce code ? ─────────── */

/** Résout un scan (QR, douchette ou saisie) vers la fiche à ouvrir. */
export async function resoudreScan(brut: string): Promise<Result<{ type: "rouleau" | "emplacement"; code: string; url: string }>> {
  try {
    // Lecture seule : tout compte connecté peut ouvrir une fiche (les gestes,
    // eux, restent réservés au magasin tissu).
    await assertUser();
    const lu = rl.lireScan(brut);
    if (!lu) return { ok: false, error: "Code illisible : ni un rouleau (R-AAAA-NNNNNN) ni un emplacement." };
    if (lu.type === "rouleau") {
      const [r] = await db.select({ id: tissuRouleau.id }).from(tissuRouleau).where(eq(tissuRouleau.code, lu.code));
      if (!r) return { ok: false, error: `Rouleau ${lu.code} inconnu : il n'a pas été enregistré à la réception.` };
      return { ok: true, type: "rouleau", code: lu.code, url: `/m/tissu/r/${lu.code}` };
    }
    const [e] = await db.select({ id: tissuEmplacement.id }).from(tissuEmplacement).where(eq(tissuEmplacement.code, lu.code));
    if (!e) return { ok: false, error: `Emplacement ${lu.code} inconnu.` };
    return { ok: true, type: "emplacement", code: lu.code, url: `/m/tissu/e/${lu.code}` };
  } catch (e) {
    return fail(e);
  }
}

/* ─────────── réception : EN ATTENTE → EN STOCK ─────────── */

/** Valide la réception physique d'un rouleau (scan au magasin). Refuse une
 * double réception. Range éventuellement le rouleau à un emplacement. */
export async function validerRouleau(input: { code: string; emplacement?: string }): Promise<Result<{ code: string }>> {
  try {
    const a = await auteurTissu();
    const code = await db.transaction(async (t) => {
      const { r } = await verrouiller(t, input.code);
      if (r.valideLe) {
        throw new Error(`Rouleau ${r.code} déjà réceptionné le ${r.valideLe.toLocaleDateString("fr-FR")} par ${r.validePar || "—"}.`);
      }
      const emp = input.emplacement ? await emplacementParCode(t, input.emplacement) : null;
      await t
        .update(tissuRouleau)
        .set({ valideLe: new Date(), validePar: a.name, ...(emp ? { emplacementId: emp.id } : {}) })
        .where(eq(tissuRouleau.id, r.id));
      await t.insert(tissuMouvement).values({
        lotId: r.lotId, rouleauId: r.id, sens: "mise_en_stock", quantite: r.metrageInitial,
        motif: "Réception validée au magasin (scan)", valeurApres: emp?.code ?? "", createdBy: a.name,
      });
      await recalculerStatut(t, r.id);
      return r.code;
    });
    revalider(code);
    return { ok: true, code };
  } catch (e) {
    return fail(e);
  }
}

/** Valide d'un coup tous les rouleaux encore en attente d'une réception. */
export async function validerReceptionRouleaux(input: { receptionId: number; emplacement?: string }): Promise<Result<{ n: number }>> {
  try {
    const a = await auteurTissu();
    const n = await db.transaction(async (t) => {
      const emp = input.emplacement ? await emplacementParCode(t, input.emplacement) : null;
      const rows = await t
        .select({ r: tissuRouleau })
        .from(tissuRouleau)
        .innerJoin(tissuLot, eq(tissuRouleau.lotId, tissuLot.id))
        .where(and(eq(tissuLot.receptionId, input.receptionId), isNull(tissuRouleau.valideLe)))
        .for("update", { of: tissuRouleau });
      for (const { r } of rows) {
        await t
          .update(tissuRouleau)
          .set({ valideLe: new Date(), validePar: a.name, ...(emp ? { emplacementId: emp.id } : {}) })
          .where(eq(tissuRouleau.id, r.id));
        await t.insert(tissuMouvement).values({
          lotId: r.lotId, rouleauId: r.id, sens: "mise_en_stock", quantite: r.metrageInitial,
          motif: "Réception validée au magasin (bon complet)", valeurApres: emp?.code ?? "", createdBy: a.name,
        });
        await recalculerStatut(t, r.id);
      }
      return rows.length;
    });
    if (!n) return { ok: false, error: "Aucun rouleau en attente sur ce bon." };
    revalider();
    return { ok: true, n };
  } catch (e) {
    return fail(e);
  }
}

/* ─────────── sortie / retour / consommation ─────────── */

/* ─────────── sortie : où va le tissu (interne ou sous-traitant) ─────────── */

type LieuSortie = {
  destination: string;
  commandeId: number | null;
  /** Obligatoire quand la destination est « soustraitant ». */
  faconnierId?: number | null;
  motif?: string;
};

/** Contrôle le lieu de sortie et renvoie le sous-traitant retenu (nom recopié). */
async function verifierLieu(ex: Executeur, l: LieuSortie): Promise<{ faconnierId: number | null; faconnierNom: string }> {
  if (!rl.DESTINATIONS.some((d) => d.value === l.destination)) throw new Error("Choisissez où part le tissu (coupe interne, sous-traitant…).");
  if (!l.commandeId && l.destination !== "autre") throw new Error("Choisissez le modèle / la commande (OF) : c'est elle qui portera ce tissu.");
  if (l.destination === "autre" && !l.commandeId && !(l.motif ?? "").trim()) throw new Error("Sortie sans commande : précisez le motif.");
  if (l.destination !== "soustraitant") return { faconnierId: null, faconnierNom: "" };
  if (!l.faconnierId) throw new Error("Choisissez le sous-traitant chez qui part le tissu.");
  const [f] = await ex.select({ id: faconnier.id, nom: faconnier.nom }).from(faconnier).where(eq(faconnier.id, l.faconnierId));
  if (!f) throw new Error("Sous-traitant introuvable.");
  if (!rl.estSousTraitant(f.nom)) throw new Error(`« ${f.nom} » est l'atelier interne : choisissez « Coupe interne ».`);
  return { faconnierId: f.id, faconnierNom: f.nom };
}

/** Écrit la sortie d'UN rouleau (verrouillé). q = null → tout le disponible. */
async function ecrireSortie(
  t: Tx,
  par: string,
  code: string,
  q: number | null,
  l: LieuSortie & { faconnierId: number | null; faconnierNom: string; label: string; bon?: string },
) {
  const { r, bilan, valide } = await verrouiller(t, code);
  const quantite = q ?? bilan.disponible;
  const refus = rl.refusSortie(valide, bilan, quantite);
  if (refus) throw new Error(`${r.code} : ${refus}`);
  const [lot] = await t.select({ controle: tissuLot.controle }).from(tissuLot).where(eq(tissuLot.id, r.lotId));
  if (lot?.controle === "refuse") throw new Error(`${r.code} : lot refusé au contrôle, levez le refus avant de le couper.`);
  await t.insert(tissuMouvement).values({
    lotId: r.lotId, rouleauId: r.id, sens: "sortie", quantite, destination: l.destination,
    faconnierId: l.faconnierId, faconnierNom: l.faconnierNom, bon: l.bon ?? "",
    commandeId: l.commandeId, commandeLabel: l.label,
    motif: (l.motif ?? "").trim() || `Sortie ${rl.lieuSortie(l)}`,
    valeurAvant: String(bilan.disponible), valeurApres: String(r2(bilan.disponible - quantite)), createdBy: par,
  });
  const s = await recalculerStatut(t, r.id);
  return { code: r.code, quantite, reste: s?.bilan.disponible ?? 0 };
}

/** Sortie du magasin : diminue le stock du rouleau (et donc du lot). Le tissu
 * part pour un modèle (commande), en coupe interne ou chez un sous-traitant. */
export async function sortirRouleau(input: {
  code: string;
  quantite: string;
  destination: string;
  commandeId: number | null;
  faconnierId?: number | null;
  motif?: string;
}): Promise<Result<{ code: string; reste: number }>> {
  try {
    const a = await auteurTissu();
    const q = positif(input.quantite);
    const res = await db.transaction(async (t) => {
      const st = await verifierLieu(t, input);
      const label = await libelleCommande(t, input.commandeId);
      return ecrireSortie(t, a.name, input.code, q, { ...input, ...st, label });
    });
    revalider(res.code);
    return { ok: true, code: res.code, reste: res.reste };
  } catch (e) {
    return fail(e);
  }
}

async function prochainNumeroBon(ex: Executeur): Promise<string> {
  // Deux sorties groupées en même temps ne prennent pas le même numéro.
  await ex.execute(sql`select pg_advisory_xact_lock(hashtext('tissu_bon_sortie'))`);
  const prefixe = `BST-${new Date().getFullYear()}-`;
  const rows = await ex.select({ bon: tissuMouvement.bon }).from(tissuMouvement).where(like(tissuMouvement.bon, `${prefixe}%`));
  let max = 0;
  for (const r of rows) {
    const n = parseInt(r.bon.slice(prefixe.length), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefixe}${String(max + 1).padStart(3, "0")}`;
}

/** Sortie GROUPÉE : plusieurs rouleaux pour un même modèle et un même lieu
 * (en général un sous-traitant), sur un bon numéroté BST-AAAA-NNN. Tout ou
 * rien : si un rouleau est refusé, aucun ne sort. Quantité vide = rouleau entier. */
export async function sortieGroupee(input: {
  rouleaux: { code: string; quantite?: string }[];
  destination: string;
  commandeId: number | null;
  faconnierId?: number | null;
  motif?: string;
}): Promise<Result<{ numero: string; n: number; metrage: number }>> {
  try {
    const a = await auteurTissu();
    if (!input.rouleaux?.length) return { ok: false, error: "Scannez au moins un rouleau." };
    const codes = input.rouleaux.map((x) => rl.lireScan(x.code)?.code ?? x.code);
    if (new Set(codes).size !== codes.length) return { ok: false, error: "Un rouleau est scanné deux fois." };
    const res = await db.transaction(async (t) => {
      const st = await verifierLieu(t, input);
      const label = await libelleCommande(t, input.commandeId);
      const numero = await prochainNumeroBon(t);
      let metrage = 0;
      for (const x of input.rouleaux) {
        const q = x.quantite ? positif(x.quantite) : null;
        const s = await ecrireSortie(t, a.name, x.code, q, { ...input, ...st, label, bon: numero, motif: input.motif || numero });
        metrage += s.quantite;
      }
      return { numero, n: input.rouleaux.length, metrage: r2(metrage) };
    });
    revalider();
    return { ok: true, ...res };
  } catch (e) {
    return fail(e);
  }
}

/** UN bon pour des rouleaux DÉJÀ sortis (cochés dans l'onglet Rouleaux),
 * sortis un par un au scan. Rien ne bouge en stock : on inscrit seulement le
 * n° de bon sur leurs mouvements de sortie qui n'en ont pas encore (le verrou
 * en base n'autorise que ce passage « sans bon → BST-… », jamais un
 * changement de bon). Un bon = un seul destinataire. Si tous les rouleaux
 * sont déjà sur un même bon, on le rend pour réimpression. */
export async function bonPourRouleaux(codes: string[]): Promise<Result<{ numero: string; n: number; nouveau: boolean }>> {
  try {
    await auteurTissu();
    const liste = [...new Set((codes ?? []).map((c) => rl.lireScan(c)?.code ?? c.trim()).filter(Boolean))];
    if (!liste.length) return { ok: false, error: "Cochez au moins un rouleau sorti." };
    const res = await db.transaction(async (t) => {
      const rs = await t.select({ id: tissuRouleau.id, code: tissuRouleau.code }).from(tissuRouleau).where(inArray(tissuRouleau.code, liste)).for("update");
      if (rs.length !== liste.length) throw new Error("Un rouleau coché est introuvable.");
      const ms = await t
        .select({
          id: tissuMouvement.id, rouleauId: tissuMouvement.rouleauId, sens: tissuMouvement.sens, quantite: tissuMouvement.quantite,
          annuleId: tissuMouvement.annuleId, destination: tissuMouvement.destination, faconnierNom: tissuMouvement.faconnierNom, bon: tissuMouvement.bon,
        })
        .from(tissuMouvement)
        .where(inArray(tissuMouvement.rouleauId, rs.map((r) => r.id)))
        .orderBy(asc(tissuMouvement.id));
      const aPorter: number[] = [];
      const lieux = new Set<string>();
      const bonsExistants = new Set<string>();
      for (const r of rs) {
        const s = rl.sortiesPourBon(ms.filter((m) => m.rouleauId === r.id));
        if (!s) throw new Error(`${r.code} n'est jamais sorti du magasin : faites d'abord sa sortie (scan ou sortie groupée).`);
        lieux.add(s.lieu);
        if (s.aPorter.length) aPorter.push(...s.aPorter.map((m) => m.id));
        else bonsExistants.add(s.dejaSur);
      }
      if (lieux.size > 1) throw new Error(`Un bon = un seul destinataire. Les rouleaux cochés sont partis à des endroits différents : ${[...lieux].join(", ")}.`);
      if (!aPorter.length) {
        // Tous déjà sur un bon : réimpression, si c'est le même.
        if (bonsExistants.size === 1) return { numero: [...bonsExistants][0], n: rs.length, nouveau: false };
        throw new Error(`Ces rouleaux figurent déjà sur des bons différents : ${[...bonsExistants].join(", ")}.`);
      }
      if (bonsExistants.size) throw new Error(`Certains rouleaux sont déjà sur le bon ${[...bonsExistants].join(", ")} : décochez-les (ou réimprimez ce bon).`);
      const numero = await prochainNumeroBon(t);
      await t.update(tissuMouvement).set({ bon: numero }).where(inArray(tissuMouvement.id, aPorter));
      return { numero, n: rs.length, nouveau: true };
    });
    revalider();
    return { ok: true, numero: res.numero, n: res.n, nouveau: res.nouveau };
  } catch (e) {
    return fail(e);
  }
}

/** Contrôle d'un rouleau AVANT de l'ajouter à une sortie groupée (scan). */
export async function verifierPourSortie(scan: string): Promise<Result<{ code: string; disponible: number; lot: string; tissu: string; unite: string }>> {
  try {
    await auteurTissu();
    const lu = rl.lireScan(scan);
    if (!lu || lu.type !== "rouleau") return { ok: false, error: "Ce n'est pas un code rouleau (R-AAAA-NNNNNN)." };
    const [r] = await db
      .select({ r: tissuRouleau, lot: tissuLot })
      .from(tissuRouleau)
      .innerJoin(tissuLot, eq(tissuRouleau.lotId, tissuLot.id))
      .where(eq(tissuRouleau.code, lu.code));
    if (!r) return { ok: false, error: `Rouleau ${lu.code} inconnu : il n'a pas été enregistré à la réception.` };
    const ms = await db
      .select({ id: tissuMouvement.id, sens: tissuMouvement.sens, quantite: tissuMouvement.quantite, annuleId: tissuMouvement.annuleId })
      .from(tissuMouvement)
      .where(eq(tissuMouvement.rouleauId, r.r.id));
    const b = rl.bilanRouleau(r.r.metrageInitial, ms);
    const refus = rl.refusSortie(r.r.valideLe != null, b, b.disponible || 1);
    if (refus || b.disponible <= 0.001) return { ok: false, error: `${lu.code} : ${refus ?? "rouleau vide (plus rien en stock)."}` };
    if (r.lot.controle === "refuse") return { ok: false, error: `${lu.code} : lot refusé au contrôle.` };
    return {
      ok: true,
      code: lu.code,
      disponible: b.disponible,
      lot: r.lot.identifiant,
      tissu: [r.lot.reference, r.lot.couleur].filter(Boolean).join(" · "),
      unite: r.lot.unite,
    };
  } catch (e) {
    return fail(e);
  }
}

/** Retour en stock de tissu sorti et non utilisé. Peut ranger le rouleau. */
export async function retournerRouleau(input: { code: string; quantite: string; emplacement?: string; motif?: string }): Promise<Result<{ code: string; disponible: number }>> {
  try {
    const a = await auteurTissu();
    const q = positif(input.quantite);
    const res = await db.transaction(async (t) => {
      const { r, ms, bilan } = await verrouiller(t, input.code);
      const refus = rl.refusRetour(bilan, q);
      if (refus) throw new Error(refus);
      const derniere = [...rl.mouvementsEffectifs(ms)].reverse().find((m) => m.sens === "sortie");
      const emp = input.emplacement ? await emplacementParCode(t, input.emplacement) : null;
      await t.insert(tissuMouvement).values({
        lotId: r.lotId, rouleauId: r.id, sens: "retour", quantite: q,
        commandeId: derniere?.commandeId ?? null, commandeLabel: derniere?.commandeLabel ?? "",
        motif: (input.motif ?? "").trim() || "Retour en stock (non utilisé)",
        valeurAvant: String(bilan.disponible), valeurApres: String(r2(bilan.disponible + q)), createdBy: a.name,
      });
      if (emp && emp.id !== r.emplacementId) {
        const [avant] = r.emplacementId ? await t.select({ code: tissuEmplacement.code }).from(tissuEmplacement).where(eq(tissuEmplacement.id, r.emplacementId)) : [];
        await t.update(tissuRouleau).set({ emplacementId: emp.id }).where(eq(tissuRouleau.id, r.id));
        await t.insert(tissuMouvement).values({
          lotId: r.lotId, rouleauId: r.id, sens: "deplacement", quantite: 0, motif: "Rangé au retour",
          valeurAvant: avant?.code ?? "", valeurApres: emp.code, createdBy: a.name,
        });
      }
      const s = await recalculerStatut(t, r.id);
      return { code: r.code, disponible: s?.bilan.disponible ?? 0 };
    });
    revalider(res.code);
    return { ok: true, ...res };
  } catch (e) {
    return fail(e);
  }
}

/** Déclaration de la coupe : ce qui a été consommé et ce qui est parti en
 * chute, sur le tissu SORTI. Ne touche pas au stock (déjà décompté). */
export async function consommerRouleau(input: { code: string; consomme: string; chute: string; commandeId?: number | null; motif?: string }): Promise<Result<{ code: string; enCoupe: number }>> {
  try {
    const a = await auteurTissu();
    const conso = input.consomme ? nombre(input.consomme) : 0;
    const chute = input.chute ? nombre(input.chute) : 0;
    if (!Number.isFinite(conso) || !Number.isFinite(chute)) return { ok: false, error: "Métrage illisible." };
    const res = await db.transaction(async (t) => {
      const { r, ms, bilan } = await verrouiller(t, input.code);
      const refus = rl.refusConsommation(bilan, conso, chute);
      if (refus) throw new Error(refus);
      const derniere = [...rl.mouvementsEffectifs(ms)].reverse().find((m) => m.sens === "sortie");
      const commandeId = input.commandeId ?? derniere?.commandeId ?? null;
      const label = input.commandeId ? await libelleCommande(t, input.commandeId) : (derniere?.commandeLabel ?? "");
      const base = { lotId: r.lotId, rouleauId: r.id, commandeId, commandeLabel: label, createdBy: a.name };
      if (conso > 0) await t.insert(tissuMouvement).values({ ...base, sens: "consommation", quantite: r2(conso), motif: (input.motif ?? "").trim() || "Consommation déclarée par la coupe" });
      if (chute > 0) await t.insert(tissuMouvement).values({ ...base, sens: "chute", quantite: r2(chute), motif: (input.motif ?? "").trim() || "Chute déclarée par la coupe" });
      const s = await recalculerStatut(t, r.id);
      return { code: r.code, enCoupe: s?.bilan.enCoupe ?? 0 };
    });
    revalider(res.code);
    return { ok: true, ...res };
  } catch (e) {
    return fail(e);
  }
}

/* ─────────── emplacement ─────────── */

export async function deplacerRouleau(input: { code: string; emplacement: string; motif?: string }): Promise<Result<{ code: string; emplacement: string }>> {
  try {
    const a = await auteurTissu();
    const res = await db.transaction(async (t) => {
      const { r } = await verrouiller(t, input.code);
      const emp = await emplacementParCode(t, input.emplacement);
      if (!emp) throw new Error("Indiquez l'emplacement.");
      if (emp.id === r.emplacementId) throw new Error(`Le rouleau est déjà en ${emp.code}.`);
      const [avant] = r.emplacementId ? await t.select({ code: tissuEmplacement.code }).from(tissuEmplacement).where(eq(tissuEmplacement.id, r.emplacementId)) : [];
      await t.update(tissuRouleau).set({ emplacementId: emp.id }).where(eq(tissuRouleau.id, r.id));
      await t.insert(tissuMouvement).values({
        lotId: r.lotId, rouleauId: r.id, sens: "deplacement", quantite: 0, motif: (input.motif ?? "").trim() || "Déplacement",
        valeurAvant: avant?.code ?? "", valeurApres: emp.code, createdBy: a.name,
      });
      return { code: r.code, emplacement: emp.code };
    });
    revalider(res.code);
    return { ok: true, ...res };
  } catch (e) {
    return fail(e);
  }
}

/* ─────────── correction contrôlée ─────────── */

/** Corrige le disponible d'un rouleau (métrage constaté) : mouvement
 * « correction » signé, avec ancienne / nouvelle valeur et motif obligatoire.
 * Le métrage initial, lui, ne change jamais. */
export async function corrigerRouleau(input: { code: string; nouveauDisponible: string; motif: string }): Promise<Result<{ code: string }>> {
  try {
    const a = await auteurTissu();
    const nv = nombre(input.nouveauDisponible);
    const res = await db.transaction(async (t) => {
      const { r, bilan, valide } = await verrouiller(t, input.code);
      if (!valide) throw new Error("Rouleau pas encore réceptionné : validez d'abord sa réception.");
      const refus = rl.refusCorrection(nv, bilan, input.motif ?? "");
      if (refus) throw new Error(refus);
      await t.insert(tissuMouvement).values({
        lotId: r.lotId, rouleauId: r.id, sens: "ajustement", quantite: r2(nv - bilan.disponible), motif: input.motif.trim(),
        valeurAvant: String(bilan.disponible), valeurApres: String(r2(nv)), createdBy: a.name,
      });
      await recalculerStatut(t, r.id);
      return r.code;
    });
    revalider(res);
    return { ok: true, code: res };
  } catch (e) {
    return fail(e);
  }
}

/* ─────────── retour fournisseur (flux à part du rendu client) ─────────── */

async function prochainNumeroRetourFournisseur(ex: Executeur): Promise<string> {
  const prefixe = `RTF-${new Date().getFullYear()}-`;
  const rows = await ex
    .select({ motif: tissuMouvement.motif })
    .from(tissuMouvement)
    .where(and(eq(tissuMouvement.sens, "retour_fournisseur"), like(tissuMouvement.motif, `${prefixe}%`)));
  let max = 0;
  for (const r of rows) {
    const n = parseInt(r.motif.slice(prefixe.length), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefixe}${String(max + 1).padStart(3, "0")}`;
}

/** Retourne des rouleaux au fournisseur (défaut, erreur de livraison…) :
 * sortie de stock NON consommée, bon numéroté RTF-AAAA-NNN, motif obligatoire.
 * Quantité vide = tout le disponible du rouleau. */
export async function retourFournisseur(input: { rouleaux: { code: string; quantite?: string }[]; motif: string }): Promise<Result<{ numero: string }>> {
  try {
    const a = await auteurTissu();
    if (!input.motif?.trim()) return { ok: false, error: "Le motif du retour fournisseur est obligatoire." };
    if (!input.rouleaux?.length) return { ok: false, error: "Choisissez au moins un rouleau." };
    const numero = await db.transaction(async (t) => {
      const numero = await prochainNumeroRetourFournisseur(t);
      let fournisseur: string | null = null;
      const vus = new Set<number>();
      for (const x of input.rouleaux) {
        const { r, bilan, valide } = await verrouiller(t, x.code);
        if (vus.has(r.id)) throw new Error(`${r.code} est en double dans le bon.`);
        vus.add(r.id);
        const q = x.quantite ? positif(x.quantite) : bilan.disponible;
        const refus = rl.refusSortieDefinitive(valide, bilan, q);
        if (refus) throw new Error(`${r.code} : ${refus}`);
        const [rec] = await t
          .select({ fournisseur: tissuReception.fournisseur })
          .from(tissuLot)
          .innerJoin(tissuReception, eq(tissuLot.receptionId, tissuReception.id))
          .where(eq(tissuLot.id, r.lotId));
        const f = (rec?.fournisseur ?? "").trim();
        if (fournisseur != null && f.toLowerCase() !== fournisseur.toLowerCase()) throw new Error("Un bon de retour ne concerne qu'un seul fournisseur.");
        fournisseur = f;
        await t.insert(tissuMouvement).values({
          lotId: r.lotId, rouleauId: r.id, sens: "retour_fournisseur", quantite: q, motif: numero,
          valeurAvant: String(bilan.disponible), valeurApres: input.motif.trim(), createdBy: a.name,
        });
        await recalculerStatut(t, r.id);
      }
      return numero;
    });
    revalider();
    return { ok: true, numero };
  } catch (e) {
    return fail(e);
  }
}

/* ─────────── stock existant : découper un lot en rouleaux ─────────── */

/** Donne des rouleaux étiquetés à un lot déjà en stock (sans rouleaux). Les
 * rouleaux sont réputés au magasin (validés tout de suite). Si leur somme ne
 * fait pas le disponible du lot, l'écart est passé en correction du LOT, avec
 * motif obligatoire — rien n'est ajusté en silence. */
export async function decouperEnRouleaux(input: {
  lotId: number;
  rouleaux: { metrage?: string; laize?: string; poids?: string; observations?: string }[];
  motif?: string;
  emplacement?: string;
}): Promise<Result<{ rouleauIds: number[]; ecart: number }>> {
  try {
    const a = await auteurTissu();
    const saisis = (input.rouleaux ?? [])
      .map((r) => ({ metrage: positif(r.metrage), laize: positif(r.laize) || null, poids: positif(r.poids) || null, observations: (r.observations ?? "").trim().slice(0, 300) }))
      .filter((r) => r.metrage > 0);
    if (!saisis.length) return { ok: false, error: "Saisissez au moins un rouleau avec son métrage." };
    const res = await db.transaction(async (t) => {
      const [lot] = await t.select().from(tissuLot).where(eq(tissuLot.id, input.lotId)).for("update");
      if (!lot) throw new Error("Lot introuvable.");
      const [deja] = await t.select({ id: tissuRouleau.id }).from(tissuRouleau).where(eq(tissuRouleau.lotId, lot.id)).limit(1);
      if (deja) throw new Error("Ce lot a déjà ses rouleaux.");
      const mvts = await t.select().from(tissuMouvement).where(eq(tissuMouvement.lotId, lot.id));
      const dispo = tx.bilanLot(lot.quantiteRecue, [], mvts).disponible;
      const somme = r2(saisis.reduce((s, r) => s + r.metrage, 0));
      const ecart = r2(somme - dispo);
      if (Math.abs(ecart) > 0.001 && !(input.motif ?? "").trim()) {
        throw new Error(`Les rouleaux font ${somme} ${lot.unite}, le lot en a ${dispo} en stock (écart ${ecart > 0 ? "+" : ""}${ecart}) : indiquez le motif de la correction.`);
      }
      const emp = input.emplacement ? await emplacementParCode(t, input.emplacement) : null;
      if (Math.abs(ecart) > 0.001) {
        await t.insert(tissuMouvement).values({
          lotId: lot.id, sens: "ajustement", quantite: ecart, motif: `Découpage en rouleaux — ${input.motif!.trim()}`,
          valeurAvant: String(dispo), valeurApres: String(somme), createdBy: a.name,
        });
      }
      const ids: number[] = [];
      for (const s of saisis) {
        const code = await prochainCodeRouleau(t);
        const [row] = await t
          .insert(tissuRouleau)
          .values({
            code, lotId: lot.id, metrageInitial: s.metrage, laize: s.laize, poids: s.poids, observations: s.observations,
            statut: "en_stock", emplacementId: emp?.id ?? null, valideLe: new Date(), validePar: a.name, createdBy: a.name,
          })
          .returning({ id: tissuRouleau.id });
        // Pas de nouvelle « entrée » : le tissu était déjà en stock dans le lot.
        await t.insert(tissuMouvement).values({
          lotId: lot.id, rouleauId: row.id, sens: "mise_en_stock", quantite: s.metrage,
          motif: `Étiquetage du stock existant (lot ${lot.identifiant})`, valeurApres: emp?.code ?? "", createdBy: a.name,
        });
        ids.push(row.id);
      }
      await t.update(tissuLot).set({ nbRouleaux: saisis.length }).where(eq(tissuLot.id, lot.id));
      return { rouleauIds: ids, ecart };
    });
    revalider();
    return { ok: true, ...res };
  } catch (e) {
    return fail(e);
  }
}

/* ─────────── emplacements ─────────── */

export async function creerEmplacement(input: { code: string; zone?: string; rayon?: string; libelle?: string }): Promise<Result> {
  try {
    await auteurTissu();
    const code = rl.normaliserEmplacement(input.code);
    if (!/^[A-Z0-9][A-Z0-9\-_.]*$/.test(code)) return { ok: false, error: "Code d'emplacement invalide (lettres, chiffres, tiret : ex. A03-12)." };
    const [ex] = await db.select({ id: tissuEmplacement.id }).from(tissuEmplacement).where(eq(tissuEmplacement.code, code));
    if (ex) return { ok: false, error: `L'emplacement ${code} existe déjà.` };
    await db.insert(tissuEmplacement).values({
      code, zone: (input.zone ?? "").trim().toUpperCase(), rayon: (input.rayon ?? "").trim(), libelle: (input.libelle ?? "").trim(),
    });
    revalider();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Zone, rayon, libellé, actif. Le CODE ne change pas (il est imprimé). */
export async function majEmplacement(id: number, champ: "zone" | "rayon" | "libelle" | "actif", valeur: string): Promise<Result> {
  try {
    await auteurTissu();
    const patch = champ === "actif" ? { actif: valeur === "true" } : { [champ]: champ === "zone" ? valeur.trim().toUpperCase() : valeur.trim() };
    await db.update(tissuEmplacement).set(patch).where(eq(tissuEmplacement.id, id));
    revalider();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/* ─────────── inventaire par scan ─────────── */

async function prochainNumeroInventaire(ex: Executeur): Promise<string> {
  const prefixe = `INV-${new Date().getFullYear()}-`;
  const rows = await ex.select({ numero: tissuInventaire.numero }).from(tissuInventaire).where(like(tissuInventaire.numero, `${prefixe}%`));
  let max = 0;
  for (const r of rows) {
    const n = parseInt(r.numero.slice(prefixe.length), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefixe}${String(max + 1).padStart(3, "0")}`;
}

export async function ouvrirInventaire(input: { zone?: string; note?: string }): Promise<Result<{ id: number; numero: string }>> {
  try {
    const a = await auteurTissu();
    const zone = (input.zone ?? "").trim().toUpperCase();
    const [ouvert] = await db.select({ numero: tissuInventaire.numero, zone: tissuInventaire.zone }).from(tissuInventaire).where(eq(tissuInventaire.statut, "ouvert"));
    if (ouvert && (!ouvert.zone || !zone || ouvert.zone === zone)) {
      return { ok: false, error: `L'inventaire ${ouvert.numero} est déjà ouvert${ouvert.zone ? ` sur la zone ${ouvert.zone}` : ""} : clôturez-le d'abord.` };
    }
    const res = await db.transaction(async (t) => {
      const numero = await prochainNumeroInventaire(t);
      const [row] = await t.insert(tissuInventaire).values({ numero, zone, note: (input.note ?? "").trim(), ouvertPar: a.name }).returning({ id: tissuInventaire.id });
      return { id: row.id, numero };
    });
    revalider();
    return { ok: true, ...res };
  } catch (e) {
    return fail(e);
  }
}

/** Enregistre un rouleau scanné pendant l'inventaire. Scanner deux fois le
 * même rouleau met simplement à jour la ligne (pas de doublon). Un code
 * inconnu est gardé : il sortira en « non enregistré ». */
export async function scannerInventaire(input: {
  inventaireId: number;
  scan: string;
  metrage?: string;
  emplacement?: string;
}): Promise<Result<{ code: string; connu: boolean; deja: boolean; attendu: number | null; emplacementTheorique: string }>> {
  try {
    const a = await auteurTissu();
    const lu = rl.lireScan(input.scan);
    if (!lu || lu.type !== "rouleau") return { ok: false, error: "Scannez l'étiquette d'un rouleau (R-AAAA-NNNNNN)." };
    const [inv] = await db.select().from(tissuInventaire).where(eq(tissuInventaire.id, input.inventaireId));
    if (!inv) return { ok: false, error: "Inventaire introuvable." };
    if (inv.statut !== "ouvert") return { ok: false, error: `Inventaire ${inv.numero} clôturé.` };
    const [r] = await db
      .select({ id: tissuRouleau.id, metrageInitial: tissuRouleau.metrageInitial, emplacement: tissuEmplacement.code })
      .from(tissuRouleau)
      .leftJoin(tissuEmplacement, eq(tissuRouleau.emplacementId, tissuEmplacement.id))
      .where(eq(tissuRouleau.code, lu.code));
    let attendu: number | null = null;
    if (r) {
      const ms = await db.select({ id: tissuMouvement.id, sens: tissuMouvement.sens, quantite: tissuMouvement.quantite, annuleId: tissuMouvement.annuleId }).from(tissuMouvement).where(eq(tissuMouvement.rouleauId, r.id));
      attendu = rl.bilanRouleau(r.metrageInitial, ms).disponible;
    }
    const m = input.metrage ? nombre(input.metrage) : null;
    if (m != null && !(m >= 0)) return { ok: false, error: "Métrage constaté invalide." };
    const emp = rl.normaliserEmplacement(input.emplacement ? (rl.lireScan(input.emplacement)?.code ?? input.emplacement) : "");
    const [deja] = await db
      .select({ id: tissuInventaireScan.id })
      .from(tissuInventaireScan)
      .where(and(eq(tissuInventaireScan.inventaireId, inv.id), eq(tissuInventaireScan.code, lu.code)));
    await db
      .insert(tissuInventaireScan)
      .values({ inventaireId: inv.id, code: lu.code, rouleauId: r?.id ?? null, metrageConstate: m, emplacementCode: emp, par: a.name })
      .onConflictDoUpdate({
        target: [tissuInventaireScan.inventaireId, tissuInventaireScan.code],
        // Re-scanner sans saisir de métrage ne doit pas effacer celui déjà noté.
        set: {
          metrageConstate: sql`coalesce(excluded.metrage_constate, ${tissuInventaireScan.metrageConstate})`,
          emplacementCode: sql`coalesce(nullif(excluded.emplacement_code, ''), ${tissuInventaireScan.emplacementCode})`,
          par: a.name,
          createdAt: new Date(),
        },
      });
    revalidatePath("/magtissu");
    revalidatePath("/m/tissu/inventaire");
    return { ok: true, code: lu.code, connu: !!r, deja: !!deja, attendu, emplacementTheorique: r?.emplacement ?? "" };
  } catch (e) {
    return fail(e);
  }
}

export async function supprimerScanInventaire(scanId: number): Promise<Result> {
  try {
    await auteurTissu();
    const [s] = await db
      .select({ statut: tissuInventaire.statut })
      .from(tissuInventaireScan)
      .innerJoin(tissuInventaire, eq(tissuInventaireScan.inventaireId, tissuInventaire.id))
      .where(eq(tissuInventaireScan.id, scanId));
    if (!s) return { ok: false, error: "Scan introuvable." };
    if (s.statut !== "ouvert") return { ok: false, error: "Inventaire clôturé : ses scans ne se modifient plus." };
    await db.delete(tissuInventaireScan).where(eq(tissuInventaireScan.id, scanId));
    revalidatePath("/magtissu");
    revalidatePath("/m/tissu/inventaire");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Clôture l'inventaire. Les corrections cochées par le responsable sont
 * passées en mouvements (motif « Inventaire INV-… », ancienne / nouvelle
 * valeur) ; les rouleaux mal rangés cochés sont déplacés. Rien d'automatique. */
export async function cloturerInventaire(input: {
  inventaireId: number;
  corrections: { rouleauId: number; nouveauDisponible: string }[];
  rangements: { rouleauId: number; emplacement: string }[];
}): Promise<Result<{ corriges: number; deplaces: number }>> {
  try {
    const a = await auteurTissu();
    // Ce que l'inventaire a constaté, AVANT les corrections : c'est ce qui
    // reste affiché pour l'inventaire clos.
    const constate = (await getInventaire(input.inventaireId))?.resultat ?? null;
    const res = await db.transaction(async (t) => {
      const [inv] = await t.select().from(tissuInventaire).where(eq(tissuInventaire.id, input.inventaireId)).for("update");
      if (!inv) throw new Error("Inventaire introuvable.");
      if (inv.statut !== "ouvert") throw new Error(`Inventaire ${inv.numero} déjà clôturé.`);
      const motif = `Inventaire ${inv.numero}`;
      const ids = [...new Set([...input.corrections.map((c) => c.rouleauId), ...input.rangements.map((c) => c.rouleauId)])];
      const codes = ids.length ? await t.select({ id: tissuRouleau.id, code: tissuRouleau.code }).from(tissuRouleau).where(inArray(tissuRouleau.id, ids)) : [];
      const codeDe = new Map(codes.map((c) => [c.id, c.code]));
      let corriges = 0;
      for (const c of input.corrections) {
        const code = codeDe.get(c.rouleauId);
        if (!code) continue;
        const { r, bilan, valide } = await verrouiller(t, code);
        const nv = nombre(c.nouveauDisponible);
        if (!valide) continue;
        if (rl.refusCorrection(nv, bilan, motif)) continue; // identique ou illisible : rien à passer
        await t.insert(tissuMouvement).values({
          lotId: r.lotId, rouleauId: r.id, sens: "ajustement", quantite: r2(nv - bilan.disponible), motif,
          valeurAvant: String(bilan.disponible), valeurApres: String(r2(nv)), createdBy: a.name,
        });
        await recalculerStatut(t, r.id);
        corriges++;
      }
      let deplaces = 0;
      for (const g of input.rangements) {
        const code = codeDe.get(g.rouleauId);
        if (!code) continue;
        const { r } = await verrouiller(t, code);
        const emp = await emplacementParCode(t, g.emplacement);
        if (!emp || emp.id === r.emplacementId) continue;
        const [avant] = r.emplacementId ? await t.select({ code: tissuEmplacement.code }).from(tissuEmplacement).where(eq(tissuEmplacement.id, r.emplacementId)) : [];
        await t.update(tissuRouleau).set({ emplacementId: emp.id }).where(eq(tissuRouleau.id, r.id));
        await t.insert(tissuMouvement).values({
          lotId: r.lotId, rouleauId: r.id, sens: "deplacement", quantite: 0, motif,
          valeurAvant: avant?.code ?? "", valeurApres: emp.code, createdBy: a.name,
        });
        deplaces++;
      }
      await t.update(tissuInventaire).set({ statut: "clos", closPar: a.name, closLe: new Date(), resultat: constate }).where(eq(tissuInventaire.id, inv.id));
      return { corriges, deplaces };
    });
    revalider();
    revalidatePath("/m/tissu/inventaire");
    return { ok: true, ...res };
  } catch (e) {
    return fail(e);
  }
}
