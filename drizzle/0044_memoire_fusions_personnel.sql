-- Mémoire des fusions de fiches personnel (ancienne fiche → fiche gardée) :
-- l'historique ouvrière rattache les journées anciennes à la fiche actuelle.
-- Table nouvelle uniquement ; aucune journée GPAO modifiée.
CREATE TABLE "personnel_fusion" (
	"ancien_id" integer PRIMARY KEY NOT NULL,
	"garde_id" integer NOT NULL,
	"ancien_nom" text DEFAULT '' NOT NULL,
	"ancien_matricule" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
