CREATE TABLE "bl" (
	"id" serial PRIMARY KEY NOT NULL,
	"numero" text NOT NULL,
	"date" date NOT NULL,
	"client_id" integer,
	"client_nom" text DEFAULT '' NOT NULL,
	"transporteur" text DEFAULT '' NOT NULL,
	"adresse_livraison" text DEFAULT '' NOT NULL,
	"statut" text DEFAULT 'draft' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bl_numero_unique" UNIQUE("numero")
);
--> statement-breakpoint
CREATE TABLE "bl_ligne" (
	"id" serial PRIMARY KEY NOT NULL,
	"bl_id" integer NOT NULL,
	"commande_id" integer,
	"of" text DEFAULT '' NOT NULL,
	"modele" text DEFAULT '' NOT NULL,
	"ref_article" text DEFAULT '' NOT NULL,
	"couleur" text DEFAULT '' NOT NULL,
	"qte_livree" integer DEFAULT 0 NOT NULL,
	"prix_unitaire" double precision DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "br" (
	"id" serial PRIMARY KEY NOT NULL,
	"numero" text NOT NULL,
	"commande_id" integer NOT NULL,
	"date" date NOT NULL,
	"faconnier" text DEFAULT '' NOT NULL,
	"qte_recue" integer DEFAULT 0 NOT NULL,
	"qte_ok" integer DEFAULT 0 NOT NULL,
	"qte_nc" integer DEFAULT 0 NOT NULL,
	"controle" text DEFAULT 'ok' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "br_numero_unique" UNIQUE("numero")
);
--> statement-breakpoint
CREATE TABLE "coupe" (
	"id" serial PRIMARY KEY NOT NULL,
	"commande_id" integer NOT NULL,
	"date" date NOT NULL,
	"qte" integer DEFAULT 0 NOT NULL,
	"taille" text DEFAULT '' NOT NULL,
	"type" text DEFAULT 'interne' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magasin_mouvement" (
	"id" serial PRIMARY KEY NOT NULL,
	"commande_id" integer NOT NULL,
	"date" date NOT NULL,
	"qte" integer DEFAULT 0 NOT NULL,
	"origine" text DEFAULT 'interne' NOT NULL,
	"br_id" integer,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bl" ADD CONSTRAINT "bl_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bl_ligne" ADD CONSTRAINT "bl_ligne_bl_id_bl_id_fk" FOREIGN KEY ("bl_id") REFERENCES "public"."bl"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bl_ligne" ADD CONSTRAINT "bl_ligne_commande_id_commande_id_fk" FOREIGN KEY ("commande_id") REFERENCES "public"."commande"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "br" ADD CONSTRAINT "br_commande_id_commande_id_fk" FOREIGN KEY ("commande_id") REFERENCES "public"."commande"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupe" ADD CONSTRAINT "coupe_commande_id_commande_id_fk" FOREIGN KEY ("commande_id") REFERENCES "public"."commande"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "magasin_mouvement" ADD CONSTRAINT "magasin_mouvement_commande_id_commande_id_fk" FOREIGN KEY ("commande_id") REFERENCES "public"."commande"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "magasin_mouvement" ADD CONSTRAINT "magasin_mouvement_br_id_br_id_fk" FOREIGN KEY ("br_id") REFERENCES "public"."br"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bl_client_idx" ON "bl" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "bl_statut_idx" ON "bl" USING btree ("statut");--> statement-breakpoint
CREATE INDEX "bl_ligne_bl_idx" ON "bl_ligne" USING btree ("bl_id");--> statement-breakpoint
CREATE INDEX "br_commande_idx" ON "br" USING btree ("commande_id");--> statement-breakpoint
CREATE INDEX "coupe_commande_idx" ON "coupe" USING btree ("commande_id");--> statement-breakpoint
CREATE INDEX "magasin_commande_idx" ON "magasin_mouvement" USING btree ("commande_id");