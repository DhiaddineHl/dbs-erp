-- Bascule du magasin tissu par commande (commande_tissu_ligne) vers le modèle
-- physique par lots. Ne supprime rien : la table d'origine reste en place, on
-- en RECOPIE le contenu dans le nouveau modèle. Idempotent : ne réimporte pas
-- une ligne déjà migrée (repère via un identifiant de lot déterministe).
--
-- Pour chaque ligne de tissu existante qui a une matière nommée ou un métrage :
--   1) un bon de réception (un par ligne, daté de la réception réelle ou du jour)
--   2) un lot identifiable (identifiant = MIGR-<id ligne>, unique et stable)
--   3) un mouvement d'entrée traçant la réception initiale
--   4) une affectation à la commande d'origine (métrage prévu, ou reçu à défaut)

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
);

-- 2) lots ---------------------------------------------------------------------
-- On relie chaque lot à la réception créée juste au-dessus par son numéro.
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
JOIN "tissu_reception" r ON r."numero" = 'MIGR-' || l."id"
WHERE NOT EXISTS (
  SELECT 1 FROM "tissu_lot" x WHERE x."identifiant" = 'MIGR-' || l."id"
);

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

-- 4) affectation à la commande d'origine --------------------------------------
-- On réserve le métrage prévu (ou le reçu si le prévu est vide) à la commande
-- dont la ligne provenait — c'est la meilleure reconstitution de l'intention.
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
