-- Devise sur les commandes, factures et BL ; TVA saisie à l'émission des
-- factures et BL (0 % par défaut) ; historique des taux de change (pivot TND).
CREATE TABLE "taux_change" (
	"id" serial PRIMARY KEY NOT NULL,
	"devise" text NOT NULL,
	"date" date NOT NULL,
	"taux" double precision NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "taux_change_devise_date" UNIQUE("devise","date")
);
--> statement-breakpoint
ALTER TABLE "bl" ADD COLUMN "devise" text DEFAULT 'EUR' NOT NULL;--> statement-breakpoint
ALTER TABLE "bl" ADD COLUMN "taux_tva" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "commande" ADD COLUMN "devise" text DEFAULT 'EUR' NOT NULL;--> statement-breakpoint
ALTER TABLE "facture" ADD COLUMN "devise" text DEFAULT 'EUR' NOT NULL;--> statement-breakpoint
ALTER TABLE "facture" ADD COLUMN "taux_tva" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "facture" ADD COLUMN "montant_tva" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "facture" ADD COLUMN "total_ttc" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Les factures existantes étaient toutes HT sans TVA : TTC = HT.
UPDATE "facture" SET "total_ttc" = "total";
--> statement-breakpoint
-- Premier taux EUR repris du paramètre « tauxEur » du grand livre (3,34 à défaut).
INSERT INTO "taux_change" ("devise", "date", "taux")
SELECT 'EUR', DATE '2026-01-01',
       COALESCE((SELECT ("value" #>> '{}')::double precision FROM "app_setting" WHERE "key" = 'tauxEur'), 3.34)
ON CONFLICT DO NOTHING;
