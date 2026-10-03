import "server-only";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { journee, ouvriere, personnel, personnelFusion } from "@/lib/db/schema";
import type { JourneeOuvriere } from "@/lib/db/schema/gpao";
import { cleNom, estMatriculeProvisoire } from "@/lib/domain/atelier";
import { mesureJour, personnelDeCle, resolveurIdentite, type LigneEffectif } from "@/lib/domain/rendement-personne";
import type * as rd from "@/lib/domain/rendement";

/* Identité des ouvrières — fusion et réparation.
 *
 * Une même personne pouvait exister sous plusieurs formes : une vraie fiche,
 * une fiche provisoire (PROV-) créée en la tapant comme renfort, et des
 * journées restées « sans fiche » (figées avant le rattachement, ou
 * dupliquées). Chaque forme avait son propre rendement. Ce service ramène tout
 * à une seule fiche par personne :
 *
 *   1. FUSION des fiches de même nom quand une seule est une vraie fiche (ou
 *      qu'elles sont toutes provisoires) : la fiche gardée récupère les lignes
 *      de chaîne, les journées et les champs vides ; les autres disparaissent.
 *      Deux VRAIES fiches du même nom (deux matricules) sont des homonymes : on
 *      ne tranche pas, on les signale.
 *   2. Les lignes de chaîne sans fiche sont reliées quand le nom est sûr.
 *   3. Chaque ligne des effectifs figés reçoit sa fiche (règle unique).
 *   4. Les journées sans effectif figé (reprises de l'ancien PilotPro) sont
 *      figées : équipe de la chaîne + toute ouvrière ayant une saisie ce
 *      jour-là — elles ne changeront plus quand une chaîne évolue.
 *
 * `appliquer = false` calcule le même bilan sans rien écrire (aperçu). */

export type BilanIdentites = {
  fichesFusionnees: { garde: { id: number; nom: string; matricule: string }; absorbees: { id: number; matricule: string }[] }[];
  /** Plusieurs VRAIES fiches du même nom : fusion manuelle, fiche à garder au choix. */
  homonymes: { nom: string; fiches: { id: number; matricule: string; fonction: string; journees: number }[] }[];
  lignesChaineReliees: number;
  journeesCorrigees: number;
  lignesJourReliees: number;
  journeesFigees: number;
  sansFiche: string[];
  doublonsJour: { date: string; nom: string }[];
  saisiesOrphelines: number;
};

class Apercu extends Error {
  constructor(public bilan: BilanIdentites) {
    super("apercu");
  }
}

type Options = { fusionner?: boolean };

export async function reparerIdentites(appliquer: boolean, opts: Options = {}): Promise<BilanIdentites> {
  const fusionner = opts.fusionner ?? true;
  try {
    return await db.transaction(async (tx) => {
      const bilan: BilanIdentites = {
        fichesFusionnees: [],
        homonymes: [],
        lignesChaineReliees: 0,
        journeesCorrigees: 0,
        lignesJourReliees: 0,
        journeesFigees: 0,
        sansFiche: [],
        doublonsJour: [],
        saisiesOrphelines: 0,
      };

      /* ── 1. fusion des fiches en double ── */
      let fiches = await tx.select().from(personnel);
      const redirection = new Map<number, number>(); // fiche absorbée → fiche gardée
      const homonymes: (typeof fiches)[] = [];
      if (fusionner) {
        const parNom = new Map<string, typeof fiches>();
        for (const f of fiches) {
          const c = cleNom(f.nom);
          if (!c) continue;
          const g = parNom.get(c);
          if (g) g.push(f);
          else parNom.set(c, [f]);
        }
        for (const groupe of parNom.values()) {
          if (groupe.length < 2) continue;
          const vraies = groupe.filter((f) => !estMatriculeProvisoire(f.matricule));
          if (vraies.length >= 2) {
            homonymes.push(groupe);
            continue;
          }
          const garde = vraies[0] ?? [...groupe].sort((a, b) => a.id - b.id)[0];
          const absorbees = groupe.filter((f) => f.id !== garde.id);
          for (const a of absorbees) redirection.set(a.id, garde.id);
          bilan.fichesFusionnees.push({
            garde: { id: garde.id, nom: garde.nom, matricule: garde.matricule },
            absorbees: absorbees.map((a) => ({ id: a.id, matricule: a.matricule })),
          });

          // La fiche gardée récupère ce qui lui manquait.
          const complement: Partial<typeof personnel.$inferInsert> = {};
          for (const a of absorbees) {
            if (!garde.fonction && a.fonction && !complement.fonction) complement.fonction = a.fonction;
            if (!garde.atelier && a.atelier && !complement.atelier) complement.atelier = a.atelier;
            if (!garde.dateEntree && a.dateEntree && !complement.dateEntree) complement.dateEntree = a.dateEntree;
          }
          if (Object.keys(complement).length) await tx.update(personnel).set(complement).where(eq(personnel.id, garde.id));
          const ids = absorbees.map((a) => a.id);
          await tx.update(ouvriere).set({ personnelId: garde.id }).where(inArray(ouvriere.personnelId, ids));
        }
        if (redirection.size) {
          // Mémoire des fusions : les journées anciennes suivront la fiche gardée.
          await memoriserFusions(tx, fiches.filter((f) => redirection.has(f.id)), redirection);
          await tx.delete(personnel).where(inArray(personnel.id, [...redirection.keys()]));
        }
        fiches = fiches.filter((f) => !redirection.has(f.id));
      }
      const idsFiches = new Set(fiches.map((f) => f.id));

      /* ── 2. lignes de chaîne sans fiche : nom sûr → fiche ── */
      const parNomUnique = new Map<string, number | null>();
      for (const f of fiches) {
        const c = cleNom(f.nom);
        if (c) parNomUnique.set(c, parNomUnique.has(c) ? null : f.id);
      }
      const lignes = await tx.select().from(ouvriere);
      for (const l of lignes) {
        if (l.personnelId != null && idsFiches.has(l.personnelId)) continue;
        const pid = parNomUnique.get(cleNom(l.nom));
        if (pid == null) continue;
        await tx.update(ouvriere).set({ personnelId: pid }).where(eq(ouvriere.id, l.id));
        l.personnelId = pid;
        bilan.lignesChaineReliees++;
      }

      /* ── 3 & 4. effectifs des journées ── */
      const fusions = await tx.select({ ancienId: personnelFusion.ancienId, gardeId: personnelFusion.gardeId }).from(personnelFusion);
      const cleDe = resolveurIdentite(fiches, lignes, fusions);
      const parId = new Map(lignes.map((l) => [l.id, l]));
      const parChaine = new Map<number, typeof lignes>();
      for (const l of [...lignes].sort((a, b) => a.id - b.id)) {
        const g = parChaine.get(l.chaineId);
        if (g) g.push(l);
        else parChaine.set(l.chaineId, [l]);
      }
      const sansFiche = new Set<string>();
      const journees = await tx.select().from(journee);

      for (const j of journees) {
        const figee = ((j.ouvrieres ?? []) as JourneeOuvriere[]).length > 0;
        let roster: JourneeOuvriere[];
        if (figee) {
          roster = (j.ouvrieres as JourneeOuvriere[]).map((o) => ({ ...o }));
        } else {
          // Équipe de la chaîne + toute ouvrière ayant une saisie ce jour-là.
          roster = (parChaine.get(j.chaineId) ?? []).map((l) => ({ id: l.id, nom: l.nom, poste: l.poste, sam: l.sam, personnelId: l.personnelId }));
          const presents = new Set(roster.map((o) => o.id));
          const avecSaisie = new Set<number>();
          for (const m of [j.ops, j.opsDetail, j.ret, j.arrets]) for (const k of Object.keys(m ?? {})) avecSaisie.add(Number(k));
          for (const id of avecSaisie) {
            if (presents.has(id)) continue;
            const l = parId.get(id);
            if (!l) {
              bilan.saisiesOrphelines++;
              continue;
            }
            roster.push({ id: l.id, nom: l.nom, poste: l.poste, sam: l.sam, personnelId: l.personnelId });
          }
        }

        let touche = !figee && roster.length > 0;
        for (const o of roster) {
          let pid = o.personnelId ?? null;
          if (pid != null && redirection.has(pid)) pid = redirection.get(pid)!;
          // Fiche disparue : la mémoire des fusions, puis le nom (à une faute près).
          if (pid == null || !idsFiches.has(pid)) pid = personnelDeCle(cleDe({ ...o, personnelId: pid }));
          if ((o.personnelId ?? null) !== pid) {
            if (figee) bilan.lignesJourReliees++;
            o.personnelId = pid;
            touche = true;
          }
        }

        /* Contrôles, sur l'effectif corrigé : personnes restées sans fiche, et
         * même personne sur deux lignes de la même journée. */
        const brute = { date: j.date, cols: j.cols ?? [], ops: j.ops ?? {}, opsDetail: j.opsDetail ?? {}, opsSam: j.opsSam ?? {}, ret: j.ret ?? {} } as rd.JourneeBrute;
        const vus = new Map<string, number>();
        for (const o of roster as LigneEffectif[]) {
          const m = mesureJour(brute, [o]);
          if (m.heures <= 0 && m.pieces <= 0) continue;
          const cle = cleDe(o);
          if (cle.startsWith("N:")) sansFiche.add(o.nom.trim());
          vus.set(cle, (vus.get(cle) ?? 0) + 1);
          if (vus.get(cle) === 2) bilan.doublonsJour.push({ date: j.date, nom: o.nom });
        }

        if (!touche) continue;
        if (figee) bilan.journeesCorrigees++;
        else bilan.journeesFigees++;
        await tx.update(journee).set({ ouvrieres: roster }).where(eq(journee.id, j.id));
      }

      // Homonymes : on indique l'activité de chaque fiche pour aider à choisir.
      const activite = new Map<number, number>();
      for (const j of await tx.select({ ouvrieres: journee.ouvrieres }).from(journee)) {
        const vus = new Set<number>();
        for (const o of (j.ouvrieres ?? []) as JourneeOuvriere[]) if (o.personnelId != null) vus.add(o.personnelId);
        for (const id of vus) activite.set(id, (activite.get(id) ?? 0) + 1);
      }
      bilan.homonymes = homonymes.map((g) => ({
        nom: g[0].nom,
        fiches: g
          .map((f) => ({ id: f.id, matricule: f.matricule, fonction: f.fonction, journees: activite.get(f.id) ?? 0 }))
          .sort((a, b) => b.journees - a.journees || Number(estMatriculeProvisoire(a.matricule)) - Number(estMatriculeProvisoire(b.matricule))),
      }));

      bilan.sansFiche = [...sansFiche].filter(Boolean).sort((a, b) => a.localeCompare(b, "fr"));
      bilan.doublonsJour.sort((a, b) => a.date.localeCompare(b.date));
      if (!appliquer) throw new Apercu(bilan);
      return bilan;
    });
  } catch (e) {
    if (e instanceof Apercu) return e.bilan;
    throw e;
  }
}

/** Après un rattachement ou une création de fiche : fusion des doublons et
 * mise à jour des journées, sans jamais bloquer l'action qui l'a déclenchée. */
export async function resynchroniserIdentites(opts: Options = {}): Promise<void> {
  try {
    await reparerIdentites(true, opts);
  } catch (e) {
    console.error("resynchroniserIdentites", e);
  }
}

/** Complète les fiches d'un effectif avant de l'enregistrer (duplication de
 * journée…) : même règle que partout, sans rien modifier d'autre. */
export async function completerFiches(roster: JourneeOuvriere[]): Promise<JourneeOuvriere[]> {
  if (!roster.some((o) => o.personnelId == null)) return roster;
  const [fiches, lignes] = await Promise.all([
    db.select({ id: personnel.id, nom: personnel.nom }).from(personnel),
    db.select({ id: ouvriere.id, nom: ouvriere.nom, personnelId: ouvriere.personnelId }).from(ouvriere),
  ]);
  const fusions = await db.select({ ancienId: personnelFusion.ancienId, gardeId: personnelFusion.gardeId }).from(personnelFusion);
  const cleDe = resolveurIdentite(fiches, lignes, fusions);
  return roster.map((o) => (o.personnelId != null ? o : { ...o, personnelId: personnelDeCle(cleDe(o)) }));
}

/** Fusion MANUELLE de fiches (homonymes à deux vrais matricules) : la fiche
 * gardée récupère lignes de chaîne, journées et champs vides ; les autres
 * disparaissent. Suivie d'une réparation complète pour tout réaligner. */
export async function fusionnerFiches(gardeId: number, autresIds: number[]): Promise<BilanIdentites> {
  const autres = [...new Set(autresIds)].filter((id) => id !== gardeId);
  if (!autres.length) throw new Error("Rien à fusionner");
  let fusion: BilanIdentites["fichesFusionnees"][number] | null = null;
  await db.transaction(async (tx) => {
    const fiches = await tx.select().from(personnel).where(inArray(personnel.id, [gardeId, ...autres]));
    const garde = fiches.find((f) => f.id === gardeId);
    if (!garde) throw new Error("Fiche à garder introuvable");
    const absorbees = fiches.filter((f) => f.id !== gardeId);
    fusion = {
      garde: { id: garde.id, nom: garde.nom, matricule: garde.matricule },
      absorbees: absorbees.map((a) => ({ id: a.id, matricule: a.matricule })),
    };
    const complement: Partial<typeof personnel.$inferInsert> = {};
    for (const a of absorbees) {
      if (!garde.fonction && a.fonction && !complement.fonction) complement.fonction = a.fonction;
      if (!garde.atelier && a.atelier && !complement.atelier) complement.atelier = a.atelier;
      if (!garde.dateEntree && a.dateEntree && !complement.dateEntree) complement.dateEntree = a.dateEntree;
    }
    if (Object.keys(complement).length) await tx.update(personnel).set(complement).where(eq(personnel.id, gardeId));
    const ids = new Set(absorbees.map((a) => a.id));
    await tx.update(ouvriere).set({ personnelId: gardeId }).where(inArray(ouvriere.personnelId, [...ids]));
    for (const j of await tx.select({ id: journee.id, ouvrieres: journee.ouvrieres }).from(journee)) {
      const roster = (j.ouvrieres ?? []) as JourneeOuvriere[];
      if (!roster.some((o) => o.personnelId != null && ids.has(o.personnelId))) continue;
      await tx
        .update(journee)
        .set({ ouvrieres: roster.map((o) => (o.personnelId != null && ids.has(o.personnelId) ? { ...o, personnelId: gardeId } : o)) })
        .where(eq(journee.id, j.id));
    }
    await memoriserFusions(tx, absorbees, new Map([...ids].map((id) => [id, gardeId])));
    await tx.delete(personnel).where(inArray(personnel.id, [...ids]));
  });
  const bilan = await reparerIdentites(true);
  if (fusion) bilan.fichesFusionnees.unshift(fusion);
  return bilan;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Écrit « ancienne fiche → fiche gardée » (et réoriente les fusions qui
 * pointaient vers une fiche à son tour absorbée). */
async function memoriserFusions(tx: Tx, absorbees: { id: number; nom: string; matricule: string }[], vers: Map<number, number>) {
  for (const a of absorbees) {
    const garde = vers.get(a.id);
    if (garde == null) continue;
    await tx
      .insert(personnelFusion)
      .values({ ancienId: a.id, gardeId: garde, ancienNom: a.nom, ancienMatricule: a.matricule })
      .onConflictDoUpdate({ target: personnelFusion.ancienId, set: { gardeId: garde } });
    await tx.update(personnelFusion).set({ gardeId: garde }).where(eq(personnelFusion.gardeId, a.id));
  }
}

/** Mémoire des fusions, pour la règle d'identité (lib/domain/rendement-personne). */
export async function listFusions() {
  return db.select({ ancienId: personnelFusion.ancienId, gardeId: personnelFusion.gardeId }).from(personnelFusion);
}
