-- 0048 — Portails extérieurs (clients, puis sous-traitants).
--
-- portail_acces     : un accès = une personne extérieure (clé de lien/QR,
--                     PIN facultatif, coupable et regénérable seul).
-- portail_evenement : journal des visites, questions, décisions, OK / refus.
-- commande_tds      : + nature (tds = tête de série · ok = pièces pour l'OK
--                     livraison), + transporteur et n° de suivi (DHL…).
--                     La numérotation se fait PAR NATURE (TDS1, TDS2… restent
--                     sans trou quand des pièces d'OK livraison s'intercalent).
-- bl                : + n° de suivi du transporteur.
-- portail_point    : l'avancement vu par un client, figé une fois par jour
--                     (même rythme pour toutes ses commandes).
CREATE TABLE "portail_acces" (
	"id" serial PRIMARY KEY NOT NULL,
	"cle" text NOT NULL,
	"type" text NOT NULL,
	"client_id" integer,
	"faconnier_id" integer,
	"nom" text DEFAULT '' NOT NULL,
	"pin_hash" text DEFAULT '' NOT NULL,
	"pin_version" integer DEFAULT 1 NOT NULL,
	"echecs" integer DEFAULT 0 NOT NULL,
	"bloque_jusqua" timestamp,
	"actif" boolean DEFAULT true NOT NULL,
	"conversation_id" integer,
	"cree_par" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"derniere_visite" timestamp,
	"nb_visites" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "portail_acces_cle_unique" UNIQUE("cle")
);
--> statement-breakpoint
CREATE TABLE "portail_evenement" (
	"id" serial PRIMARY KEY NOT NULL,
	"acces_id" integer NOT NULL,
	"type" text NOT NULL,
	"commande_id" integer,
	"detail" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portail_point" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"jour" date NOT NULL,
	"donnees" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "portail_point_jour" UNIQUE("client_id","jour")
);
--> statement-breakpoint
ALTER TABLE "commande_tds" DROP CONSTRAINT "commande_tds_rang";--> statement-breakpoint
ALTER TABLE "bl" ADD COLUMN "suivi" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "commande_tds" ADD COLUMN "nature" text DEFAULT 'tds' NOT NULL;--> statement-breakpoint
ALTER TABLE "commande_tds" ADD COLUMN "transporteur" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "commande_tds" ADD COLUMN "suivi" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "portail_acces" ADD CONSTRAINT "portail_acces_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portail_acces" ADD CONSTRAINT "portail_acces_faconnier_id_faconnier_id_fk" FOREIGN KEY ("faconnier_id") REFERENCES "public"."faconnier"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portail_acces" ADD CONSTRAINT "portail_acces_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portail_evenement" ADD CONSTRAINT "portail_evenement_acces_id_portail_acces_id_fk" FOREIGN KEY ("acces_id") REFERENCES "public"."portail_acces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portail_evenement" ADD CONSTRAINT "portail_evenement_commande_id_commande_id_fk" FOREIGN KEY ("commande_id") REFERENCES "public"."commande"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portail_point" ADD CONSTRAINT "portail_point_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "portail_acces_client_idx" ON "portail_acces" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "portail_acces_faconnier_idx" ON "portail_acces" USING btree ("faconnier_id");--> statement-breakpoint
CREATE INDEX "portail_evenement_acces_idx" ON "portail_evenement" USING btree ("acces_id","id");--> statement-breakpoint
ALTER TABLE "commande_tds" ADD CONSTRAINT "commande_tds_rang" UNIQUE("commande_id","nature","n");