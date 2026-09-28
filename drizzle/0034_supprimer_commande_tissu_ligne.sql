-- Suppression définitive de commande_tissu_ligne (ancien magasin tissu par
-- commande), remplacé depuis la 0027 par le magasin par LOTS (tissu_reception
-- → tissu_lot → tissu_affectation). La 0027 avait déjà tout recopié à son
-- exécution ; ce qui suit rejoue la même reprise, à l'identique et de façon
-- idempotente (mêmes identifiants MIGR-<id>), au cas où des lignes auraient
-- été ajoutées depuis — puis supprime la table pour de bon. Zéro perte
-- garantie : rien n'est droppé avant d'avoir été reconfirmé migré.

-- Une ligne est déjà reprise si son lot MIGR-<id> OU sa réception MIGR-<id>
-- existe : le lot a pu être renommé ou supprimé à l'écran depuis la 0027 (la
-- réception, elle, reste). Sans ce second repère, on recréait une réception
-- MIGR-<id> en double, puis deux lots MIGR-<id> → violation d'unicité.

-- 1) réceptions ---------------------------------------------------------------
INSERT INTO "tissu_reception" ("numero", "date", "fournisseur", "client", "observations", "created_by", "created_at")
SELECT
  'MIGR-' || l."id",
  COALESCE(c."tissu_date_reelle", CURRENT_DATE),
  '',
  '',
  'Repris automatiquement du magasin tissu par commande (' || COALESCE(NULLIF(c."of_number", ''), 'OF ?') || ')',
  'migration',
  now()
FROM "commande_tissu_ligne" l
JOIN "commande" c ON c."id" = l."commande_id"
WHERE NOT EXISTS (
  SELECT 1 FROM "tissu_lot" x WHERE x."identifiant" = 'MIGR-' || l."id"
)
AND NOT EXISTS (
  SELECT 1 FROM "tissu_reception" x WHERE x."numero" = 'MIGR-' || l."id"
);
--> statement-breakpoint

-- 2) lots ---------------------------------------------------------------------
-- Uniquement pour les réceptions créées juste au-dessus (now() = début de la
-- transaction de migration) : un lot renommé ou supprimé n'est pas recréé.
INSERT INTO "tissu_lot"
  ("reception_id", "identifiant", "reference", "couleur", "laize", "quantite_recue", "unite", "controle", "note", "created_at")
SELECT
  r."id",
  'MIGR-' || l."id",
  l."reference",
  l."couleur",
  l."laize",
  GREATEST(COALESCE(l."metrage_recu", 0), 0),
  'm',
  l."controle",
  NULLIF(TRIM(COALESCE(l."nom", '') || CASE WHEN COALESCE(l."note", '') <> '' THEN ' — ' || l."note" ELSE '' END), ''),
  now()
FROM "commande_tissu_ligne" l
JOIN "tissu_reception" r ON r."numero" = 'MIGR-' || l."id" AND r."created_at" = now()
WHERE NOT EXISTS (
  SELECT 1 FROM "tissu_lot" x WHERE x."identifiant" = 'MIGR-' || l."id"
);
--> statement-breakpoint

-- 3) mouvement d'entrée (trace de la réception initiale) ----------------------
INSERT INTO "tissu_mouvement" ("lot_id", "sens", "quantite", "motif", "created_by", "created_at")
SELECT
  lot."id",
  'entree',
  lot."quantite_recue",
  'Réception initiale (reprise)',
  'migration',
  now()
FROM "tissu_lot" lot
WHERE lot."identifiant" LIKE 'MIGR-%'
  AND lot."quantite_recue" > 0
  AND NOT EXISTS (
    SELECT 1 FROM "tissu_mouvement" m WHERE m."lot_id" = lot."id" AND m."sens" = 'entree'
  );
--> statement-breakpoint

-- 4) affectation à la commande d'origine --------------------------------------
INSERT INTO "tissu_affectation" ("lot_id", "commande_id", "commande_label", "quantite", "note", "created_by", "created_at")
SELECT
  lot."id",
  l."commande_id",
  COALESCE(NULLIF(c."of_number", ''), '') || ' ' || COALESCE(c."modele", ''),
  GREATEST(COALESCE(NULLIF(l."metrage_prevu", 0), l."metrage_recu", 0), 0),
  'Affectation reprise du magasin par commande',
  'migration',
  now()
FROM "commande_tissu_ligne" l
JOIN "tissu_lot" lot ON lot."identifiant" = 'MIGR-' || l."id"
JOIN "commande" c ON c."id" = l."commande_id"
WHERE GREATEST(COALESCE(NULLIF(l."metrage_prevu", 0), l."metrage_recu", 0), 0) > 0
  AND NOT EXISTS (
    SELECT 1 FROM "tissu_affectation" a WHERE a."lot_id" = lot."id"
  );
--> statement-breakpoint

-- 5) plus aucune ligne à reprendre : la table peut disparaître pour de bon.
DROP TABLE "commande_tissu_ligne" CASCADE;
