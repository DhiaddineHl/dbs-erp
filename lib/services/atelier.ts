import "server-only";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { chaine, journee, operation, ouvriere, personnel } from "@/lib/db/schema";
import type { JourneeOuvriere } from "@/lib/db/schema/gpao";
import { cleAleatoire } from "@/lib/atelier/cle";
import * as at from "@/lib/domain/atelier";

/* ─────────── personnel ─────────── */

export type PersonneRow = {
  id: number;
  matricule: string;
  nom: string;
  fonction: string;
  atelier: string;
  statut: string;
  dateEntree: string;
  portailCle: string;
  /** Chaînes où elle est affectée, pour repérer les personnes non rattachées. */
  chaines: string[];
};

export async function listPersonnel(): Promise<PersonneRow[]> {
  const [rows, affectations] = await Promise.all([
    db.select().from(personnel).orderBy(asc(personnel.nom)),
    db
      .select({ personnelId: ouvriere.personnelId, chaineNom: chaine.nom })
      .from(ouvriere)
      .innerJoin(chaine, eq(ouvriere.chaineId, chaine.id)),
  ]);

  const parPersonne = new Map<number, string[]>();
  for (const a of affectations) {
    if (a.personnelId === null) continue;
    const g = parPersonne.get(a.personnelId);
    if (g) {
      if (!g.includes(a.chaineNom)) g.push(a.chaineNom);
    } else parPersonne.set(a.personnelId, [a.chaineNom]);
  }

  return rows.map((p) => ({
    id: p.id, matricule: p.matricule, nom: p.nom, fonction: p.fonction,
    atelier: p.atelier, statut: p.statut, dateEntree: p.dateEntree ?? "",
    portailCle: p.portailCle, chaines: parPersonne.get(p.id) ?? [],
  }));
}

export async function creerPersonne(v: {
  matricule: string;
  nom: string;
  fonction: string;
  atelier: string;
  statut: string;
  dateEntree: string | null;
}) {
  const [row] = await db
    .insert(personnel)
    .values({ ...v, portailCle: cleAleatoire() })
    .returning({ id: personnel.id });
  return row;
}

export async function majPersonne(id: number, patch: Partial<typeof personnel.$inferInsert>) {
  await db.update(personnel).set(patch).where(eq(personnel.id, id));
}

export async function supprimerPersonne(id: number) {
  await db.delete(personnel).where(eq(personnel.id, id));
}

/** Regénère la clé du portail : à faire quand un QR imprimé a fuité. */
export async function regenererCle(id: number) {
  const cle = cleAleatoire();
  await db.update(personnel).set({ portailCle: cle }).where(eq(personnel.id, id));
  return cle;
}

/* ─────────── rattachement ouvrière ↔ personne ─────────── */

export type OuvriereRow = {
  id: number;
  nom: string;
  poste: string;
  sam: number;
  chaineId: number;
  chaineNom: string;
  personnelId: number | null;
  matricule: string;
  portailCle: string;
};

export async function listOuvrieres(): Promise<OuvriereRow[]> {
  const rows = await db
    .select({ o: ouvriere, chaineNom: chaine.nom, p: personnel })
    .from(ouvriere)
    .innerJoin(chaine, eq(ouvriere.chaineId, chaine.id))
    .leftJoin(personnel, eq(ouvriere.personnelId, personnel.id))
    .orderBy(asc(chaine.nom), asc(ouvriere.nom));

  return rows.map(({ o, chaineNom, p }) => ({
    id: o.id, nom: o.nom, poste: o.poste, sam: o.sam, chaineId: o.chaineId, chaineNom,
    personnelId: o.personnelId, matricule: p?.matricule ?? "", portailCle: p?.portailCle ?? "",
  }));
}

export async function rattacher(ouvriereId: number, personnelId: number | null) {
  await db.update(ouvriere).set({ personnelId }).where(eq(ouvriere.id, ouvriereId));
}

/** Rapproche automatiquement ce qui peut l'être, et ne touche à rien d'autre.
 * Retourne le nombre de liens créés — le reste reste à faire à la main. */
export async function rattacherAuto(): Promise<{ lies: number; restants: number }> {
  const [ouvrieres, personnes] = await Promise.all([
    db.select({ id: ouvriere.id, nom: ouvriere.nom, personnelId: ouvriere.personnelId }).from(ouvriere),
    db.select({ id: personnel.id, nom: personnel.nom }).from(personnel),
  ]);

  const props = at.rapprocherParNom(ouvrieres, personnes).filter((r) => r.personnelId !== null);
  for (const r of props) {
    await db.update(ouvriere).set({ personnelId: r.personnelId }).where(eq(ouvriere.id, r.ouvriereId));
  }
  const restants = ouvrieres.filter((o) => o.personnelId === null).length - props.length;
  return { lies: props.length, restants };
}

/* ─────────── catalogue d'opérations ─────────── */

export type OperationRow = { id: number; nom: string; sam: number; archive: boolean };

export async function listOperations(): Promise<OperationRow[]> {
  return db.select().from(operation).orderBy(asc(operation.nom));
}

export async function creerOperation(v: { nom: string; sam: number }) {
  const [row] = await db.insert(operation).values(v).returning({ id: operation.id });
  return row;
}

export async function majOperation(id: number, patch: Partial<typeof operation.$inferInsert>) {
  await db.update(operation).set(patch).where(eq(operation.id, id));
}

export async function supprimerOperations(ids: number[]) {
  if (ids.length) await db.delete(operation).where(inArray(operation.id, ids));
}

/** Fusionne des doublons dans une opération de référence : on archive les
 * autres plutôt que de les supprimer, car des journées les citent peut-être
 * encore par leur libellé. */
export async function fusionnerOperations(gardeeId: number, autresIds: number[]) {
  const ids = autresIds.filter((i) => i !== gardeeId);
  if (!ids.length) return 0;
  await db.update(operation).set({ archive: true }).where(inArray(operation.id, ids));
  return ids.length;
}

/* ═══════════ CAPTURE AUTOMATIQUE DU RÉFÉRENTIEL ═══════════
   L'application d'origine laissait retaper le libellé du poste à chaque saisie,
   d'où 509 variantes orthographiques pour bien moins de gestes réels. Le remède
   n'est pas de discipliner la saisie mais de la capturer : tout poste tapé
   quelque part entre au catalogue s'il n'y est pas, et toute ouvrière saisie
   entre au registre si personne ne lui ressemble. */

/** Ajoute au catalogue les libellés qui en sont absents. Idempotent : un
 * libellé déjà connu (à la casse, aux accents et aux espaces près) n'est pas
 * touché — surtout pas son SAM, qui a pu être corrigé à la main depuis. */
export async function assurerOperations(
  entrees: { nom: string; sam?: number }[],
  source = "saisie",
): Promise<number> {
  const voulues = new Map<string, { nom: string; sam: number }>();
  for (const e of entrees) {
    if (!at.libelleUtilisable(e.nom)) continue;
    const cle = at.cleOperation(e.nom);
    if (!voulues.has(cle)) voulues.set(cle, { nom: e.nom.trim(), sam: Math.max(0, Math.round(e.sam || 0)) });
  }
  if (!voulues.size) return 0;

  const connues = await db.select({ nom: operation.nom }).from(operation);
  for (const o of connues) voulues.delete(at.cleOperation(o.nom));
  if (!voulues.size) return 0;

  const values = [...voulues.values()].map((v) => ({ ...v, source }));
  // Deux postes peuvent créer le même libellé en même temps : la contrainte
  // n'existe pas en base, donc on relit après coup plutôt que de verrouiller.
  await db.insert(operation).values(values);
  return values.length;
}

/** Prochain matricule provisoire libre (PROV-1, PROV-2, …). */
async function prochainMatriculeProvisoire(): Promise<string> {
  const rows = await db.select({ matricule: personnel.matricule }).from(personnel);
  let max = 0;
  for (const r of rows) {
    if (!at.estMatriculeProvisoire(r.matricule)) continue;
    const n = parseInt(r.matricule.slice(at.PREFIXE_PROVISOIRE.length), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${at.PREFIXE_PROVISOIRE}${max + 1}`;
}

export type ResolutionPersonne = { personnelId: number | null; creee: boolean; matricule: string };

/** Retrouve — ou crée — la fiche registre correspondant à un nom saisi.
 *
 * Ne crée que si AUCUNE fiche ne porte ce nom : une homonymie ou une simple
 * ressemblance laisse la ligne non rattachée, à trancher dans l'assistant de
 * fusion. La fiche créée porte un matricule provisoire visible, jamais un
 * matricule de paie inventé. */
export async function assurerPersonne(nom: string, fonction = ""): Promise<ResolutionPersonne> {
  const propre = nom.trim();
  if (!propre) return { personnelId: null, creee: false, matricule: "" };

  const cle = at.cleNom(propre);
  const rows = await db.select({ id: personnel.id, nom: personnel.nom, matricule: personnel.matricule }).from(personnel);
  const exacts = rows.filter((p) => at.cleNom(p.nom) === cle);
  if (exacts.length === 1) return { personnelId: exacts[0].id, creee: false, matricule: exacts[0].matricule };
  if (exacts.length > 1) return { personnelId: null, creee: false, matricule: "" };

  const matricule = await prochainMatriculeProvisoire();
  const [row] = await db
    .insert(personnel)
    .values({
      matricule,
      nom: propre,
      fonction: fonction.trim(),
      atelier: "",
      statut: "active",
      dateEntree: null,
      portailCle: cleAleatoire(),
    })
    .returning({ id: personnel.id });
  return { personnelId: row.id, creee: true, matricule };
}

/** Rattrapage : balaie tout ce qui a déjà été saisi et complète le catalogue.
 *
 * Sources balayées, dans l'ordre où l'atelier les alimente : effectifs de
 * chaîne, effectifs figés des journées, postes tenus heure par heure, et le
 * détail des heures multi-postes. */
export async function synchroniserOperations(): Promise<number> {
  const [ouvrieres, journees] = await Promise.all([
    db.select({ poste: ouvriere.poste, sam: ouvriere.sam }).from(ouvriere),
    db
      .select({
        ouvrieres: journee.ouvrieres,
        opsSam: journee.opsSam,
        opsPoste: journee.opsPoste,
        opsDetail: journee.opsDetail,
      })
      .from(journee),
  ]);

  const trouvees: { nom: string; sam: number }[] = [];
  for (const o of ouvrieres) trouvees.push({ nom: o.poste, sam: o.sam });

  for (const j of journees) {
    for (const o of (j.ouvrieres ?? []) as JourneeOuvriere[]) trouvees.push({ nom: o.poste, sam: o.sam });

    // Poste tenu à une heure donnée, avec le SAM de cette heure-là s'il diffère.
    for (const [oid, parHeure] of Object.entries(j.opsPoste ?? {})) {
      const sams = (j.opsSam ?? {})[oid as unknown as number] ?? {};
      for (const [heure, poste] of Object.entries(parHeure ?? {})) {
        trouvees.push({ nom: poste, sam: sams[heure] ?? 0 });
      }
    }
    // Heures partagées entre deux opérations.
    for (const parHeure of Object.values(j.opsDetail ?? {})) {
      for (const details of Object.values(parHeure ?? {})) {
        for (const d of details ?? []) trouvees.push({ nom: d.poste, sam: d.sam });
      }
    }
  }

  return assurerOperations(trouvees, "saisie");
}

/* ═══════════ IMPORTS ═══════════ */

export type LignePersonnel = {
  matricule: string;
  nom: string;
  atelier: string;
  fonction: string;
  dateEntree: string | null;
  statut: string;
  /** Colonnes du gabarit servant à l'affectation qui suit l'import. */
  poste: string;
  sam: number;
};

export type BilanImportPersonnel = {
  crees: number;
  majs: number;
  ignores: number;
  /** Personnes touchées, avec le poste et le SAM lus dans le fichier : c'est
   * ce qui permet à l'affectation qui suit de ne rien faire ressaisir. */
  affectations: { personnelId: number; poste: string; sam: number }[];
};

/** Import du registre. Le matricule fait foi : une ligne dont le matricule est
 * déjà connu met la fiche à jour au lieu d'en créer une seconde. Une ligne sans
 * matricule est rapprochée par le nom, et crée une fiche provisoire à défaut. */
export async function importerPersonnel(lignes: LignePersonnel[]): Promise<BilanImportPersonnel> {
  const bilan: BilanImportPersonnel = { crees: 0, majs: 0, ignores: 0, affectations: [] };
  if (!lignes.length) return bilan;

  const existants = await db
    .select({ id: personnel.id, nom: personnel.nom, matricule: personnel.matricule })
    .from(personnel);
  const parMatricule = new Map(existants.map((p) => [p.matricule.trim(), p]));
  const parNom = new Map<string, { id: number }[]>();
  for (const p of existants) {
    const c = at.cleNom(p.nom);
    if (!c) continue;
    const g = parNom.get(c);
    if (g) g.push(p);
    else parNom.set(c, [p]);
  }

  let provisoire = 0;
  const matriculeProvisoire = async () => {
    if (!provisoire) provisoire = parseInt((await prochainMatriculeProvisoire()).slice(at.PREFIXE_PROVISOIRE.length), 10);
    else provisoire++;
    return `${at.PREFIXE_PROVISOIRE}${provisoire}`;
  };

  for (const l of lignes) {
    const nom = l.nom.trim();
    if (!nom) {
      bilan.ignores++;
      continue;
    }
    const statut = at.estStatutPersonnel(l.statut) ? l.statut : "active";
    const champs = {
      nom,
      fonction: l.fonction.trim(),
      atelier: l.atelier.trim(),
      statut,
      dateEntree: l.dateEntree,
    };

    const parMat = l.matricule.trim() ? parMatricule.get(l.matricule.trim()) : undefined;
    const homonymes = parNom.get(at.cleNom(nom)) ?? [];
    const cible = parMat ?? (l.matricule.trim() ? undefined : homonymes.length === 1 ? homonymes[0] : undefined);

    if (cible) {
      await db.update(personnel).set(champs).where(eq(personnel.id, cible.id));
      bilan.majs++;
      bilan.affectations.push({ personnelId: cible.id, poste: l.poste, sam: l.sam });
      continue;
    }

    const matricule = l.matricule.trim() || (await matriculeProvisoire());
    const [row] = await db
      .insert(personnel)
      .values({ ...champs, matricule, portailCle: cleAleatoire() })
      .returning({ id: personnel.id });
    parMatricule.set(matricule, { id: row.id, nom, matricule });
    bilan.crees++;
    bilan.affectations.push({ personnelId: row.id, poste: l.poste, sam: l.sam });
  }

  // Les postes lus dans le fichier alimentent aussi le catalogue.
  await assurerOperations(
    lignes.filter((l) => l.poste).map((l) => ({ nom: l.poste, sam: l.sam })),
    "import",
  );
  return bilan;
}

/** Affecte à une chaîne des personnes du registre, avec le poste et le SAM lus
 * dans le fichier. Une personne déjà présente sur la chaîne n'y est pas
 * doublée. */
export async function affecterAChaine(
  chaineId: number,
  personnes: { personnelId: number; poste: string; sam: number }[],
): Promise<number> {
  if (!personnes.length) return 0;
  const [fiches, deja] = await Promise.all([
    db.select({ id: personnel.id, nom: personnel.nom, fonction: personnel.fonction }).from(personnel),
    db.select({ personnelId: ouvriere.personnelId }).from(ouvriere).where(eq(ouvriere.chaineId, chaineId)),
  ]);
  const parId = new Map(fiches.map((p) => [p.id, p]));
  const presentes = new Set(deja.map((o) => o.personnelId).filter((x): x is number => x !== null));

  const values = personnes
    .filter((p) => parId.has(p.personnelId) && !presentes.has(p.personnelId))
    .map((p) => {
      const fiche = parId.get(p.personnelId)!;
      return {
        chaineId,
        nom: fiche.nom,
        poste: p.poste.trim() || fiche.fonction,
        sam: Math.max(0, Math.round(p.sam || 0)) || 100,
        personnelId: p.personnelId,
      };
    });
  if (!values.length) return 0;

  await db.insert(ouvriere).values(values);
  await assurerOperations(values.map((v) => ({ nom: v.poste, sam: v.sam })), "import");
  return values.length;
}

export type LigneOperation = { nom: string; sam: number };

export async function importerOperations(lignes: LigneOperation[]): Promise<number> {
  return assurerOperations(lignes, "import");
}

/* ═══════════ FUSION PERSONNEL ⇄ OUVRIÈRES ═══════════ */

export type NomSaisi = { nom: string; matricule: string; rattachee: boolean; occurrences: number };

/** Noms distincts saisis en atelier, chaînes et effectifs de journée confondus.
 *
 * Dédoublonné ici et pas dans l'écran : les effectifs figés représentent des
 * milliers de lignes (une par ouvrière et par journée) pour quelques centaines
 * de noms réels. Une ligne n'est dite rattachée que si TOUTES ses occurrences
 * le sont — une seule journée orpheline vaut la peine d'être corrigée. */
export async function nomsSaisis(): Promise<NomSaisi[]> {
  const [ouvrieres, journees] = await Promise.all([
    db
      .select({ nom: ouvriere.nom, personnelId: ouvriere.personnelId, matricule: personnel.matricule })
      .from(ouvriere)
      .leftJoin(personnel, eq(ouvriere.personnelId, personnel.id)),
    db.select({ ouvrieres: journee.ouvrieres }).from(journee),
  ]);

  const par = new Map<string, NomSaisi>();
  const ajouter = (nom: string, matricule: string, rattachee: boolean) => {
    const cle = at.cleNom(nom);
    if (!cle) return;
    const vu = par.get(cle);
    if (!vu) {
      par.set(cle, { nom, matricule, rattachee, occurrences: 1 });
      return;
    }
    vu.occurrences++;
    if (!vu.matricule && matricule) vu.matricule = matricule;
    if (!rattachee) vu.rattachee = false;
  };

  for (const o of ouvrieres) ajouter(o.nom, o.matricule ?? "", o.personnelId !== null);
  for (const j of journees) {
    for (const o of (j.ouvrieres ?? []) as JourneeOuvriere[]) ajouter(o.nom, "", o.personnelId != null);
  }
  return [...par.values()];
}

export type BilanFusion = { ouvrieres: number; journees: number };

/** Applique les rattachements choisis dans l'assistant.
 *
 * Pour chaque nom retenu : toutes les lignes d'atelier qui le portent prennent
 * l'orthographe du registre et son identifiant. Les effectifs figés des
 * journées sont réécrits eux aussi — sans quoi l'historique continuerait à
 * suivre l'ancien nom et le QR de rendement resterait muet.
 *
 * Tout se fait dans une transaction : un rattachement à moitié appliqué
 * laisserait deux vérités sur la même personne. */
export async function appliquerFusion(liens: { nom: string; personnelId: number }[]): Promise<BilanFusion> {
  const bilan: BilanFusion = { ouvrieres: 0, journees: 0 };
  if (!liens.length) return bilan;

  return db.transaction(async (tx) => {
    const fiches = await tx.select({ id: personnel.id, nom: personnel.nom }).from(personnel);
    const parId = new Map(fiches.map((p) => [p.id, p]));

    // Une clé de nom ne peut viser qu'une personne : le dernier choix gagne.
    const cible = new Map<string, { id: number; nom: string }>();
    for (const l of liens) {
      const p = parId.get(l.personnelId);
      if (p) cible.set(at.cleNom(l.nom), p);
    }
    if (!cible.size) return bilan;

    const ouvrieres = await tx.select({ id: ouvriere.id, nom: ouvriere.nom }).from(ouvriere);
    for (const o of ouvrieres) {
      const p = cible.get(at.cleNom(o.nom));
      if (!p) continue;
      await tx.update(ouvriere).set({ nom: p.nom, personnelId: p.id }).where(eq(ouvriere.id, o.id));
      bilan.ouvrieres++;
    }

    const journees = await tx.select({ id: journee.id, ouvrieres: journee.ouvrieres }).from(journee);
    for (const j of journees) {
      const roster = (j.ouvrieres ?? []) as JourneeOuvriere[];
      if (!roster.length) continue;
      let touche = false;
      const suivant = roster.map((o) => {
        const p = cible.get(at.cleNom(o.nom));
        if (!p || (o.personnelId === p.id && o.nom === p.nom)) return o;
        touche = true;
        return { ...o, nom: p.nom, personnelId: p.id };
      });
      if (!touche) continue;
      await tx.update(journee).set({ ouvrieres: suivant }).where(eq(journee.id, j.id));
      bilan.journees++;
    }

    return bilan;
  });
}

export async function statsAtelier() {
  const [[p], [o], [op]] = await Promise.all([
    db
      .select({
        total: sql<number>`count(*)::int`,
        actifs: sql<number>`count(*) filter (where ${personnel.statut} = 'active')::int`,
      })
      .from(personnel),
    db
      .select({
        total: sql<number>`count(*)::int`,
        liees: sql<number>`count(*) filter (where ${ouvriere.personnelId} is not null)::int`,
      })
      .from(ouvriere),
    db
      .select({
        total: sql<number>`count(*)::int`,
        actives: sql<number>`count(*) filter (where not ${operation.archive})::int`,
      })
      .from(operation),
  ]);
  return {
    personnel: { total: Number(p.total), actifs: Number(p.actifs) },
    ouvrieres: { total: Number(o.total), liees: Number(o.liees) },
    operations: { total: Number(op.total), actives: Number(op.actives) },
  };
}
