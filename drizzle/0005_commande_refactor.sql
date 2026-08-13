CREATE TABLE "commande" (
	"id" serial PRIMARY KEY NOT NULL,
	"of_number" text NOT NULL,
	"modele" text NOT NULL,
	"ref_article" text DEFAULT '' NOT NULL,
	"couleur" text DEFAULT '' NOT NULL,
	"saison" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"parent_id" integer,
	"client_id" integer,
	"faconnier_id" integer,
	"chaine_id" integer,
	"qte" integer DEFAULT 0 NOT NULL,
	"tailles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"prix_vente" double precision,
	"prix_facon" double precision,
	"conso_theo" double precision,
	"conso_reel" double precision,
	"chute_pct" double precision,
	"recept_tissu" date,
	"date_export" date,
	"date_export_reel" date,
	"date_livraison" date,
	"export_prev" date,
	"produit" integer DEFAULT 0 NOT NULL,
	"coupe_qte" integer DEFAULT 0 NOT NULL,
	"magasin_qte" integer DEFAULT 0 NOT NULL,
	"facture_qte" integer DEFAULT 0 NOT NULL,
	"tissu_recu" double precision DEFAULT 0 NOT NULL,
	"tissu_libere" boolean DEFAULT false NOT NULL,
	"magasin_prepare" boolean DEFAULT false NOT NULL,
	"magasin_expedie" boolean DEFAULT false NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"statut_manuel" text,
	"statut_log" text DEFAULT 'attente' NOT NULL,
	"fac_nums" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "commande_ofNumber_unique" UNIQUE("of_number")
);
--> statement-breakpoint
CREATE TABLE "commande_prix_journal" (
	"id" serial PRIMARY KEY NOT NULL,
	"commande_id" integer,
	"of_number" text DEFAULT '' NOT NULL,
	"champ" text NOT NULL,
	"ancien" double precision,
	"nouveau" double precision,
	"user_id" text,
	"user_name" text DEFAULT '' NOT NULL,
	"ts" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "of_supprime" (
	"of_number" text PRIMARY KEY NOT NULL,
	"supprime_le" timestamp DEFAULT now() NOT NULL,
	"par_user_id" text
);
--> statement-breakpoint
ALTER TABLE "faconnier" DROP CONSTRAINT "faconnier_name_unique";--> statement-breakpoint
ALTER TABLE "faconnier" ALTER COLUMN "name" SET DEFAULT '';--> statement-breakpoint
--> client: `key` stops being the primary key and becomes a unique business key.
--> facture.client_key depends on that primary key, so the foreign key is dropped
--> first and rebuilt at the end of this migration against the unique constraint.
ALTER TABLE "facture" DROP CONSTRAINT "facture_client_key_client_key_fk";--> statement-breakpoint
ALTER TABLE "client" DROP CONSTRAINT "client_pkey";--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "id" serial NOT NULL;--> statement-breakpoint
ALTER TABLE "client" ADD CONSTRAINT "client_pkey" PRIMARY KEY ("id");--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "code" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "contact" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "email" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "tel" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "ville" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "pays" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "tva" text DEFAULT '' NOT NULL;--> statement-breakpoint
--> faconnier: `name` is renamed to `nom`. Added nullable, backfilled, then
--> constrained — a bare NOT NULL add would fail on the existing rows.
ALTER TABLE "faconnier" ADD COLUMN "nom" text;--> statement-breakpoint
UPDATE "faconnier" SET "nom" = "name" WHERE "nom" IS NULL;--> statement-breakpoint
ALTER TABLE "faconnier" ALTER COLUMN "nom" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "faconnier" ADD COLUMN "specialite" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "faconnier" ADD COLUMN "contact" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "faconnier" ADD COLUMN "tel" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "faconnier" ADD COLUMN "prix_facon" double precision;--> statement-breakpoint
ALTER TABLE "commande" ADD CONSTRAINT "commande_parent_id_commande_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."commande"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commande" ADD CONSTRAINT "commande_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commande" ADD CONSTRAINT "commande_faconnier_id_faconnier_id_fk" FOREIGN KEY ("faconnier_id") REFERENCES "public"."faconnier"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commande" ADD CONSTRAINT "commande_chaine_id_chaine_id_fk" FOREIGN KEY ("chaine_id") REFERENCES "public"."chaine"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commande_prix_journal" ADD CONSTRAINT "commande_prix_journal_commande_id_commande_id_fk" FOREIGN KEY ("commande_id") REFERENCES "public"."commande"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "commande_client_idx" ON "commande" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "commande_faconnier_idx" ON "commande" USING btree ("faconnier_id");--> statement-breakpoint
CREATE INDEX "commande_archived_idx" ON "commande" USING btree ("archived");--> statement-breakpoint
CREATE INDEX "commande_modele_idx" ON "commande" USING btree ("modele");--> statement-breakpoint
CREATE INDEX "prix_journal_commande_idx" ON "commande_prix_journal" USING btree ("commande_id");--> statement-breakpoint
ALTER TABLE "client" ADD CONSTRAINT "client_key_unique" UNIQUE("key");--> statement-breakpoint
ALTER TABLE "faconnier" ADD CONSTRAINT "faconnier_nom_unique" UNIQUE("nom");--> statement-breakpoint
--> rebuilt now that `key` carries a unique constraint of its own.
ALTER TABLE "facture" ADD CONSTRAINT "facture_client_key_client_key_fk" FOREIGN KEY ("client_key") REFERENCES "public"."client"("key") ON DELETE no action ON UPDATE no action;