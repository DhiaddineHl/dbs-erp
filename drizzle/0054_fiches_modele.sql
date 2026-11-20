-- 0054 — Direction technique : fiches du modèle (fiche technique, fiche
-- commentaire…) déposées sur chaque commande, consultables et imprimables par
-- l'atelier sur son portail. Le fichier lui-même est dans la table fichier.
CREATE TABLE "commande_document" (
	"id" serial PRIMARY KEY NOT NULL,
	"commande_id" integer NOT NULL,
	"nature" text DEFAULT 'fiche_technique' NOT NULL,
	"nom" text DEFAULT '' NOT NULL,
	"fichier_hash" text NOT NULL,
	"mime" text DEFAULT '' NOT NULL,
	"taille" integer DEFAULT 0 NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"visible_atelier" boolean DEFAULT true NOT NULL,
	"actif" boolean DEFAULT true NOT NULL,
	"depose_par" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"retire_par" text DEFAULT '' NOT NULL,
	"retire_le" timestamp
);
--> statement-breakpoint
ALTER TABLE "commande_document" ADD CONSTRAINT "commande_document_commande_id_commande_id_fk" FOREIGN KEY ("commande_id") REFERENCES "public"."commande"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "commande_document_cmd_idx" ON "commande_document" USING btree ("commande_id");