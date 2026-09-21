ALTER TABLE "chaine" ADD COLUMN "effectif" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
-- Amorçage : à défaut d'effectif de référence saisi, on part du nombre de
-- fiches ouvrières existantes de chaque chaîne (valeur ajustable ensuite).
-- N'écrase rien d'historique : la table journee garde son propre effectif.
UPDATE "chaine" c
SET "effectif" = sub.n
FROM (SELECT "chaine_id" AS cid, COUNT(*)::int AS n FROM "ouvriere" GROUP BY "chaine_id") sub
WHERE sub.cid = c."id" AND c."effectif" = 0;