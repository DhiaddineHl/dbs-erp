-- Lots de tissu ARCHIVÉS (rangés hors des listes de travail, jamais effacés)
-- et bon de sortie établi APRÈS COUP pour des rouleaux déjà sortis.
-- Aucune donnée existante modifiée.
ALTER TABLE "tissu_lot" ADD COLUMN "archive" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tissu_lot" ADD COLUMN "archive_le" timestamp;--> statement-breakpoint
ALTER TABLE "tissu_lot" ADD COLUMN "archive_par" text DEFAULT '' NOT NULL;--> statement-breakpoint
-- Historique immuable (0039), assoupli sur UN seul point : le n° de bon d'une
-- sortie peut passer de « aucun » ('') à un BST-… — c'est ce qui permet de
-- regrouper sur un bon des rouleaux sortis un par un. Un bon déjà inscrit ne
-- change jamais, et rien d'autre ne bouge.
CREATE OR REPLACE FUNCTION "tissu_mouvement_immuable"() RETURNS trigger AS $$
BEGIN
  IF (NEW."lot_id", NEW."sens", NEW."quantite", NEW."commande_label", NEW."motif", NEW."rouleau_id",
      NEW."destination", NEW."valeur_avant", NEW."valeur_apres", NEW."created_by", NEW."created_at",
      NEW."faconnier_nom")
     IS DISTINCT FROM
     (OLD."lot_id", OLD."sens", OLD."quantite", OLD."commande_label", OLD."motif", OLD."rouleau_id",
      OLD."destination", OLD."valeur_avant", OLD."valeur_apres", OLD."created_by", OLD."created_at",
      OLD."faconnier_nom")
     OR (NEW."bon" IS DISTINCT FROM OLD."bon" AND (OLD."bon" <> '' OR NEW."sens" <> 'sortie'))
     OR (NEW."commande_id" IS DISTINCT FROM OLD."commande_id" AND NEW."commande_id" IS NOT NULL)
     OR (NEW."annule_id" IS DISTINCT FROM OLD."annule_id" AND NEW."annule_id" IS NOT NULL)
     OR (NEW."faconnier_id" IS DISTINCT FROM OLD."faconnier_id" AND NEW."faconnier_id" IS NOT NULL) THEN
    RAISE EXCEPTION 'Historique tissu : un mouvement ne se modifie pas — passez une correction ou une annulation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
