import "server-only";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { fichier } from "@/lib/db/schema";
import { deposer, recuperer, supprimer } from "@/lib/services/stockage";

/** Taille maximale acceptée. Les photos sont compressées côté navigateur avant
 * l'envoi ; cette borne protège seulement contre l'envoi direct d'un original. */
export const TAILLE_MAX = 4 * 1024 * 1024;

const MIMES_AUTORISES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

export type FichierEnregistre = { hash: string; mime: string; taille: number; deja: boolean };

/** Enregistre un fichier et renvoie son hash. Un contenu déjà présent n'est pas
 * réécrit : deux inspections qui portent la même photo la partagent.
 *
 * Les octets partent vers le stockage objet, la ligne en base n'en garde que la
 * description. L'ordre compte : l'objet d'abord, la ligne ensuite. Un dépôt
 * suivi d'un échec en base laisse un objet que personne ne cite — inerte, et
 * réutilisé tel quel au prochain envoi du même contenu. L'inverse laisserait
 * une ligne qui promet des octets absents, donc une vignette morte. */
export async function enregistrerFichier(data: Buffer, mime: string): Promise<FichierEnregistre> {
  if (!data.length) throw new Error("Fichier vide");
  if (data.length > TAILLE_MAX) throw new Error("Fichier trop volumineux (4 Mo maximum)");
  if (!MIMES_AUTORISES.has(mime)) throw new Error("Format non accepté (JPEG, PNG, WebP ou PDF)");

  const hash = createHash("sha256").update(data).digest("hex");
  const [existant] = await db.select({ hash: fichier.hash }).from(fichier).where(eq(fichier.hash, hash));
  if (existant) return { hash, mime, taille: data.length, deja: true };

  await deposer(hash, data, mime);
  await db.insert(fichier).values({ hash, mime, taille: data.length }).onConflictDoNothing();
  return { hash, mime, taille: data.length, deja: false };
}

/** Description d'un fichier, sans ses octets. */
export async function decrireFichier(hash: string) {
  const [row] = await db.select().from(fichier).where(eq(fichier.hash, hash));
  return row ?? null;
}

/** Description et flux d'octets. `null` si le fichier est inconnu ; le flux est
 * `null` si la ligne existe mais que l'objet a disparu du bucket — cas anormal
 * que l'appelant doit traiter comme un 404, pas comme une réponse vide. */
export async function lireFichier(hash: string) {
  const row = await decrireFichier(hash);
  if (!row) return null;
  const corps = await recuperer(hash);
  return { ...row, corps };
}

/** Retire un fichier du bucket et de l'index. Les liaisons (`qc_photo`) doivent
 * avoir été retirées avant : la clé étrangère refuserait sinon. */
export async function effacerFichier(hash: string): Promise<void> {
  await db.delete(fichier).where(eq(fichier.hash, hash));
  await supprimer(hash);
}
