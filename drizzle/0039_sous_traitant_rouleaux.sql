-- Sorties de rouleaux vers un SOUS-TRAITANT (façonnier choisi, nom recopié)
-- et bon de sortie groupée BST-AAAA-NNN. Aucune donnée existante modifiée.
ALTER TABLE "tissu_mouvement" ADD COLUMN "faconnier_id" integer;--> statement-breakpoint
ALTER TABLE "tissu_mouvement" ADD COLUMN "faconnier_nom" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "tissu_mouvement" ADD COLUMN "bon" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "tissu_mouvement" ADD CONSTRAINT "tissu_mouvement_faconnier_id_faconnier_id_fk" FOREIGN KEY ("faconnier_id") REFERENCES "public"."faconnier"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tissu_mouvement_bon_idx" ON "tissu_mouvement" USING btree ("bon");--> statement-breakpoint
-- Historique immuable, étendu aux nouvelles colonnes : seul faconnier_id peut
-- passer à NULL (sous-traitant supprimé du référentiel) — son nom reste écrit.
CREATE OR REPLACE FUNCTION "tissu_mouvement_immuable"() RETURNS trigger AS $$
BEGIN
  IF (NEW."lot_id", NEW."sens", NEW."quantite", NEW."commande_label", NEW."motif", NEW."rouleau_id",
      NEW."destination", NEW."valeur_avant", NEW."valeur_apres", NEW."created_by", NEW."created_at",
      NEW."faconnier_nom", NEW."bon")
     IS DISTINCT FROM
     (OLD."lot_id", OLD."sens", OLD."quantite", OLD."commande_label", OLD."motif", OLD."rouleau_id",
      OLD."destination", OLD."valeur_avant", OLD."valeur_apres", OLD."created_by", OLD."created_at",
      OLD."faconnier_nom", OLD."bon")
     OR (NEW."commande_id" IS DISTINCT FROM OLD."commande_id" AND NEW."commande_id" IS NOT NULL)
     OR (NEW."annule_id" IS DISTINCT FROM OLD."annule_id" AND NEW."annule_id" IS NOT NULL)
     OR (NEW."faconnier_id" IS DISTINCT FROM OLD."faconnier_id" AND NEW."faconnier_id" IS NOT NULL) THEN
    RAISE EXCEPTION 'Historique tissu : un mouvement ne se modifie pas — passez une correction ou une annulation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
