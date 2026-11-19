-- 0052 — Résultat de coupe client, généré automatiquement.
--
-- coupe_fiche.constats      : ce que le coupeur (ou l'atelier) a constaté —
--                             laize utile, 2e choix par OF × taille, défauts et
--                             manquants par rouleau. Figé avec la fiche.
-- st_rapport_coupe.constats : les mêmes constats, saisis par l'atelier.
-- resultat_coupe            : le « Résultat de coupe » au format client,
--                             photo figée prise à la validation (versions).
CREATE TABLE "resultat_coupe" (
	"id" serial PRIMARY KEY NOT NULL,
	"fiche_id" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"donnees" jsonb NOT NULL,
	"created_by" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "resultat_coupe_version" UNIQUE("fiche_id","version")
);
--> statement-breakpoint
ALTER TABLE "coupe_fiche" ADD COLUMN "constats" jsonb DEFAULT '{"laize":null,"second":{},"rouleaux":[]}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "st_rapport_coupe" ADD COLUMN "constats" jsonb DEFAULT '{"laize":null,"second":{},"rouleaux":[]}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "resultat_coupe" ADD CONSTRAINT "resultat_coupe_fiche_id_coupe_fiche_id_fk" FOREIGN KEY ("fiche_id") REFERENCES "public"."coupe_fiche"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Les constats sont figés avec la fiche : on remplace le garde-fou de 0043
-- en y ajoutant la colonne (même règle : seule l'annulation est permise).
CREATE OR REPLACE FUNCTION "coupe_fiche_figee"() RETURNS trigger AS $$
BEGIN
  IF (NEW."numero", NEW."commande_id", NEW."date", NEW."type", NEW."matiere_rang", NEW."matiere_nom",
      NEW."conso_prevue_piece", NEW."metrage_plan", NEW."seuil_ecart_pct", NEW."motif_ecart",
      NEW."precision_ecart", NEW."note", NEW."created_by", NEW."created_at", NEW."constats")
     IS DISTINCT FROM
     (OLD."numero", OLD."commande_id", OLD."date", OLD."type", OLD."matiere_rang", OLD."matiere_nom",
      OLD."conso_prevue_piece", OLD."metrage_plan", OLD."seuil_ecart_pct", OLD."motif_ecart",
      OLD."precision_ecart", OLD."note", OLD."created_by", OLD."created_at", OLD."constats")
     OR (NEW."statut" IS DISTINCT FROM OLD."statut" AND NOT (OLD."statut" = 'validee' AND NEW."statut" = 'annulee')) THEN
    RAISE EXCEPTION 'Fiche de coupe % : une fiche validée ne se modifie pas — annulez-la et refaites-la', OLD."numero";
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
