import "server-only";
import { asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  chaine,
  client,
  commande,
  faconnier,
  mQrqc,
  qcActionCorrective,
  qcBareme,
  qcBaremePoint,
  qcChecklist,
  qcChecklistPoint,
  qcChecklistReponse,
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
  emplacement: string;
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

export type ActionRow = {
  id: number;
  defautId: number | null;
  defaut: string;
  cause: string;
  action: string;
  responsable: string;
  echeance: string;
  statut: string;
  photoAvant: string | null;
  photoApres: string | null;
};

export type ChecklistReponseRow = {
  id: number;
  ordre: number;
  label: string;
  statut: string;
  note: string;
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
  saison: string;
  faconnier: string;
  typeControle: string;
  qteCommande: number;
  qteProduite: number;
  qteControlee: number;
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
  actions: ActionRow[];
  checklist: ChecklistReponseRow[];
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

/* ─────────── checklists (modèles) ─────────── */

export type ChecklistRow = {
  id: number;
  nom: string;
  typeProduit: string;
  typeControle: string;
  points: { id: number; ordre: number; label: string }[];
};

export async function listChecklists(): Promise<ChecklistRow[]> {
  const [modeles, points] = await Promise.all([
    db.select().from(qcChecklist).orderBy(asc(qcChecklist.nom)),
    db.select().from(qcChecklistPoint).orderBy(asc(qcChecklistPoint.ordre), asc(qcChecklistPoint.id)),
  ]);
  const parModele = new Map<number, typeof points>();
  for (const p of points) {
    const g = parModele.get(p.checklistId);
    if (g) g.push(p);
    else parModele.set(p.checklistId, [p]);
  }
  return modeles.map((m) => ({
    id: m.id,
    nom: m.nom,
    typeProduit: m.typeProduit,
    typeControle: m.typeControle,
    points: (parModele.get(m.id) ?? []).map((p) => ({ id: p.id, ordre: p.ordre, label: p.label })),
  }));
}

export async function creerChecklist(nom: string) {
  const [row] = await db.insert(qcChecklist).values({ nom }).returning({ id: qcChecklist.id });
  return row.id;
}

export async function majChecklist(id: number, patch: Partial<{ nom: string; typeProduit: string; typeControle: string }>) {
  await db.update(qcChecklist).set(patch).where(eq(qcChecklist.id, id));
}

export async function supprimerChecklist(id: number) {
  await db.delete(qcChecklist).where(eq(qcChecklist.id, id));
}

export async function ajouterPointChecklist(checklistId: number, label: string) {
  const [max] = await db
    .select({ m: sql<number>`coalesce(max(${qcChecklistPoint.ordre}), 0)::int` })
    .from(qcChecklistPoint)
    .where(eq(qcChecklistPoint.checklistId, checklistId));
  await db.insert(qcChecklistPoint).values({ checklistId, label, ordre: (max?.m ?? 0) + 1 });
}

export async function majPointChecklist(id: number, label: string) {
  await db.update(qcChecklistPoint).set({ label }).where(eq(qcChecklistPoint.id, id));
}

export async function supprimerPointChecklist(id: number) {
  await db.delete(qcChecklistPoint).where(eq(qcChecklistPoint.id, id));
}

/** Applique un modèle de checklist à une inspection : copie ses points en
 * réponses, sans recréer ceux déjà présents (même label). Comme chargerBareme,
 * l'inspection devient autonome. */
export async function appliquerChecklist(inspectionId: number, checklistId: number) {
  const modele = (await listChecklists()).find((c) => c.id === checklistId);
  if (!modele) throw new Error("Checklist introuvable");
  const existantes = await db
    .select()
    .from(qcChecklistReponse)
    .where(eq(qcChecklistReponse.inspectionId, inspectionId));
  const deja = new Set(existantes.map((r) => r.label));
  const nouvelles = modele.points
    .filter((p) => !deja.has(p.label))
    .map((p) => ({ inspectionId, ordre: p.ordre, label: p.label }));
  if (nouvelles.length) await db.insert(qcChecklistReponse).values(nouvelles);
  return nouvelles.length;
}

export async function ajouterPointReponse(inspectionId: number, label: string) {
  const [max] = await db
    .select({ m: sql<number>`coalesce(max(${qcChecklistReponse.ordre}), 0)::int` })
    .from(qcChecklistReponse)
    .where(eq(qcChecklistReponse.inspectionId, inspectionId));
  await db.insert(qcChecklistReponse).values({ inspectionId, label: label || "Nouveau point", ordre: (max?.m ?? 0) + 1 });
}

export async function majReponseChecklist(id: number, champ: "statut" | "note" | "label", valeur: string) {
  await db.update(qcChecklistReponse).set({ [champ]: valeur }).where(eq(qcChecklistReponse.id, id));
}

export async function supprimerReponseChecklist(id: number) {
  await db.delete(qcChecklistReponse).where(eq(qcChecklistReponse.id, id));
}

export async function listInspections(): Promise<InspectionRow[]> {
  const inspections = await db.select().from(qcInspection).orderBy(desc(qcInspection.numero));
  if (!inspections.length) return [];
  const ids = inspections.map((i) => i.id);

  const [defauts, mesures, photos, actions, checklist, baremes] = await Promise.all([
    db.select().from(qcDefaut).where(inArray(qcDefaut.inspectionId, ids)).orderBy(asc(qcDefaut.id)),
    db.select().from(qcMesure).where(inArray(qcMesure.inspectionId, ids)).orderBy(asc(qcMesure.id)),
    db.select().from(qcPhoto).where(inArray(qcPhoto.inspectionId, ids)).orderBy(asc(qcPhoto.id)),
    db
      .select()
      .from(qcActionCorrective)
      .where(inArray(qcActionCorrective.inspectionId, ids))
      .orderBy(asc(qcActionCorrective.id)),
    db
      .select()
      .from(qcChecklistReponse)
      .where(inArray(qcChecklistReponse.inspectionId, ids))
      .orderBy(asc(qcChecklistReponse.ordre), asc(qcChecklistReponse.id)),
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
  const parAction = group(actions);
  const parChecklist = group(checklist);
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
      id: d.id, famille: d.famille, description: d.description, gravite: d.gravite,
      emplacement: d.emplacement, nombre: d.nombre,
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
      saison: i.saison,
      faconnier: i.faconnier,
      typeControle: i.typeControle,
      qteCommande: i.qteCommande,
      qteProduite: i.qteProduite,
      qteControlee: i.qteControlee,
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
      actions: (parAction.get(i.id) ?? []).map((a) => ({
        id: a.id,
        defautId: a.defautId,
        defaut: a.defaut,
        cause: a.cause,
        action: a.action,
        responsable: a.responsable,
        echeance: iso(a.echeance),
        statut: a.statut,
        photoAvant: a.photoAvant,
        photoApres: a.photoApres,
      })),
      checklist: (parChecklist.get(i.id) ?? []).map((c) => ({
        id: c.id,
        ordre: c.ordre,
        label: c.label,
        statut: c.statut,
        note: c.note,
      })),
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
      couleur: commande.couleur, saison: commande.saison, qte: commande.qte, produit: commande.produit,
      clientNom: client.nom, faconnierNom: faconnier.nom, chaineNom: chaine.nom,
    })
    .from(commande)
    .where(isNull(commande.parentId))
    .leftJoin(client, eq(commande.clientId, client.id))
    .leftJoin(faconnier, eq(commande.faconnierId, faconnier.id))
    .leftJoin(chaine, eq(commande.chaineId, chaine.id))
    .orderBy(desc(commande.id));
  return rows.map((r) => ({
    id: r.id, of: r.of, modele: r.modele, ref: r.ref, couleur: r.couleur, saison: r.saison,
    qte: r.qte, produit: r.produit,
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
      couleur: c.couleur, saison: c.saison, faconnier: c.faconnier,
      // La taille du lot et les quantités ne sont proposées que si le contrôleur
      // ne les a pas déjà saisies — on ne réécrit jamais par-dessus son travail.
      lot: insp?.lot ? insp.lot : c.qte,
      qteCommande: insp?.qteCommande ? insp.qteCommande : c.qte,
      qteProduite: insp?.qteProduite ? insp.qteProduite : c.produit,
    })
    .where(eq(qcInspection.id, inspectionId));
}

/** Champs de l'inspection modifiables directement depuis l'éditeur. */
export type ChampInspection =
  | "date" | "controleur" | "lot" | "note" | "verdictForce"
  | "of" | "client" | "modele" | "ref" | "couleur" | "saison" | "faconnier"
  | "typeControle" | "qteCommande" | "qteProduite" | "qteControlee";

const CHAMPS_ENTIERS = new Set(["lot", "qteCommande", "qteProduite", "qteControlee"]);

export async function majInspection(id: number, champ: ChampInspection, valeur: string) {
  const patch: Record<string, unknown> = CHAMPS_ENTIERS.has(champ)
    ? { [champ]: Math.max(0, Math.trunc(Number(valeur) || 0)) }
    : { [champ]: valeur };
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

export async function majDefaut(id: number, champ: "description" | "gravite" | "nombre" | "emplacement", valeur: string) {
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

/* ── actions correctives ──
 *
 * Volontairement NON bloquées par la clôture : une action corrective se suit
 * après le contrôle (on renseigne la cause, on affecte, on prend les photos
 * avant/après une fois la retouche faite). Elle peut naître d'un défaut précis
 * ou être saisie librement. */

export async function ajouterAction(inspectionId: number, defautId: number | null) {
  let defautTexte = "";
  if (defautId != null) {
    const [d] = await db.select().from(qcDefaut).where(eq(qcDefaut.id, defautId));
    if (d) defautTexte = [d.famille, d.emplacement, d.description].filter(Boolean).join(" · ");
  }
  const [row] = await db
    .insert(qcActionCorrective)
    .values({ inspectionId, defautId, defaut: defautTexte })
    .returning({ id: qcActionCorrective.id });
  return row.id;
}

export type ChampAction = "defaut" | "cause" | "action" | "responsable" | "echeance" | "statut";

export async function majAction(id: number, champ: ChampAction, valeur: string) {
  const patch: Record<string, unknown> = champ === "echeance" ? { echeance: valeur || null } : { [champ]: valeur };
  await db.update(qcActionCorrective).set(patch).where(eq(qcActionCorrective.id, id));
}

/** Rattache une photo avant/après à une action (hash déjà stocké dans fichier). */
export async function photoAction(id: number, quand: "avant" | "apres", hash: string | null) {
  await db
    .update(qcActionCorrective)
    .set(quand === "avant" ? { photoAvant: hash } : { photoApres: hash })
    .where(eq(qcActionCorrective.id, id));
}

export async function supprimerAction(id: number) {
  await db.delete(qcActionCorrective).where(eq(qcActionCorrective.id, id));
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
