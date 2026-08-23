CREATE TABLE "commande_plan" (
	"commande_id" integer PRIMARY KEY NOT NULL,
	"sizes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ordre" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"max_pieces_trace" integer DEFAULT 4 NOT NULL,
	"max_plis" integer DEFAULT 100 NOT NULL,
	"surplus_tolere" integer DEFAULT 0 NOT NULL,
	"par" text DEFAULT '' NOT NULL,
	"date" date,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commande_plan_matiere" (
	"id" serial PRIMARY KEY NOT NULL,
	"commande_id" integer NOT NULL,
	"rang" integer DEFAULT 0 NOT NULL,
	"nom" text DEFAULT 'Tissu principal' NOT NULL,
	"laise" double precision,
	"conso_prevue" double precision,
	"perte_bout" double precision,
	"traces" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "commande_plan" ADD CONSTRAINT "commande_plan_commande_id_commande_id_fk" FOREIGN KEY ("commande_id") REFERENCES "public"."commande"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commande_plan_matiere" ADD CONSTRAINT "commande_plan_matiere_commande_id_commande_plan_commande_id_fk" FOREIGN KEY ("commande_id") REFERENCES "public"."commande_plan"("commande_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "commande_plan_matiere_idx" ON "commande_plan_matiere" USING btree ("commande_id","rang");