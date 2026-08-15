ALTER TABLE "operation" ADD COLUMN "source" text DEFAULT '' NOT NULL;--> statement-breakpoint
-- Les statuts du personnel passent de deux valeurs à quatre (active, absente,
-- conge, sortie), comme dans l'application d'origine : une absence ou un congé
-- sont temporaires et ne doivent pas retirer la personne des listes de saisie,
-- ce que « inactive » ne permettait pas d'exprimer.
UPDATE "personnel" SET "statut" = 'sortie' WHERE "statut" = 'inactive';--> statement-breakpoint
UPDATE "personnel" SET "statut" = 'active' WHERE "statut" NOT IN ('active', 'absente', 'conge', 'sortie');
