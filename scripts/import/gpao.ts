import { eq } from "drizzle-orm";
import { db, schema } from "./db";
import { Rapport, type Sauvegarde, dateOuNull, entier } from "./source";
import { rapprocherParNom } from "@/lib/domain/atelier";

const { chaine, journee, modele, ouvriere, personnel } = schema;

/* Production GPAO : chaînes, modèles, journées de saisie horaire.
 *
 * Les identifiants de la sauvegarde sont des horodatages (1784102491737) ;
 * les nouvelles tables sont en `serial`. Les journées citent leurs chaînes et
 * modèles par ces horodatages, et leurs matrices `ops` sont indexées par
 * identifiant d'ouvrière : tout doit être retraduit, y compris les clés des
 * objets JSON. */

type OuvriereSrc = { id: number; nom: string; poste?: string; sam?: number };

/** Réindexe un objet { ancienId: valeur } avec les nouveaux identifiants. */
function reindexer<T>(source: unknown, correspondance: Map<number, number>): Record<number, T> {
  const out: Record<number, T> = {};
  if (!source || typeof source !== "object") return out;
  for (const [cle, valeur] of Object.entries(source as Record<string, T>)) {
    const nouveau = correspondance.get(Number(cle));
    if (nouveau !== undefined) out[nouveau] = valeur;
  }
  return out;
}

export async function importerGpao(src: Sauvegarde, r: Rapport) {
  r.etape("Production GPAO");

  const chaines = src.gpao.chaines ?? [];
  const modeles = src.gpao.modeles ?? [];
  const journees = src.gpao.journees ?? [];

  /* ── chaînes et ouvrières ── */
  const idChaine = new Map<number, number>();
  const idOuvriere = new Map<number, number>();
  let nbOuvrieres = 0;

  for (const c of chaines) {
    const nom = r.texte(c.nom);
    if (!nom) continue;
    const [existante] = await db.select({ id: chaine.id }).from(chaine).where(eq(chaine.nom, nom));
    let id: number;
    if (existante) {
      await db.update(chaine).set({ chef: r.texte(c.chef) }).where(eq(chaine.id, existante.id));
      id = existante.id;
    } else {
      const [ligne] = await db.insert(chaine).values({ nom, chef: r.texte(c.chef) }).returning({ id: chaine.id });
      id = ligne.id;
    }
    idChaine.set(c.id, id);

    for (const o of (c.ouvrieres ?? []) as OuvriereSrc[]) {
      const nomOuv = r.texte(o.nom);
      if (!nomOuv) continue;
      const [ligne] = await db
        .insert(ouvriere)
        .values({ chaineId: id, nom: nomOuv, poste: r.texte(o.poste), sam: entier(o.sam, 100) })
        .returning({ id: ouvriere.id });
      idOuvriere.set(o.id, ligne.id);
      nbOuvrieres++;
    }
  }
  r.ok("chaînes", idChaine.size, `${nbOuvrieres} ouvrière(s) déclarée(s) sur les chaînes`);

  /* ── modèles ── */
  const idModele = new Map<number, number>();
  for (const m of modeles) {
    const nom = r.texte(m.nom);
    if (!nom) continue;
    const [ligne] = await db
      .insert(modele)
      .values({
        nom,
        ref: r.texte(m.ref),
        client: r.texte(m.client),
        sam: entier(m.sam, 1800),
        qte: entier(m.qte),
      })
      .returning({ id: modele.id });
    idModele.set(m.id, ligne.id);
  }
  r.ok("modèles", idModele.size);

  /* ── journées ──
   * Les ouvrières d'une journée peuvent être propres à celle-ci (l'équipe
   * change) : la sauvegarde les recopie dans `journee.ouvrieres`. Celles qui
   * n'existent pas sur la chaîne sont créées, sinon leurs saisies horaires
   * n'auraient plus de titulaire. */
  let nbJournees = 0;
  let ignorees = 0;
  let ouvrieresAjoutees = 0;

  /* 83 des 128 journées citent une chaîne qui n'existe plus : elle a été
   * supprimée de l'atelier, ses journées sont restées. Les jeter perdrait les
   * deux tiers de l'historique de production — et avec lui les rendements des
   * ouvrières. On recrée une chaîne d'accueil, nommée pour ce qu'elle est. */
  const chainesRecreees = new Set<string>();
  const assurerChaine = async (idSource: number): Promise<number | null> => {
    const connue = idChaine.get(idSource);
    if (connue) return connue;
    if (!Number.isFinite(idSource) || idSource <= 0) return null;
    const nom = `Chaîne archivée #${idSource}`;
    const [existante] = await db.select({ id: chaine.id }).from(chaine).where(eq(chaine.nom, nom));
    const id =
      existante?.id ??
      (await db.insert(chaine).values({ nom, chef: "" }).returning({ id: chaine.id }))[0].id;
    idChaine.set(idSource, id);
    chainesRecreees.add(nom);
    return id;
  };

  for (const j of journees) {
    const brut = j as Record<string, unknown>;
    const chaineId = await assurerChaine(Number(brut.chaineId));
    const modeleId = idModele.get(Number(brut.modeleId));
    const date = dateOuNull(brut.date);

    if (!chaineId || !modeleId || !date) {
      ignorees++;
      continue;
    }

    for (const o of (brut.ouvrieres ?? []) as OuvriereSrc[]) {
      if (idOuvriere.has(o.id)) continue;
      const nomOuv = r.texte(o.nom);
      if (!nomOuv) continue;
      const [ligne] = await db
        .insert(ouvriere)
        .values({ chaineId, nom: nomOuv, poste: r.texte(o.poste), sam: entier(o.sam, 100) })
        .returning({ id: ouvriere.id });
      idOuvriere.set(o.id, ligne.id);
      ouvrieresAjoutees++;
    }

    await db.insert(journee).values({
      date,
      chaineId,
      modeleId,
      effectif: entier(brut.effectif),
      nbHeures: entier(brut.nbHeures, 8) || 8,
      cloture: Boolean(brut.cloture),
      objManuel: brut.objManuel == null ? null : entier(brut.objManuel),
      cols: Array.isArray(brut.cols) ? (brut.cols as string[]) : [],
      sortie: (brut.sortie ?? {}) as Record<string, number>,
      ops: reindexer(brut.ops, idOuvriere),
      ret: reindexer(brut.ret, idOuvriere),
      opsSam: reindexer(brut.opsSam, idOuvriere),
      opsPoste: reindexer(brut.opsPoste, idOuvriere),
      opsDetail: reindexer(brut.opsDetail, idOuvriere),
    });
    nbJournees++;
  }

  r.ok("journées de production", nbJournees);
  if (ouvrieresAjoutees) r.info(`${ouvrieresAjoutees} ouvrière(s) créée(s) depuis les équipes du jour`);
  if (chainesRecreees.size) {
    r.alerte(
      `${chainesRecreees.size} chaîne(s) supprimée(s) de l'atelier mais encore citées par des journées — recréées : ` +
        [...chainesRecreees].join(", "),
    );
  }
  if (ignorees) r.alerte(`${ignorees} journée(s) ignorée(s) — modèle ou date introuvable`);

  await rattacherAuRegistre(r);
}

/** Relie les ouvrières nouvellement créées au registre du personnel : sans ce
 * lien, aucun QR de rendement n'est possible pour elles. */
async function rattacherAuRegistre(r: Rapport) {
  const [ouvrieres, personnes] = await Promise.all([
    db.select({ id: ouvriere.id, nom: ouvriere.nom, personnelId: ouvriere.personnelId }).from(ouvriere),
    db.select({ id: personnel.id, nom: personnel.nom }).from(personnel),
  ]);

  const liens = rapprocherParNom(ouvrieres, personnes).filter((l) => l.personnelId !== null);
  for (const l of liens) {
    await db.update(ouvriere).set({ personnelId: l.personnelId }).where(eq(ouvriere.id, l.ouvriereId));
  }
  const restants = ouvrieres.filter((o) => o.personnelId === null).length - liens.length;
  r.ok("ouvrières rattachées au registre", liens.length);

  /* L'ancienne application recréait une fiche ouvrière à chaque réaffectation :
   * une même personne y apparaît sous plusieurs identifiants. Le portail de
   * rendement les regroupe par matricule, mais l'écran de rattachement, lui,
   * les montre toutes. */
  const distinctes = new Set(liens.map((l) => l.personnelId)).size;
  if (liens.length > distinctes) {
    r.info(
      `ces ${liens.length} fiches ouvrières correspondent à ${distinctes} personne(s) — ` +
        `l'ancien système en recréait une à chaque changement de chaîne`,
    );
  }
  if (restants > 0) {
    r.alerte(`${restants} ouvrière(s) sans matricule — à relier à la main dans Personnel, sinon pas de QR`);
  }
}
