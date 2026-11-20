import "server-only";
import { and, eq, inArray, isNotNull, lt, notInArray, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { commande, commandeDocument, fichier, message, qcActionCorrective, qcInspection, qcPhoto } from "@/lib/db/schema";
import { effacerFichier } from "@/lib/services/fichiers";
import { journaliser } from "@/lib/services/activite";

/* MÉNAGE DES FICHIERS DES COMMANDES ARCHIVÉES — pour que l'ERP reste léger.
 *
 * Une commande archivée n'a plus besoin de ses photos ni de ses fiches
 * techniques. À l'archivage, on retire :
 *   · la photo du modèle ;
 *   · les photos du contrôle qualité (inspections, défauts, actions
 *     correctives avant / après) ;
 *   · les fiches du modèle déposées en direction technique (la ligne reste,
 *     marquée « retirée — archivage », pour l'historique).
 * Puis on efface VRAIMENT les fichiers du stockage — mais seulement ceux que
 * plus rien n'utilise : un fichier est rangé par son contenu, et la même
 * photo peut servir ailleurs (une autre commande en cours, la messagerie).
 *
 * Les chiffres (quantités, contrôles, mesures, défauts) restent : seuls les
 * fichiers partent. Tout est écrit au journal d'activité. */

export type BilanMenage = { commandes: number; photos: number; fiches: number; fichiersEffaces: number; octets: number };

export async function libererEspaceArchives(): Promise<BilanMenage> {
  const toutes = await db
    .select({ id: commande.id, parentId: commande.parentId, archived: commande.archived, photo: commande.photoHash, of: commande.ofNumber })
    .from(commande);
  const archivees = new Set(toutes.filter((c) => c.archived).map((c) => c.id));
  // Une fiche vaut pour tout le groupe : on ne la retire que si TOUT le groupe est archivé.
  const teteDe = (c: (typeof toutes)[number]) => c.parentId ?? c.id;
  const groupeArchive = new Map<number, boolean>();
  for (const c of toutes) groupeArchive.set(teteDe(c), (groupeArchive.get(teteDe(c)) ?? true) && c.archived);
  const pourFiches = toutes.filter((c) => c.archived && groupeArchive.get(teteDe(c))).map((c) => c.id);
  const ids = archivees.size ? [...archivees] : [-1];

  const [photosModele, inspections, actions, fiches] = await Promise.all([
    Promise.resolve(toutes.filter((c) => c.archived && c.photo)),
    db.select({ id: qcInspection.id }).from(qcInspection).where(inArray(qcInspection.commandeId, ids)),
    db
      .select({ id: qcActionCorrective.id, avant: qcActionCorrective.photoAvant, apres: qcActionCorrective.photoApres })
      .from(qcActionCorrective)
      .where(and(inArray(qcActionCorrective.commandeId, ids), or(isNotNull(qcActionCorrective.photoAvant), isNotNull(qcActionCorrective.photoApres)))),
    pourFiches.length
      ? db
          .select({ id: commandeDocument.id, hash: commandeDocument.fichierHash, commandeId: commandeDocument.commandeId, actif: commandeDocument.actif })
          .from(commandeDocument)
          .where(inArray(commandeDocument.commandeId, pourFiches))
      : Promise.resolve([]),
  ]);
  const photosQc = inspections.length
    ? await db
        .select({ id: qcPhoto.id, hash: qcPhoto.hash })
        .from(qcPhoto)
        .where(
          inArray(
            qcPhoto.inspectionId,
            inspections.map((i) => i.id),
          ),
        )
    : [];

  const candidats = new Set<string>([
    ...photosModele.map((c) => c.photo!),
    ...photosQc.map((p) => p.hash),
    ...actions.flatMap((a) => [a.avant, a.apres].filter((h): h is string => !!h)),
    ...fiches.map((f) => f.hash),
  ]);

  // 1. On détache les fichiers des commandes archivées.
  if (photosModele.length)
    await db
      .update(commande)
      .set({ photoHash: null })
      .where(
        inArray(
          commande.id,
          photosModele.map((c) => c.id),
        ),
      );
  if (photosQc.length)
    await db.delete(qcPhoto).where(
      inArray(
        qcPhoto.id,
        photosQc.map((p) => p.id),
      ),
    );
  if (actions.length)
    await db
      .update(qcActionCorrective)
      .set({ photoAvant: null, photoApres: null })
      .where(
        inArray(
          qcActionCorrective.id,
          actions.map((a) => a.id),
        ),
      );
  const fichesActives = fiches.filter((f) => f.actif);
  if (fichesActives.length)
    await db
      .update(commandeDocument)
      .set({ actif: false, retirePar: "Archivage automatique (fichier supprimé)", retireLe: new Date() })
      .where(
        inArray(
          commandeDocument.id,
          fichesActives.map((f) => f.id),
        ),
      );

  // 2. On efface du stockage ce que plus rien n'utilise — plus les fichiers
  //    restés orphelins (photos détachées des commandes livrées, etc.).
  const { effaces, octets } = await effacerSiPlusUtilises([...candidats, ...(await orphelins())]);
  const bilan: BilanMenage = {
    commandes: archivees.size,
    photos: photosModele.length + photosQc.length + actions.reduce((s, a) => s + (a.avant ? 1 : 0) + (a.apres ? 1 : 0), 0),
    fiches: fichesActives.length,
    fichiersEffaces: effaces,
    octets,
  };
  if (!bilan.photos && !bilan.fiches && !effaces) return bilan;
  await journaliser(
    "suppression",
    "Ménage des archives",
    `${bilan.photos} photo(s) et ${bilan.fiches} fiche(s) retirées des commandes archivées · ${effaces} fichier(s) effacé(s) · ${(octets / 1024 / 1024).toFixed(1).replace(".", ",")} Mo libérés`,
  );
  return bilan;
}

/** Fichiers que plus rien n'utilise : ni photo de modèle, ni contrôle
 * qualité, ni message, ni fiche du modèle (même retirée à la main — elle
 * reste consultable dans l'historique tant que la commande n'est pas
 * archivée). Déposés depuis plus de 2 jours : un fichier qui vient d'arriver
 * peut attendre d'être rattaché. */
async function orphelins(): Promise<string[]> {
  const avant = new Date(Date.now() - 2 * 86_400_000);
  const rows = await db
    .select({ h: fichier.hash })
    .from(fichier)
    .where(
      and(
        lt(fichier.createdAt, avant),
        sql`not exists (select 1 from ${qcPhoto} where ${qcPhoto.hash} = ${fichier.hash})`,
        sql`not exists (select 1 from ${qcActionCorrective} where ${qcActionCorrective.photoAvant} = ${fichier.hash} or ${qcActionCorrective.photoApres} = ${fichier.hash})`,
        sql`not exists (select 1 from ${message} where ${message.fichierHash} = ${fichier.hash})`,
        sql`not exists (select 1 from ${commande} where ${commande.photoHash} = ${fichier.hash})`,
        sql`not exists (select 1 from ${commandeDocument} where ${commandeDocument.fichierHash} = ${fichier.hash})`,
      ),
    );
  return rows.map((r) => r.h);
}

/** Efface du stockage chaque fichier de la liste que plus rien n'utilise.
 * Une fiche du modèle « utilise » encore son fichier si elle appartient à une
 * commande non archivée (même retirée), ou si elle est active. */
export async function effacerSiPlusUtilises(hashes: string[]): Promise<{ effaces: number; octets: number }> {
  const liste = [...new Set(hashes)];
  if (!liste.length) return { effaces: 0, octets: 0 };
  const archivees = db.select({ id: commande.id }).from(commande).where(eq(commande.archived, true));
  const [encorePhotoQc, encoreAction, encoreMessage, encoreModele, encoreFiche, tailles] = await Promise.all([
    db.select({ h: qcPhoto.hash }).from(qcPhoto).where(inArray(qcPhoto.hash, liste)),
    db
      .select({ a: qcActionCorrective.photoAvant, b: qcActionCorrective.photoApres })
      .from(qcActionCorrective)
      .where(or(inArray(qcActionCorrective.photoAvant, liste), inArray(qcActionCorrective.photoApres, liste))),
    db.select({ h: message.fichierHash }).from(message).where(inArray(message.fichierHash, liste)),
    db.select({ h: commande.photoHash }).from(commande).where(inArray(commande.photoHash, liste)),
    db
      .select({ h: commandeDocument.fichierHash })
      .from(commandeDocument)
      .where(and(inArray(commandeDocument.fichierHash, liste), or(eq(commandeDocument.actif, true), notInArray(commandeDocument.commandeId, archivees)))),
    db.select({ h: fichier.hash, taille: fichier.taille }).from(fichier).where(inArray(fichier.hash, liste)),
  ]);
  const utilises = new Set<string>(
    [
      ...encorePhotoQc.map((x) => x.h),
      ...encoreAction.flatMap((x) => [x.a, x.b]),
      ...encoreMessage.map((x) => x.h),
      ...encoreModele.map((x) => x.h),
      ...encoreFiche.map((x) => x.h),
    ].filter((h): h is string => !!h),
  );
  const taille = new Map(tailles.map((t) => [t.h, t.taille]));
  let effaces = 0;
  let octets = 0;
  for (const h of liste) {
    if (utilises.has(h) || !taille.has(h)) continue;
    try {
      await effacerFichier(h);
      effaces++;
      octets += taille.get(h) ?? 0;
    } catch {
      /* stockage injoignable : on réessaiera au prochain archivage */
    }
  }
  return { effaces, octets };
}
