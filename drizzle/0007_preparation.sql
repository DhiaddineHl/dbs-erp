CREATE TABLE "commande_etape" (
	"id" serial PRIMARY KEY NOT NULL,
	"commande_id" integer NOT NULL,
	"etape" text NOT NULL,
	"fait" boolean DEFAULT false NOT NULL,
	"date" date,
	"par" text DEFAULT '' NOT NULL,
	CONSTRAINT "commande_etape_unique" UNIQUE("commande_id","etape")
);
--> statement-breakpoint
CREATE TABLE "commande_fourniture_ligne" (
	"id" serial PRIMARY KEY NOT NULL,
	"commande_id" integer NOT NULL,
	"designation" text DEFAULT '' NOT NULL,
	"qte_prevue" double precision DEFAULT 0 NOT NULL,
	"qte_recue" double precision DEFAULT 0 NOT NULL,
	"unite" text DEFAULT 'pcs' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commande_journal" (
	"id" serial PRIMARY KEY NOT NULL,
	"commande_id" integer NOT NULL,
	"ts" timestamp DEFAULT now() NOT NULL,
	"par" text DEFAULT '' NOT NULL,
	"role" text DEFAULT '' NOT NULL,
	"domaine" text NOT NULL,
	"action" text NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"avant" text DEFAULT '' NOT NULL,
	"apres" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commande_lancement" (
	"commande_id" integer PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"mode" text NOT NULL,
	"par" text DEFAULT '' NOT NULL,
	"derogation_motif" text,
	"derogation_par" text,
	"derogation_date" date,
	"derogation_manques" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commande_tds" (
	"id" serial PRIMARY KEY NOT NULL,
	"commande_id" integer NOT NULL,
	"n" integer NOT NULL,
	"envoi" date,
	"retour" date,
	"verdict" text DEFAULT 'attente' NOT NULL,
	"commentaire" text DEFAULT '' NOT NULL,
	"par" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "commande_tds_rang" UNIQUE("commande_id","n")
);
--> statement-breakpoint
ALTER TABLE "commande" ADD COLUMN "tissu_date_reelle" date;--> statement-breakpoint
ALTER TABLE "commande" ADD COLUMN "tissu_controle" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "commande" ADD COLUMN "tissu_note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "commande" ADD COLUMN "fournitures_statut" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "commande_etape" ADD CONSTRAINT "commande_etape_commande_id_commande_id_fk" FOREIGN KEY ("commande_id") REFERENCES "public"."commande"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commande_fourniture_ligne" ADD CONSTRAINT "commande_fourniture_ligne_commande_id_commande_id_fk" FOREIGN KEY ("commande_id") REFERENCES "public"."commande"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commande_journal" ADD CONSTRAINT "commande_journal_commande_id_commande_id_fk" FOREIGN KEY ("commande_id") REFERENCES "public"."commande"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commande_lancement" ADD CONSTRAINT "commande_lancement_commande_id_commande_id_fk" FOREIGN KEY ("commande_id") REFERENCES "public"."commande"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commande_tds" ADD CONSTRAINT "commande_tds_commande_id_commande_id_fk" FOREIGN KEY ("commande_id") REFERENCES "public"."commande"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "commande_four_cmd_idx" ON "commande_fourniture_ligne" USING btree ("commande_id");--> statement-breakpoint
CREATE INDEX "commande_journal_cmd_idx" ON "commande_journal" USING btree ("commande_id","ts");--> statement-breakpoint
CREATE INDEX "commande_tds_cmd_idx" ON "commande_tds" USING btree ("commande_id");