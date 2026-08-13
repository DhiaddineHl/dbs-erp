import "server-only";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { fichier } from "@/lib/db/schema";

/** Taille maximale acceptée. Les photos sont compressées côté navigateur avant
 * l'envoi ; cette borne protège seulement contre l'envoi direct d'un original. */
export const TAILLE_MAX = 4 * 1024 * 1024;

const MIMES_AUTORISES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

export type FichierEnregistre = { hash: string; mime: string; taille: number; deja: boolean };

/** Enregistre un fichier et renvoie son hash. Un contenu déjà présent n'est pas
 * réécrit : deux inspections qui portent la même photo la partagent. */
export async function enregistrerFichier(data: Buffer, mime: string): Promise<FichierEnregistre> {
  if (!data.length) throw new Error("Fichier vide");
  if (data.length > TAILLE_MAX) throw new Error("Fichier trop volumineux (4 Mo maximum)");
  if (!MIMES_AUTORISES.has(mime)) throw new Error("Format non accepté (JPEG, PNG, WebP ou PDF)");

  const hash = createHash("sha256").update(data).digest("hex");
  const [existant] = await db.select({ hash: fichier.hash }).from(fichier).where(eq(fichier.hash, hash));
  if (existant) return { hash, mime, taille: data.length, deja: true };

  await db.insert(fichier).values({ hash, mime, taille: data.length, data }).onConflictDoNothing();
  return { hash, mime, taille: data.length, deja: false };
}

export async function lireFichier(hash: string) {
  const [row] = await db.select().from(fichier).where(eq(fichier.hash, hash));
  return row ?? null;
}
