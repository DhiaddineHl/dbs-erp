ALTER TABLE "journee" ADD COLUMN "ouvrieres" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
-- Reprise : chaque journée déjà enregistrée fige l'effectif actuel de sa chaîne.
-- C'est ce que l'application affichait jusqu'ici, donc rien ne change à l'écran ;
-- mais à partir de maintenant ces journées ne bougeront plus quand la chaîne
-- évoluera. Une chaîne encore vide laisse la journée sur '[]', qui retombe à la
-- lecture sur l'effectif de la chaîne — le comportement d'avant.
UPDATE "journee" j
SET "ouvrieres" = COALESCE((
  SELECT jsonb_agg(
           jsonb_build_object(
             'id', o."id",
             'nom', o."nom",
             'poste', o."poste",
             'sam', o."sam",
             'personnelId', o."personnel_id"
           ) ORDER BY o."id"
         )
  FROM "ouvriere" o
  WHERE o."chaine_id" = j."chaine_id"
), '[]'::jsonb)
WHERE j."ouvrieres" = '[]'::jsonb;
