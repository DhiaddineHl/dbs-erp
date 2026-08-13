import { customType, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

/* Stockage de fichiers partagé — photos de contrôle qualité, pièces jointes de
 * préparation, et tout ce qui viendra ensuite.
 *
 * Adressé par le hash SHA-256 du contenu, comme le fait déjà PilotPro avec son
 * index de blobs : la même photo envoyée deux fois n'occupe la place qu'une
 * fois, et l'URL de lecture peut être mise en cache indéfiniment puisqu'un
 * contenu donné a toujours le même identifiant.
 *
 * Les octets vivent en base plutôt que dans un stockage objet : le volume est
 * modeste (quelques dizaines de Mo), la sauvegarde reste un simple pg_dump, et
 * l'installation ne réclame aucune infrastructure supplémentaire. Basculer plus
 * tard vers un stockage externe ne demandera que de déplacer les octets et de
 * changer le lecteur — les tables de liaison ne bougeront pas. */
export const fichier = pgTable("fichier", {
  /** SHA-256 hexadécimal du contenu. */
  hash: text().primaryKey(),
  mime: text().notNull().default("application/octet-stream"),
  taille: integer().notNull().default(0),
  data: bytea().notNull(),
  createdAt: timestamp().notNull().defaultNow(),
});
