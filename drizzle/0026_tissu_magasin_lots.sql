CREATE TABLE "tissu_affectation" (
	"id" serial PRIMARY KEY NOT NULL,
	"lot_id" integer NOT NULL,
	"commande_id" integer,
	"commande_label" text DEFAULT '' NOT NULL,
	"quantite" double precision DEFAULT 0 NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_by" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tissu_lot" (
	"id" serial PRIMARY KEY NOT NULL,
	"reception_id" integer NOT NULL,
	"identifiant" text NOT NULL,
	"reference" text DEFAULT '' NOT NULL,
	"couleur" text DEFAULT '' NOT NULL,
	"composition" text DEFAULT '' NOT NULL,
	"saison" text DEFAULT '' NOT NULL,
	"laize" double precision,
	"quantite_recue" double precision DEFAULT 0 NOT NULL,
	"unite" text DEFAULT 'm' NOT NULL,
	"nb_rouleaux" integer,
	"controle" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tissu_lot_identifiant_unique" UNIQUE("identifiant")
);
--> statement-breakpoint
CREATE TABLE "tissu_mouvement" (
	"id" serial PRIMARY KEY NOT NULL,
	"lot_id" integer NOT NULL,
	"sens" text NOT NULL,
	"quantite" double precision DEFAULT 0 NOT NULL,
	"commande_id" integer,
	"commande_label" text DEFAULT '' NOT NULL,
	"motif" text DEFAULT '' NOT NULL,
	"created_by" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tissu_reception" (
	"id" serial PRIMARY KEY NOT NULL,
	"numero" text DEFAULT '' NOT NULL,
	"date" date NOT NULL,
	"fournisseur" text DEFAULT '' NOT NULL,
	"client" text DEFAULT '' NOT NULL,
	"observations" text DEFAULT '' NOT NULL,
	"pieces_jointes" text DEFAULT '' NOT NULL,
	"created_by" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tissu_affectation" ADD CONSTRAINT "tissu_affectation_lot_id_tissu_lot_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."tissu_lot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tissu_affectation" ADD CONSTRAINT "tissu_affectation_commande_id_commande_id_fk" FOREIGN KEY ("commande_id") REFERENCES "public"."commande"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tissu_lot" ADD CONSTRAINT "tissu_lot_reception_id_tissu_reception_id_fk" FOREIGN KEY ("reception_id") REFERENCES "public"."tissu_reception"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tissu_mouvement" ADD CONSTRAINT "tissu_mouvement_lot_id_tissu_lot_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."tissu_lot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tissu_mouvement" ADD CONSTRAINT "tissu_mouvement_commande_id_commande_id_fk" FOREIGN KEY ("commande_id") REFERENCES "public"."commande"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tissu_affectation_lot_idx" ON "tissu_affectation" USING btree ("lot_id");--> statement-breakpoint
CREATE INDEX "tissu_affectation_cmd_idx" ON "tissu_affectation" USING btree ("commande_id");--> statement-breakpoint
CREATE INDEX "tissu_lot_reception_idx" ON "tissu_lot" USING btree ("reception_id");--> statement-breakpoint
CREATE INDEX "tissu_lot_couleur_idx" ON "tissu_lot" USING btree ("couleur");--> statement-breakpoint
CREATE INDEX "tissu_mouvement_lot_idx" ON "tissu_mouvement" USING btree ("lot_id");--> statement-breakpoint
CREATE INDEX "tissu_reception_date_idx" ON "tissu_reception" USING btree ("date");