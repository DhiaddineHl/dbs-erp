import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/* Index des fichiers partagés — photos de contrôle qualité, pièces jointes de
 * préparation, et tout ce qui viendra ensuite.
 *
 * Adressé par le hash SHA-256 du contenu, comme le fait déjà PilotPro avec son
 * index de blobs : la même photo envoyée deux fois n'occupe la place qu'une
 * fois, et l'URL de lecture peut être mise en cache indéfiniment puisqu'un
 * contenu donné a toujours le même identifiant.
 *
 * Les octets vivent dans le stockage objet (`lib/services/stockage.ts`), pas
 * ici : une photo n'a rien à faire dans un `pg_dump`, elle en double le volume
 * sans jamais être interrogée. Cette table garde ce qui se lit et se joint —
 * le hash, le type, la taille — donc la déduplication reste une recherche
 * indexée et `qc_photo` garde sa clé étrangère. La clé de l'objet se déduit du
 * hash, il n'y a donc rien à stocker pour la retrouver. */
export const fichier = pgTable("fichier", {
  /** SHA-256 hexadécimal du contenu, et clé de l'objet dans le bucket. */
  hash: text().primaryKey(),
  mime: text().notNull().default("application/octet-stream"),
  taille: integer().notNull().default(0),
  createdAt: timestamp().notNull().defaultNow(),
});
