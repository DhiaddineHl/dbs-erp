-- 0051 — Prévision d'export publiée aux clients (chaque week-end).
--
-- export_prevision        : une publication (période de 2 semaines, version,
--                           commentaire par client, qui / quand).
-- export_prevision_ligne  : la photo figée de chaque commande prévue (date,
--                           quantité, état, changement depuis la précédente).
-- Republier la même période ajoute une version : rien n'est écrasé.
CREATE TABLE "export_prevision" (
	"id" serial PRIMARY KEY NOT NULL,
	"debut" date NOT NULL,
	"fin" date NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"commentaires" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"publie_le" timestamp DEFAULT now() NOT NULL,
	"publie_par" text DEFAULT '' NOT NULL,
	CONSTRAINT "export_prevision_periode_version" UNIQUE("debut","version")
);
--> statement-breakpoint
CREATE TABLE "export_prevision_ligne" (
	"id" serial PRIMARY KEY NOT NULL,
	"prevision_id" integer NOT NULL,
	"client_id" integer,
	"commande_id" integer,
	"of" text DEFAULT '' NOT NULL,
	"modele" text DEFAULT '' NOT NULL,
	"reference" text DEFAULT '' NOT NULL,
	"couleur" text DEFAULT '' NOT NULL,
	"date" date,
	"qte" integer DEFAULT 0 NOT NULL,
	"qte_commande" integer DEFAULT 0 NOT NULL,
	"etat" text DEFAULT '' NOT NULL,
	"changement" text DEFAULT '' NOT NULL,
	"date_avant" date,
	"qte_avant" integer
);
--> statement-breakpoint
ALTER TABLE "export_prevision_ligne" ADD CONSTRAINT "export_prevision_ligne_prevision_id_export_prevision_id_fk" FOREIGN KEY ("prevision_id") REFERENCES "public"."export_prevision"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_prevision_ligne" ADD CONSTRAINT "export_prevision_ligne_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_prevision_ligne" ADD CONSTRAINT "export_prevision_ligne_commande_id_commande_id_fk" FOREIGN KEY ("commande_id") REFERENCES "public"."commande"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "export_prevision_ligne_prev_idx" ON "export_prevision_ligne" USING btree ("prevision_id");--> statement-breakpoint
CREATE INDEX "export_prevision_ligne_client_idx" ON "export_prevision_ligne" USING btree ("client_id");