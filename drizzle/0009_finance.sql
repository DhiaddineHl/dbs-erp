CREATE TABLE "compte_bancaire" (
	"id" serial PRIMARY KEY NOT NULL,
	"libelle" text NOT NULL,
	"ordre" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "compte_bancaire_libelle_unique" UNIQUE("libelle")
);
--> statement-breakpoint
CREATE TABLE "fournisseur_compte" (
	"id" serial PRIMARY KEY NOT NULL,
	"nom" text NOT NULL,
	"categorie" text DEFAULT 'Divers' NOT NULL,
	"devise" text DEFAULT 'TND' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "fournisseur_compte_nom_unique" UNIQUE("nom")
);
--> statement-breakpoint
CREATE TABLE "fournisseur_transaction" (
	"id" serial PRIMARY KEY NOT NULL,
	"compte_id" integer NOT NULL,
	"date" date NOT NULL,
	"libelle" text DEFAULT '' NOT NULL,
	"debit" double precision DEFAULT 0 NOT NULL,
	"credit" double precision DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reglement" (
	"id" serial PRIMARY KEY NOT NULL,
	"facture_id" integer NOT NULL,
	"date" date NOT NULL,
	"montant" double precision DEFAULT 0 NOT NULL,
	"mode" text DEFAULT 'Virement' NOT NULL,
	"compte_id" integer,
	"ref" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fournisseur_transaction" ADD CONSTRAINT "fournisseur_transaction_compte_id_fournisseur_compte_id_fk" FOREIGN KEY ("compte_id") REFERENCES "public"."fournisseur_compte"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reglement" ADD CONSTRAINT "reglement_facture_id_facture_id_fk" FOREIGN KEY ("facture_id") REFERENCES "public"."facture"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reglement" ADD CONSTRAINT "reglement_compte_id_compte_bancaire_id_fk" FOREIGN KEY ("compte_id") REFERENCES "public"."compte_bancaire"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fourn_tx_compte_idx" ON "fournisseur_transaction" USING btree ("compte_id");--> statement-breakpoint
CREATE INDEX "fourn_tx_date_idx" ON "fournisseur_transaction" USING btree ("date");--> statement-breakpoint
CREATE INDEX "reglement_facture_idx" ON "reglement" USING btree ("facture_id");--> statement-breakpoint
CREATE INDEX "reglement_date_idx" ON "reglement" USING btree ("date");