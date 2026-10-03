-- Rouleaux « À MESURER » (étiquette imprimée avant la mesure, métrage saisi
-- au scan) et BON RÉCAPITULATIF de sortie (BSR-AAAA-NNN).
-- Aucune donnée existante modifiée : les rouleaux déjà créés restent mesurés.
CREATE TABLE "tissu_recap" (
	"id" serial PRIMARY KEY NOT NULL,
	"numero" text NOT NULL,
	"destination" text DEFAULT '' NOT NULL,
	"faconnier_nom" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_by" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tissu_recap_numero_unique" UNIQUE("numero")
);
--> statement-breakpoint
CREATE TABLE "tissu_recap_ligne" (
	"recap_id" integer NOT NULL,
	"mouvement_id" integer NOT NULL,
	CONSTRAINT "tissu_recap_ligne_recap_id_mouvement_id_pk" PRIMARY KEY("recap_id","mouvement_id")
);
--> statement-breakpoint
ALTER TABLE "tissu_rouleau" ADD COLUMN "a_mesurer" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tissu_recap_ligne" ADD CONSTRAINT "tissu_recap_ligne_recap_id_tissu_recap_id_fk" FOREIGN KEY ("recap_id") REFERENCES "public"."tissu_recap"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tissu_recap_ligne" ADD CONSTRAINT "tissu_recap_ligne_mouvement_id_tissu_mouvement_id_fk" FOREIGN KEY ("mouvement_id") REFERENCES "public"."tissu_mouvement"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tissu_recap_ligne_mvt_idx" ON "tissu_recap_ligne" USING btree ("mouvement_id");--> statement-breakpoint
-- Un rouleau à mesurer vaut 0 m tant que son métrage n'est pas saisi.
ALTER TABLE "tissu_rouleau" DROP CONSTRAINT "tissu_rouleau_metrage_positif";--> statement-breakpoint
ALTER TABLE "tissu_rouleau" ADD CONSTRAINT "tissu_rouleau_metrage_positif" CHECK ("metrage_initial" > 0 OR "a_mesurer");--> statement-breakpoint
-- Identité figée (0038), avec UNE exception : le métrage d'un rouleau « à
-- mesurer » s'écrit une seule fois, au passage à_mesurer → mesuré. Après, il
-- est figé comme les autres ; un rouleau mesuré ne redevient jamais « à mesurer ».
CREATE OR REPLACE FUNCTION "tissu_rouleau_identite_figee"() RETURNS trigger AS $$
BEGIN
  IF (NEW."code", NEW."lot_id", NEW."created_at") IS DISTINCT FROM (OLD."code", OLD."lot_id", OLD."created_at")
     OR (NEW."metrage_initial" IS DISTINCT FROM OLD."metrage_initial" AND NOT (OLD."a_mesurer" AND NOT NEW."a_mesurer"))
     OR (NEW."a_mesurer" AND NOT OLD."a_mesurer") THEN
    RAISE EXCEPTION 'Rouleau % : code, lot, métrage initial et date sont figés — passez une correction', OLD."code";
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
