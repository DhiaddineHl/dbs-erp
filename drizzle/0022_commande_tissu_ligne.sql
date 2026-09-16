CREATE TABLE "commande_tissu_ligne" (
	"id" serial PRIMARY KEY NOT NULL,
	"commande_id" integer NOT NULL,
	"nom" text DEFAULT 'Tissu principal' NOT NULL,
	"reference" text DEFAULT '' NOT NULL,
	"couleur" text DEFAULT '' NOT NULL,
	"laize" double precision,
	"metrage_prevu" double precision DEFAULT 0 NOT NULL,
	"metrage_recu" double precision DEFAULT 0 NOT NULL,
	"controle" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "commande_tissu_ligne" ADD CONSTRAINT "commande_tissu_ligne_commande_id_commande_id_fk" FOREIGN KEY ("commande_id") REFERENCES "public"."commande"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "commande_tissu_cmd_idx" ON "commande_tissu_ligne" USING btree ("commande_id");