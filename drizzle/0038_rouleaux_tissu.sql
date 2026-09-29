-- Traçabilité par ROULEAU physique (QR). Sous le lot existant, sans système
-- parallèle : le rouleau est un enfant du lot, ses mouvements vont dans le
-- même journal tissu_mouvement (colonne rouleau_id). Aucune donnée existante
-- n'est modifiée ; aucun rouleau n'est créé automatiquement.
CREATE TABLE "tissu_emplacement" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"zone" text DEFAULT '' NOT NULL,
	"rayon" text DEFAULT '' NOT NULL,
	"libelle" text DEFAULT '' NOT NULL,
	"actif" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tissu_emplacement_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "tissu_inventaire" (
	"id" serial PRIMARY KEY NOT NULL,
	"numero" text NOT NULL,
	"statut" text DEFAULT 'ouvert' NOT NULL,
	"zone" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"ouvert_par" text DEFAULT '' NOT NULL,
	"clos_par" text DEFAULT '' NOT NULL,
	"clos_le" timestamp,
	"resultat" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tissu_inventaire_numero_unique" UNIQUE("numero")
);
--> statement-breakpoint
CREATE TABLE "tissu_inventaire_scan" (
	"id" serial PRIMARY KEY NOT NULL,
	"inventaire_id" integer NOT NULL,
	"code" text NOT NULL,
	"rouleau_id" integer,
	"metrage_constate" double precision,
	"emplacement_code" text DEFAULT '' NOT NULL,
	"par" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tissu_inventaire_scan_unique" UNIQUE("inventaire_id","code")
);
--> statement-breakpoint
CREATE TABLE "tissu_rouleau" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"lot_id" integer NOT NULL,
	"metrage_initial" double precision NOT NULL,
	"metrage_annonce" double precision,
	"laize" double precision,
	"poids" double precision,
	"statut" text DEFAULT 'en_attente' NOT NULL,
	"emplacement_id" integer,
	"observations" text DEFAULT '' NOT NULL,
	"valide_le" timestamp,
	"valide_par" text DEFAULT '' NOT NULL,
	"created_by" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tissu_rouleau_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "tissu_lot" ADD COLUMN "lot_fournisseur" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "tissu_lot" ADD COLUMN "code_couleur" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "tissu_mouvement" ADD COLUMN "rouleau_id" integer;--> statement-breakpoint
ALTER TABLE "tissu_mouvement" ADD COLUMN "destination" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "tissu_mouvement" ADD COLUMN "valeur_avant" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "tissu_mouvement" ADD COLUMN "valeur_apres" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "tissu_mouvement" ADD COLUMN "annule_id" integer;--> statement-breakpoint
ALTER TABLE "tissu_reception" ADD COLUMN "commande_fournisseur" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "tissu_inventaire_scan" ADD CONSTRAINT "tissu_inventaire_scan_inventaire_id_tissu_inventaire_id_fk" FOREIGN KEY ("inventaire_id") REFERENCES "public"."tissu_inventaire"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tissu_inventaire_scan" ADD CONSTRAINT "tissu_inventaire_scan_rouleau_id_tissu_rouleau_id_fk" FOREIGN KEY ("rouleau_id") REFERENCES "public"."tissu_rouleau"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tissu_rouleau" ADD CONSTRAINT "tissu_rouleau_lot_id_tissu_lot_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."tissu_lot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tissu_rouleau" ADD CONSTRAINT "tissu_rouleau_emplacement_id_tissu_emplacement_id_fk" FOREIGN KEY ("emplacement_id") REFERENCES "public"."tissu_emplacement"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tissu_rouleau_lot_idx" ON "tissu_rouleau" USING btree ("lot_id");--> statement-breakpoint
CREATE INDEX "tissu_rouleau_statut_idx" ON "tissu_rouleau" USING btree ("statut");--> statement-breakpoint
ALTER TABLE "tissu_mouvement" ADD CONSTRAINT "tissu_mouvement_rouleau_id_tissu_rouleau_id_fk" FOREIGN KEY ("rouleau_id") REFERENCES "public"."tissu_rouleau"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tissu_mouvement" ADD CONSTRAINT "tissu_mouvement_annule_id_tissu_mouvement_id_fk" FOREIGN KEY ("annule_id") REFERENCES "public"."tissu_mouvement"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tissu_mouvement_rouleau_idx" ON "tissu_mouvement" USING btree ("rouleau_id");--> statement-breakpoint
-- Numérotation des rouleaux : une séquence, jamais deux fois le même numéro,
-- même avec plusieurs téléphones en même temps.
CREATE SEQUENCE IF NOT EXISTS "tissu_rouleau_seq" START 1;--> statement-breakpoint

-- Historique immuable : un mouvement ne se modifie jamais. Seules les
-- références qui DISPARAISSENT (commande supprimée, mouvement annulé supprimé)
-- peuvent passer à NULL, par les clés étrangères.
CREATE OR REPLACE FUNCTION "tissu_mouvement_immuable"() RETURNS trigger AS $$
BEGIN
  IF (NEW."lot_id", NEW."sens", NEW."quantite", NEW."commande_label", NEW."motif", NEW."rouleau_id",
      NEW."destination", NEW."valeur_avant", NEW."valeur_apres", NEW."created_by", NEW."created_at")
     IS DISTINCT FROM
     (OLD."lot_id", OLD."sens", OLD."quantite", OLD."commande_label", OLD."motif", OLD."rouleau_id",
      OLD."destination", OLD."valeur_avant", OLD."valeur_apres", OLD."created_by", OLD."created_at")
     OR (NEW."commande_id" IS DISTINCT FROM OLD."commande_id" AND NEW."commande_id" IS NOT NULL)
     OR (NEW."annule_id" IS DISTINCT FROM OLD."annule_id" AND NEW."annule_id" IS NOT NULL) THEN
    RAISE EXCEPTION 'Historique tissu : un mouvement ne se modifie pas — passez une correction ou une annulation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "tissu_mouvement_immuable" BEFORE UPDATE ON "tissu_mouvement"
  FOR EACH ROW EXECUTE FUNCTION "tissu_mouvement_immuable"();--> statement-breakpoint

-- Identité d'un rouleau figée : code, lot, métrage initial, date de création.
CREATE OR REPLACE FUNCTION "tissu_rouleau_identite_figee"() RETURNS trigger AS $$
BEGIN
  IF (NEW."code", NEW."lot_id", NEW."metrage_initial", NEW."created_at")
     IS DISTINCT FROM (OLD."code", OLD."lot_id", OLD."metrage_initial", OLD."created_at") THEN
    RAISE EXCEPTION 'Rouleau % : code, lot, métrage initial et date sont figés — passez une correction', OLD."code";
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "tissu_rouleau_identite_figee" BEFORE UPDATE ON "tissu_rouleau"
  FOR EACH ROW EXECUTE FUNCTION "tissu_rouleau_identite_figee"();--> statement-breakpoint
ALTER TABLE "tissu_rouleau" ADD CONSTRAINT "tissu_rouleau_metrage_positif" CHECK ("metrage_initial" > 0);
