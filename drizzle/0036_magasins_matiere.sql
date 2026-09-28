-- Magasins matière (tissu + fournitures), complémentaires :
--   tissu : contrôle à réception contre le BL client (métrage annoncé,
--           laize annoncée, défauts, rouleaux), n° de BL sur le bon ;
--           nouveau sens de mouvement « rendu » (reliquat rendu au client).
--   fournitures : origine (client / DBS) + fournisseur par ligne,
--           nomenclature par modèle, bons de réception client
--           multi-commandes, restes par client.
-- Aucune donnée existante n'est modifiée : colonnes ajoutées avec défaut.
CREATE TABLE "fourniture_nomenclature" (
	"id" serial PRIMARY KEY NOT NULL,
	"modele_cle" text NOT NULL,
	"modele_label" text DEFAULT '' NOT NULL,
	"designation" text DEFAULT '' NOT NULL,
	"qte_par_piece" double precision DEFAULT 0 NOT NULL,
	"unite" text DEFAULT 'pcs' NOT NULL,
	"casse_pct" double precision DEFAULT 0 NOT NULL,
	"origine" text DEFAULT 'client' NOT NULL,
	"fournisseur" text DEFAULT '' NOT NULL,
	"ordre" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fourniture_reception" (
	"id" serial PRIMARY KEY NOT NULL,
	"numero" text DEFAULT '' NOT NULL,
	"date" date NOT NULL,
	"client" text DEFAULT '' NOT NULL,
	"bl_client" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_by" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fourniture_reception_ligne" (
	"id" serial PRIMARY KEY NOT NULL,
	"reception_id" integer NOT NULL,
	"ligne_id" integer,
	"commande_id" integer,
	"designation" text DEFAULT '' NOT NULL,
	"qte" double precision DEFAULT 0 NOT NULL,
	"unite" text DEFAULT 'pcs' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fourniture_reste" (
	"id" serial PRIMARY KEY NOT NULL,
	"client" text DEFAULT '' NOT NULL,
	"designation" text DEFAULT '' NOT NULL,
	"unite" text DEFAULT 'pcs' NOT NULL,
	"qte" double precision DEFAULT 0 NOT NULL,
	"origine_of" text DEFAULT '' NOT NULL,
	"statut" text DEFAULT 'en_stock' NOT NULL,
	"destination" text DEFAULT '' NOT NULL,
	"date" date NOT NULL,
	"date_sortie" date,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "commande_fourniture_ligne" ADD COLUMN "origine" text DEFAULT 'client' NOT NULL;--> statement-breakpoint
ALTER TABLE "commande_fourniture_ligne" ADD COLUMN "fournisseur" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "commande_fourniture_ligne" ADD COLUMN "nomenclature_id" integer;--> statement-breakpoint
ALTER TABLE "tissu_lot" ADD COLUMN "quantite_annoncee" double precision;--> statement-breakpoint
ALTER TABLE "tissu_lot" ADD COLUMN "laize_annoncee" double precision;--> statement-breakpoint
ALTER TABLE "tissu_lot" ADD COLUMN "defauts" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "tissu_lot" ADD COLUMN "rouleaux" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "tissu_reception" ADD COLUMN "bl_client" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "fourniture_reception_ligne" ADD CONSTRAINT "fourniture_reception_ligne_reception_id_fourniture_reception_id_fk" FOREIGN KEY ("reception_id") REFERENCES "public"."fourniture_reception"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fourniture_reception_ligne" ADD CONSTRAINT "fourniture_reception_ligne_ligne_id_commande_fourniture_ligne_id_fk" FOREIGN KEY ("ligne_id") REFERENCES "public"."commande_fourniture_ligne"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fourniture_reception_ligne" ADD CONSTRAINT "fourniture_reception_ligne_commande_id_commande_id_fk" FOREIGN KEY ("commande_id") REFERENCES "public"."commande"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fourniture_nomenclature_cle_idx" ON "fourniture_nomenclature" USING btree ("modele_cle");--> statement-breakpoint
CREATE INDEX "fourniture_reception_ligne_rec_idx" ON "fourniture_reception_ligne" USING btree ("reception_id");--> statement-breakpoint
CREATE INDEX "fourniture_reste_client_idx" ON "fourniture_reste" USING btree ("client");--> statement-breakpoint
ALTER TABLE "commande_fourniture_ligne" ADD CONSTRAINT "commande_fourniture_ligne_nomenclature_id_fourniture_nomenclature_id_fk" FOREIGN KEY ("nomenclature_id") REFERENCES "public"."fourniture_nomenclature"("id") ON DELETE set null ON UPDATE no action;