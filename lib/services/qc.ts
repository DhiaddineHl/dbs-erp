import "server-only";
import { asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  chaine,
  client,
  commande,
  faconnier,
  mQrqc,
  qcBareme,
  qcBaremePoint,
  qcDefaut,
  qcInspection,
  qcMesure,
  qcPhoto,
} from "@/lib/db/schema";
import * as qc from "@/lib/domain/qc";
import { todayISO } from "@/lib/domain/commande";

/* ─────────── modèles de lecture ─────────── */

export type DefautRow = {
  id: number;
  famille: string;
  description: string;
  gravite: string;
  nombre: number;
  photos: { id: number; hash: string }[];
};

export type MesureRow = {
  id: number;
  point: string;
  taille: string;
  spec: number | null;
  tolerance: number | null;
  mesure: number | null;
  ecart: number | null;
  horsTolerance: boolean;
};

export type InspectionRow = {
  id: number;
  numero: number;
  ref_affichee: string;
  date: string;
  commandeId: number | null;
  of: string;
  client: string;
  modele: string;
  ref: string;
  couleur: string;
  faconnier: string;
  lot: number;
  controleur: string;
  statut: string;
  note: string;
  qrqcId: number | null;
  recontroleDeId: number | null;
  recontroleId: number | null;
  dateCloture: string;

  defauts: DefautRow[];
  mesures: MesureRow[];
  photosGenerales: { id: number; hash: string; legende: string }[];

  /* dérivés */
  plan: qc.PlanAql;
  proposition: qc.PropositionVerdict;
  verdict: qc.Verdict;
  verdictForce: string;
  totalDefauts: number;
  baremeApparieId: number | null;
  baremeApparieNom: string;
};

export type BaremeRow = {
  id: number;
  nom: string;
  client: string;
  refs: string[];
  tailles: string[];
  points: { id: number; ordre: number; label: string; tolerance: number; valeurs: Record<string, number> }[];
};

const iso = (d: string | null) => d ?? "";

export async function listBaremes(): Promise<BaremeRow[]> {
  const [baremes, points] = await Promise.all([
    db.select().from(qcBareme).orderBy(asc(qcBareme.nom)),
    db.select().from(qcBaremePoint).orderBy(asc(qcBaremePoint.ordre)),
  ]);
  const parBareme = new Map<number, typeof points>();
  for (const p of points) {
    const g = parBareme.get(p.baremeId);
    if (g) g.push(p);
    else parBareme.set(p.baremeId, [p]);
  }
  return baremes.map((b) => ({
    id: b.id,
    nom: b.nom,
    client: b.client,
    refs: b.refs,
    tailles: b.tailles,
    points: (parBareme.get(b.id) ?? []).map((p) => ({
      id: p.id, ordre: p.ordre, label: p.label, tolerance: p.tolerance, valeurs: p.valeurs,
    })),
  }));
}

export async function listInspections(): Promise<InspectionRow[]> {
  const inspections = await db.select().from(qcInspection).orderBy(desc(qcInspection.numero));
  if (!inspections.length) return [];
  const ids = inspections.map((i) => i.id);

  const [defauts, mesures, photos, baremes] = await Promise.all([
    db.select().from(qcDefaut).where(inArray(qcDefaut.inspectionId, ids)).orderBy(asc(qcDefaut.id)),
    db.select().from(qcMesure).where(inArray(qcMesure.inspectionId, ids)).orderBy(asc(qcMesure.id)),
    db.select().from(qcPhoto).where(inArray(qcPhoto.inspectionId, ids)).orderBy(asc(qcPhoto.id)),
    listBaremes(),
  ]);

  const group = <T extends { inspectionId: number }>(list: T[]) => {
    const m = new Map<number, T[]>();
    for (const r of list) {
      const g = m.get(r.inspectionId);
      if (g) g.push(r);
      else m.set(r.inspectionId, [r]);
    }
    return m;
  };
  const parDefaut = group(defauts);
  const parMesure = group(mesures);
  const parPhoto = group(photos);
  // Chaînage inverse : quelle inspection re-contrôle celle-ci.
  const recontrolePar = new Map(inspections.filter((i) => i.recontroleDeId).map((i) => [i.recontroleDeId!, i.id]));

  return inspections.map((i) => {
    const mesuresRows: MesureRow[] = (parMesure.get(i.id) ?? []).map((m) => {
      const e = qc.ecartMesure(m);
      return {
        id: m.id, point: m.point, taille: m.taille, spec: m.spec, tolerance: m.tolerance,
        mesure: m.mesure, ecart: e.ecart, horsTolerance: e.horsTolerance,
      };
    });
    const photosInsp = parPhoto.get(i.id) ?? [];
    const defautsRows: DefautRow[] = (parDefaut.get(i.id) ?? []).map((d) => ({
      id: d.id, famille: d.famille, description: d.description, gravite: d.gravite, nombre: d.nombre,
      photos: photosInsp.filter((p) => p.defautId === d.id).map((p) => ({ id: p.id, hash: p.hash })),
    }));

    const proposition = qc.proposerVerdict(i.lot, defautsRows, mesuresRows);
    const apparie = qc.apparierBareme(baremes, i);

    return {
      id: i.id,
      numero: i.numero,
      ref_affichee: qc.numeroQc(i.numero),
      date: iso(i.date),
      commandeId: i.commandeId,
      of: i.of,
      client: i.client,
      modele: i.modele,
      ref: i.ref,
      couleur: i.couleur,
      faconnier: i.faconnier,
      lot: i.lot,
      controleur: i.controleur,
      statut: i.statut,
      note: i.note,
      qrqcId: i.qrqcId,
      recontroleDeId: i.recontroleDeId,
      recontroleId: recontrolePar.get(i.id) ?? null,
      dateCloture: iso(i.dateCloture),

      defauts: defautsRows,
      mesures: mesuresRows,
      photosGenerales: photosInsp
        .filter((p) => p.defautId === null)
        .map((p) => ({ id: p.id, hash: p.hash, legende: p.legende })),

      plan: proposition.plan,
      proposition,
      verdict: qc.verdictEffectif(i, proposition.verdict),
      verdictForce: i.verdictForce,
      totalDefauts: defautsRows.reduce((s, d) => s + d.nombre, 0),
      baremeApparieId: apparie?.id ?? null,
      baremeApparieNom: apparie?.nom ?? "",
    };
  });
}

export async function getInspection(id: number): Promise<InspectionRow | null> {
  const all = await listInspections();
  return all.find((i) => i.id === id) ?? null;
}

/** Commandes proposées dans le sélecteur d'OF de l'éditeur.
 *
 * Un OF rattaché à un porteur n'y figure pas : le contrôle qualité porte sur
 * une référence — mêmes mesures, mêmes défauts, même barème — et se fait une
 * fois pour le groupe, sur celui qui le porte. Proposer les quatre OF ferait
 * ouvrir quatre inspections du même article, dont trois resteraient vides ou
 * répéteraient la première.
 *
 * Les inspections DÉJÀ liées à un OF depuis rattaché ne sont pas touchées :
 * elles ont été faites, elles restent lisibles. Seul le choix futur change. */
export async function listCommandesPourQc() {
  const rows = await db
    .select({
      id: commande.id, of: commande.ofNumber, modele: commande.modele, ref: commande.refArticle,
      couleur: commande.couleur, qte: commande.qte,
      clientNom: client.nom, faconnierNom: faconnier.nom, chaineNom: chaine.nom,
    })
    .from(commande)
    .where(isNull(commande.parentId))
    .leftJoin(client, eq(commande.clientId, client.id))
    .leftJoin(faconnier, eq(commande.faconnierId, faconnier.id))
    .leftJoin(chaine, eq(commande.chaineId, chaine.id))
    .orderBy(desc(commande.id));
  return rows.map((r) => ({
    id: r.id, of: r.of, modele: r.modele, ref: r.ref, couleur: r.couleur, qte: r.qte,
    client: r.clientNom ?? "",
    faconnier: r.faconnierNom ?? r.chaineNom ?? "",
  }));
}

/* ─────────── écriture ─────────── */

export type Auteur = { id: string; name: string; role: string };

async function prochainNumero() {
  const [r] = await db.select({ max: sql<number>`coalesce(max(${qcInspection.numero}), 0)::int` }).from(qcInspection);
  return (r?.max ?? 0) + 1;
}

export async function creerInspection(auteur: Auteur) {
  const numero = await prochainNumero();
  const [row] = await db
    .insert(qcInspection)
    .values({ numero, date: todayISO(), controleur: auteur.name, statut: "brouillon" })
    .returning({ id: qcInspection.id });
  return row.id;
}

/** Recopie l'identité de la commande sur l'inspection. */
export async function lierCommande(inspectionId: number, commandeId: number | null) {
  if (commandeId === null) {
    await db.update(qcInspection).set({ commandeId: null }).where(eq(qcInspection.id, inspectionId));
    return;
  }
  const [c] = (await listCommandesPourQc()).filter((x) => x.id === commandeId);
  if (!c) throw new Error("Commande introuvable");
  const [insp] = await db.select().from(qcInspection).where(eq(qcInspection.id, inspectionId));
  await db
    .update(qcInspection)
    .set({
      commandeId: c.id, of: c.of, client: c.client, modele: c.modele, ref: c.ref,
      couleur: c.couleur, faconnier: c.faconnier,
      // La taille du lot n'est proposée que si le contrôleur ne l'a pas saisie.
      lot: insp?.lot ? insp.lot : c.qte,
    })
    .where(eq(qcInspection.id, inspectionId));
}

/** Champs de l'inspection modifiables directement depuis l'éditeur. */
export type ChampInspection =
  | "date" | "controleur" | "lot" | "note" | "verdictForce"
  | "of" | "client" | "modele" | "ref" | "couleur" | "faconnier";

export async function majInspection(id: number, champ: ChampInspection, valeur: string) {
  const patch: Record<string, unknown> =
    champ === "lot" ? { lot: Math.max(0, Math.trunc(Number(valeur) || 0)) } : { [champ]: valeur };
  await db.update(qcInspection).set(patch).where(eq(qcInspection.id, id));
}

export async function supprimerInspection(id: number) {
  await db.delete(qcInspection).where(eq(qcInspection.id, id));
}

/* ── défauts ── */

export async function ajouterDefaut(inspectionId: number, famille: string) {
  const [row] = await db
    .insert(qcDefaut)
    .values({ inspectionId, famille, gravite: "majeur", nombre: 1 })
    .returning({ id: qcDefaut.id });
  return row.id;
}

export async function majDefaut(id: number, champ: "description" | "gravite" | "nombre", valeur: string) {
  const patch =
    champ === "nombre" ? { nombre: Math.max(1, Math.trunc(Number(valeur) || 1)) } : { [champ]: valeur };
  await db.update(qcDefaut).set(patch).where(eq(qcDefaut.id, id));
}

export async function supprimerDefaut(id: number) {
  await db.delete(qcDefaut).where(eq(qcDefaut.id, id));
}

/* ── mesures ── */

export async function ajouterMesure(inspectionId: number) {
  const [row] = await db
    .insert(qcMesure)
    .values({ inspectionId, tolerance: 1 })
    .returning({ id: qcMesure.id });
  return row.id;
}

export async function majMesure(id: number, champ: "point" | "taille" | "spec" | "tolerance" | "mesure", valeur: string) {
  const numerique = champ === "spec" || champ === "tolerance" || champ === "mesure";
  const v = numerique
    ? valeur.trim() === ""
      ? null
      : Number(valeur.replace(",", "."))
    : valeur;
  if (numerique && v !== null && !Number.isFinite(v)) throw new Error("Valeur invalide");
  await db.update(qcMesure).set({ [champ]: v }).where(eq(qcMesure.id, id));
}

export async function supprimerMesure(id: number) {
  await db.delete(qcMesure).where(eq(qcMesure.id, id));
}

/** Charge les points d'un barème pour une taille, sans recréer les doublons. */
export async function chargerBareme(inspectionId: number, baremeId: number, taille: string) {
  const bareme = (await listBaremes()).find((b) => b.id === baremeId);
  if (!bareme) throw new Error("Barème introuvable");
  const existantes = await db.select().from(qcMesure).where(eq(qcMesure.inspectionId, inspectionId));
  const deja = new Set(existantes.map((m) => `${m.point}|${m.taille}`));

  const nouvelles = bareme.points
    .filter((p) => p.valeurs[taille] != null && !deja.has(`${p.label}|${taille}`))
    .map((p) => ({
      inspectionId, point: p.label, taille, spec: p.valeurs[taille], tolerance: p.tolerance, mesure: null,
    }));
  if (nouvelles.length) await db.insert(qcMesure).values(nouvelles);
  return nouvelles.length;
}

/* ── photos ── */

export async function attacherPhoto(inspectionId: number, hash: string, defautId: number | null) {
  await db.insert(qcPhoto).values({ inspectionId, hash, defautId });
}

export async function detacherPhoto(photoId: number) {
  await db.delete(qcPhoto).where(eq(qcPhoto.id, photoId));
}

/* ── clôture / réouverture / re-contrôle ── */

export async function cloturer(id: number, auteur: Auteur) {
  const insp = await getInspection(id);
  if (!insp) throw new Error("Inspection introuvable");
  if (!insp.commandeId && !insp.of) throw new Error("Liez d'abord un ordre de fabrication");
  if (!insp.lot) throw new Error("Renseignez la taille du lot");

  const verdict = insp.verdict;

  return db.transaction(async (tx) => {
    let qrqcId = insp.qrqcId;

    /* Connexion ERP : un lot refusé ouvre automatiquement un QRQC. C'est ce qui
     * fait que le refus déclenche une action corrective au lieu de rester une
     * ligne dans un tableau. */
    if (verdict === "refuse" && !qrqcId) {
      const [q] = await tx
        .insert(mQrqc)
        .values({
          date: todayISO(),
          pb: `Lot refusé au contrôle qualité ${qc.numeroQc(insp.numero)} — ${insp.of} · ${insp.modele}${insp.client ? ` (${insp.client})` : ""} : ${insp.proposition.raison}`,
          cause: "Méthode",
          cmd: insp.of,
          action: `Retour qualité ${insp.faconnier || ""} — retouches / remplacement et re-contrôle sous 48 h`.trim(),
          statutTone: "danger",
          statutLabel: "Ouvert",
        })
        .returning({ id: mQrqc.id });
      qrqcId = q.id;
    }

    await tx
      .update(qcInspection)
      .set({ statut: "cloture", verdictCloture: verdict, dateCloture: todayISO(), qrqcId, controleur: insp.controleur || auteur.name })
      .where(eq(qcInspection.id, id));

    return { verdict, qrqcId, qrqcCree: verdict === "refuse" && qrqcId !== insp.qrqcId };
  });
}

export async function rouvrir(id: number) {
  await db
    .update(qcInspection)
    .set({ statut: "brouillon", verdictCloture: "", dateCloture: null })
    .where(eq(qcInspection.id, id));
}

/** Nouvelle inspection reprenant l'identité et la grille de mesures, sans les
 * relevés ni les défauts — c'est un contrôle neuf sur le lot retouché. */
export async function creerRecontrole(id: number, auteur: Auteur) {
  const source = await getInspection(id);
  if (!source) throw new Error("Inspection introuvable");
  const numero = await prochainNumero();

  return db.transaction(async (tx) => {
    const [nouvelle] = await tx
      .insert(qcInspection)
      .values({
        numero, date: todayISO(), commandeId: source.commandeId, of: source.of, client: source.client,
        modele: source.modele, ref: source.ref, couleur: source.couleur, faconnier: source.faconnier,
        lot: source.lot, controleur: auteur.name, statut: "brouillon", recontroleDeId: source.id,
      })
      .returning({ id: qcInspection.id });

    if (source.mesures.length) {
      await tx.insert(qcMesure).values(
        source.mesures.map((m) => ({
          inspectionId: nouvelle.id, point: m.point, taille: m.taille,
          spec: m.spec, tolerance: m.tolerance, mesure: null,
        })),
      );
    }
    return nouvelle.id;
  });
}

/** Copie de travail : ni photos, ni verdict, ni chaînage. */
export async function dupliquer(id: number, auteur: Auteur) {
  const source = await getInspection(id);
  if (!source) throw new Error("Inspection introuvable");
  const numero = await prochainNumero();

  return db.transaction(async (tx) => {
    const [copie] = await tx
      .insert(qcInspection)
      .values({
        numero, date: todayISO(), commandeId: source.commandeId, of: source.of, client: source.client,
        modele: source.modele, ref: source.ref, couleur: source.couleur, faconnier: source.faconnier,
        lot: source.lot, controleur: auteur.name, statut: "brouillon",
      })
      .returning({ id: qcInspection.id });

    if (source.defauts.length) {
      await tx.insert(qcDefaut).values(
        source.defauts.map((d) => ({
          inspectionId: copie.id, famille: d.famille, description: d.description,
          gravite: d.gravite, nombre: d.nombre,
        })),
      );
    }
    if (source.mesures.length) {
      await tx.insert(qcMesure).values(
        source.mesures.map((m) => ({
          inspectionId: copie.id, point: m.point, taille: m.taille,
          spec: m.spec, tolerance: m.tolerance, mesure: m.mesure,
        })),
      );
    }
    return copie.id;
  });
}

/* ── barèmes ── */

export async function creerBareme(nom: string) {
  const [row] = await db
    .insert(qcBareme)
    .values({ nom, tailles: ["0", "1", "2", "3", "4"] })
    .returning({ id: qcBareme.id });
  return row.id;
}

export async function majBareme(id: number, patch: Partial<typeof qcBareme.$inferInsert>) {
  await db.update(qcBareme).set(patch).where(eq(qcBareme.id, id));
}

export async function supprimerBareme(id: number) {
  await db.delete(qcBareme).where(eq(qcBareme.id, id));
}

export async function ajouterPointBareme(baremeId: number, label: string) {
  const [r] = await db
    .select({ max: sql<number>`coalesce(max(${qcBaremePoint.ordre}), -1)::int` })
    .from(qcBaremePoint)
    .where(eq(qcBaremePoint.baremeId, baremeId));
  await db.insert(qcBaremePoint).values({ baremeId, ordre: (r?.max ?? -1) + 1, label, tolerance: 1 });
}

export async function majPointBareme(
  id: number,
  patch: { label?: string; tolerance?: number; valeurs?: Record<string, number> },
) {
  await db.update(qcBaremePoint).set(patch).where(eq(qcBaremePoint.id, id));
}

export async function supprimerPointBareme(id: number) {
  await db.delete(qcBaremePoint).where(eq(qcBaremePoint.id, id));
}
