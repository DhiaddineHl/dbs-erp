-- Module COUPE : fiche de coupe depuis le plan (CP-AAAA-NNN), lignes OF ×
-- taille avec le prévu figé, consommation tissu rattachée à la fiche, et
-- procès-verbal de coupe client versionné (PVC-AAAA-NNN).
-- Aucune donnée existante modifiée : les anciens lâchers restent valables.
CREATE TABLE "coupe_fiche" (
	"id" serial PRIMARY KEY NOT NULL,
	"numero" text NOT NULL,
	"commande_id" integer NOT NULL,
	"date" date NOT NULL,
	"statut" text DEFAULT 'validee' NOT NULL,
	"type" text DEFAULT 'interne' NOT NULL,
	"matiere_rang" integer DEFAULT 0 NOT NULL,
	"matiere_nom" text DEFAULT '' NOT NULL,
	"conso_prevue_piece" double precision,
	"metrage_plan" double precision,
	"seuil_ecart_pct" double precision DEFAULT 2 NOT NULL,
	"motif_ecart" text DEFAULT '' NOT NULL,
	"precision_ecart" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_by" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"annule_par" text DEFAULT '' NOT NULL,
	"annule_le" timestamp,
	"motif_annulation" text DEFAULT '' NOT NULL,
	CONSTRAINT "coupe_fiche_numero_unique" UNIQUE("numero")
);
--> statement-breakpoint
CREATE TABLE "pv_coupe" (
	"id" serial PRIMARY KEY NOT NULL,
	"numero" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"fiche_id" integer NOT NULL,
	"donnees" jsonb NOT NULL,
	"created_by" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "pv_coupe_version" UNIQUE("numero","version")
);
--> statement-breakpoint
ALTER TABLE "coupe" ADD COLUMN "fiche_id" integer;--> statement-breakpoint
ALTER TABLE "coupe" ADD COLUMN "qte_prevue" integer;--> statement-breakpoint
ALTER TABLE "coupe" ADD COLUMN "qte_commandee" integer;--> statement-breakpoint
ALTER TABLE "tissu_mouvement" ADD COLUMN "coupe_fiche_id" integer;--> statement-breakpoint
ALTER TABLE "coupe_fiche" ADD CONSTRAINT "coupe_fiche_commande_id_commande_id_fk" FOREIGN KEY ("commande_id") REFERENCES "public"."commande"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pv_coupe" ADD CONSTRAINT "pv_coupe_fiche_id_coupe_fiche_id_fk" FOREIGN KEY ("fiche_id") REFERENCES "public"."coupe_fiche"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "coupe_fiche_commande_idx" ON "coupe_fiche" USING btree ("commande_id");--> statement-breakpoint
CREATE INDEX "pv_coupe_fiche_idx" ON "pv_coupe" USING btree ("fiche_id");--> statement-breakpoint
ALTER TABLE "coupe" ADD CONSTRAINT "coupe_fiche_id_coupe_fiche_id_fk" FOREIGN KEY ("fiche_id") REFERENCES "public"."coupe_fiche"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tissu_mouvement" ADD CONSTRAINT "tissu_mouvement_coupe_fiche_id_coupe_fiche_id_fk" FOREIGN KEY ("coupe_fiche_id") REFERENCES "public"."coupe_fiche"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "coupe_fiche_idx" ON "coupe" USING btree ("fiche_id");--> statement-breakpoint
CREATE INDEX "tissu_mouvement_coupe_fiche_idx" ON "tissu_mouvement" USING btree ("coupe_fiche_id");--> statement-breakpoint
-- Historique tissu immuable (0041), avec le rattachement d'un mouvement à une
-- fiche de coupe : il s'inscrit une fois (vide → fiche), et ne peut que se
-- détacher (fiche → vide) quand la fiche est annulée. Jamais d'une fiche à une autre.
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
     OR (NEW."coupe_fiche_id" IS NOT NULL AND OLD."coupe_fiche_id" IS NOT NULL AND NEW."coupe_fiche_id" <> OLD."coupe_fiche_id")
     OR (NEW."commande_id" IS DISTINCT FROM OLD."commande_id" AND NEW."commande_id" IS NOT NULL)
     OR (NEW."annule_id" IS DISTINCT FROM OLD."annule_id" AND NEW."annule_id" IS NOT NULL)
     OR (NEW."faconnier_id" IS DISTINCT FROM OLD."faconnier_id" AND NEW."faconnier_id" IS NOT NULL) THEN
    RAISE EXCEPTION 'Historique tissu : un mouvement ne se modifie pas — passez une correction ou une annulation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;--> statement-breakpoint
-- Une fiche de coupe validée ne se réécrit pas : seule son ANNULATION (une
-- fois, motivée) est permise.
CREATE OR REPLACE FUNCTION "coupe_fiche_figee"() RETURNS trigger AS $$
BEGIN
  IF (NEW."numero", NEW."commande_id", NEW."date", NEW."type", NEW."matiere_rang", NEW."matiere_nom",
      NEW."conso_prevue_piece", NEW."metrage_plan", NEW."seuil_ecart_pct", NEW."motif_ecart",
      NEW."precision_ecart", NEW."note", NEW."created_by", NEW."created_at")
     IS DISTINCT FROM
     (OLD."numero", OLD."commande_id", OLD."date", OLD."type", OLD."matiere_rang", OLD."matiere_nom",
      OLD."conso_prevue_piece", OLD."metrage_plan", OLD."seuil_ecart_pct", OLD."motif_ecart",
      OLD."precision_ecart", OLD."note", OLD."created_by", OLD."created_at")
     OR (NEW."statut" IS DISTINCT FROM OLD."statut" AND NOT (OLD."statut" = 'validee' AND NEW."statut" = 'annulee')) THEN
    RAISE EXCEPTION 'Fiche de coupe % : une fiche validée ne se modifie pas — annulez-la et refaites-la', OLD."numero";
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "coupe_fiche_figee" BEFORE UPDATE ON "coupe_fiche"
  FOR EACH ROW EXECUTE FUNCTION "coupe_fiche_figee"();--> statement-breakpoint
-- Les lignes d'une fiche (OF × taille) sont figées avec elle.
CREATE OR REPLACE FUNCTION "coupe_ligne_figee"() RETURNS trigger AS $$
BEGIN
  IF OLD."fiche_id" IS NOT NULL THEN
    RAISE EXCEPTION 'Ligne de la fiche de coupe : elle ne se modifie pas — annulez la fiche';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "coupe_ligne_figee" BEFORE UPDATE ON "coupe"
  FOR EACH ROW EXECUTE FUNCTION "coupe_ligne_figee"();--> statement-breakpoint
-- Un PV généré est un document remis au client : jamais réécrit. Régénérer
-- crée la version suivante.
CREATE OR REPLACE FUNCTION "pv_coupe_fige"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'PV de coupe % v% : un PV généré ne se modifie pas — régénérez une nouvelle version', OLD."numero", OLD."version";
END $$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "pv_coupe_fige" BEFORE UPDATE ON "pv_coupe"
  FOR EACH ROW EXECUTE FUNCTION "pv_coupe_fige"();
