CREATE TABLE "fourniture_catalogue" (
	"id" serial PRIMARY KEY NOT NULL,
	"designation" text NOT NULL,
	"unite" text DEFAULT 'pcs' NOT NULL,
	"qte_defaut" double precision DEFAULT 0 NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "fourniture_catalogue_desig" UNIQUE("designation")
);
