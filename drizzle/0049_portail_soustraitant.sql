-- 0049 — Portail sous-traitant : ce qu'il DÉCLARE (jamais compté comme
-- production tant que vous n'avez pas validé).
--
-- st_declaration     : saisie du soir, cumuls lancé / produit / emballé (journal).
-- st_livraison       : livraison annoncée par taille, 1er / 2e choix ; validée
--                      à l'arrivée, elle crée le BR habituel.
-- st_reception_tissu : confirmation (ou écart) des rouleaux reçus.
-- st_rapport_coupe   : rapport de coupe ; validé, il devient une fiche de coupe.
CREATE TABLE "st_declaration" (
	"id" serial PRIMARY KEY NOT NULL,
	"acces_id" integer,
	"faconnier_id" integer NOT NULL,
	"commande_id" integer NOT NULL,
	"jour" date NOT NULL,
	"lance" integer DEFAULT 0 NOT NULL,
	"produit" integer DEFAULT 0 NOT NULL,
	"emballe" integer DEFAULT 0 NOT NULL,
	"alertes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"par" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "st_livraison" (
	"id" serial PRIMARY KEY NOT NULL,
	"numero" text NOT NULL,
	"acces_id" integer,
	"faconnier_id" integer NOT NULL,
	"commande_id" integer NOT NULL,
	"statut" text DEFAULT 'annoncee' NOT NULL,
	"lignes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"lignes_recues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"motif" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"par" text DEFAULT '' NOT NULL,
	"annoncee_le" timestamp DEFAULT now() NOT NULL,
	"recue_le" timestamp,
	"recue_par" text DEFAULT '' NOT NULL,
	"br_id" integer,
	CONSTRAINT "st_livraison_numero_unique" UNIQUE("numero")
);
--> statement-breakpoint
CREATE TABLE "st_rapport_coupe" (
	"id" serial PRIMARY KEY NOT NULL,
	"acces_id" integer,
	"faconnier_id" integer NOT NULL,
	"commande_id" integer NOT NULL,
	"statut" text DEFAULT 'annonce' NOT NULL,
	"coupe" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"rouleaux" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"par" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"traite_le" timestamp,
	"traite_par" text DEFAULT '' NOT NULL,
	"motif_refus" text DEFAULT '' NOT NULL,
	"fiche_id" integer
);
--> statement-breakpoint
CREATE TABLE "st_reception_tissu" (
	"id" serial PRIMARY KEY NOT NULL,
	"acces_id" integer,
	"mouvement_id" integer NOT NULL,
	"etat" text DEFAULT 'recu' NOT NULL,
	"metrage_constate" double precision,
	"note" text DEFAULT '' NOT NULL,
	"par" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "st_declaration" ADD CONSTRAINT "st_declaration_acces_id_portail_acces_id_fk" FOREIGN KEY ("acces_id") REFERENCES "public"."portail_acces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "st_declaration" ADD CONSTRAINT "st_declaration_faconnier_id_faconnier_id_fk" FOREIGN KEY ("faconnier_id") REFERENCES "public"."faconnier"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "st_declaration" ADD CONSTRAINT "st_declaration_commande_id_commande_id_fk" FOREIGN KEY ("commande_id") REFERENCES "public"."commande"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "st_livraison" ADD CONSTRAINT "st_livraison_acces_id_portail_acces_id_fk" FOREIGN KEY ("acces_id") REFERENCES "public"."portail_acces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "st_livraison" ADD CONSTRAINT "st_livraison_faconnier_id_faconnier_id_fk" FOREIGN KEY ("faconnier_id") REFERENCES "public"."faconnier"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "st_livraison" ADD CONSTRAINT "st_livraison_commande_id_commande_id_fk" FOREIGN KEY ("commande_id") REFERENCES "public"."commande"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "st_livraison" ADD CONSTRAINT "st_livraison_br_id_br_id_fk" FOREIGN KEY ("br_id") REFERENCES "public"."br"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "st_rapport_coupe" ADD CONSTRAINT "st_rapport_coupe_acces_id_portail_acces_id_fk" FOREIGN KEY ("acces_id") REFERENCES "public"."portail_acces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "st_rapport_coupe" ADD CONSTRAINT "st_rapport_coupe_faconnier_id_faconnier_id_fk" FOREIGN KEY ("faconnier_id") REFERENCES "public"."faconnier"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "st_rapport_coupe" ADD CONSTRAINT "st_rapport_coupe_commande_id_commande_id_fk" FOREIGN KEY ("commande_id") REFERENCES "public"."commande"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "st_rapport_coupe" ADD CONSTRAINT "st_rapport_coupe_fiche_id_coupe_fiche_id_fk" FOREIGN KEY ("fiche_id") REFERENCES "public"."coupe_fiche"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "st_reception_tissu" ADD CONSTRAINT "st_reception_tissu_acces_id_portail_acces_id_fk" FOREIGN KEY ("acces_id") REFERENCES "public"."portail_acces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "st_reception_tissu" ADD CONSTRAINT "st_reception_tissu_mouvement_id_tissu_mouvement_id_fk" FOREIGN KEY ("mouvement_id") REFERENCES "public"."tissu_mouvement"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "st_declaration_cmd_idx" ON "st_declaration" USING btree ("commande_id","jour");--> statement-breakpoint
CREATE INDEX "st_livraison_statut_idx" ON "st_livraison" USING btree ("statut");--> statement-breakpoint
CREATE INDEX "st_livraison_cmd_idx" ON "st_livraison" USING btree ("commande_id");--> statement-breakpoint
CREATE INDEX "st_rapport_coupe_statut_idx" ON "st_rapport_coupe" USING btree ("statut");--> statement-breakpoint
CREATE INDEX "st_reception_tissu_mvt_idx" ON "st_reception_tissu" USING btree ("mouvement_id");