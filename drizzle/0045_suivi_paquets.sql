/* SUIVI PAR PAQUETS — relevé de recoupement, à côté de la saisie horaire.
 *
 * `journee.paquets` note, par ouvrière et par heure, les NUMÉROS de paquets
 * travaillés. C'est facultatif : une journée qui n'en porte aucun se
 * comporte exactement comme avant, et aucune journée existante n'est
 * touchée (la colonne naît à « {} »).
 *
 * `modele.taille_paquet` donne les pièces par paquet du modèle (0 = reprendre
 * le réglage de l'usine). Rien n'est imposé : un paquet peut contenir 17
 * pièces comme 25.
 *
 * Ces deux colonnes n'entrent dans AUCUN calcul de production : `produit`,
 * `coupe_qte` et `magasin_qte` gardent leurs sources d'aujourd'hui. Le
 * suivi des paquets observe et signale ; il ne compte pas. */
ALTER TABLE "journee" ADD COLUMN "paquets" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "modele" ADD COLUMN "taille_paquet" integer DEFAULT 0 NOT NULL;
