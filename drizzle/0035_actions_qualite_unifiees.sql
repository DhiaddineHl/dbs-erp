-- Simplification : un seul registre d'actions qualité, et fin des modules
-- hérités à chiffres écrits en dur.
--
-- 1. qc_action_corrective devient le registre UNIQUE des actions : celles
--    nées d'un contrôle (origine 'qc'), les fiches QRQC (origine 'qrqc') et
--    les plans d'actions (origine 'plan'). Une action peut donc exister sans
--    inspection.
-- 2. Les VRAIES fiches QRQC et lignes de plan d'actions sont recopiées dedans
--    (les lignes de démonstration du seed sont écartées, reconnues à
--    l'identique). Les inspections refusées pointent sur la nouvelle action.
-- 3. Les tables m_* (Gammes, Capacité, Costing, Ordonnancement, OF, tissus et
--    fournitures d'affichage, BE, alertes statiques, QRQC, actions) sont
--    supprimées : plus aucun écran ne les lit.

ALTER TABLE "qc_action_corrective" ALTER COLUMN "inspection_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "qc_action_corrective" ADD COLUMN "origine" text DEFAULT 'qc' NOT NULL;--> statement-breakpoint
ALTER TABLE "qc_action_corrective" ADD COLUMN "cause5m" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "qc_action_corrective" ADD COLUMN "priorite" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "qc_action_corrective" ADD COLUMN "commande_id" integer;--> statement-breakpoint
ALTER TABLE "qc_action_corrective" ADD COLUMN "of" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "qc_action_corrective" ADD COLUMN "date_ouverture" date DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "qc_action_corrective" ADD COLUMN "note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "qc_action_corrective" ADD CONSTRAINT "qc_action_corrective_commande_id_commande_id_fk" FOREIGN KEY ("commande_id") REFERENCES "public"."commande"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "qc_action_commande_idx" ON "qc_action_corrective" USING btree ("commande_id");--> statement-breakpoint

-- Actions existantes : commande, OF et date d'ouverture repris de leur inspection.
UPDATE "qc_action_corrective" a
SET "commande_id" = i."commande_id",
    "of" = COALESCE(i."of", ''),
    "date_ouverture" = COALESCE(a."created_at"::date, i."date", CURRENT_DATE)
FROM "qc_inspection" i
WHERE i."id" = a."inspection_id";--> statement-breakpoint

-- Colonne de passage : relie chaque fiche QRQC à l'action qui la remplace.
ALTER TABLE "qc_action_corrective" ADD COLUMN "legacy_qrqc_id" integer;--> statement-breakpoint

-- Fiches QRQC → actions d'origine 'qrqc'.
INSERT INTO "qc_action_corrective"
  ("inspection_id", "origine", "defaut", "cause5m", "cause", "action", "statut",
   "commande_id", "of", "date_ouverture", "note", "legacy_qrqc_id")
SELECT
  (SELECT i."id" FROM "qc_inspection" i WHERE i."qrqc_id" = q."id" ORDER BY i."id" LIMIT 1),
  'qrqc',
  q."pb",
  CASE lower(trim(q."cause"))
    WHEN 'main d''œuvre' THEN 'Main d''œuvre'
    WHEN 'main d''oeuvre' THEN 'Main d''œuvre'
    WHEN 'main-d''œuvre' THEN 'Main d''œuvre'
    WHEN 'machine' THEN 'Machine'
    WHEN 'matière' THEN 'Matière'
    WHEN 'matiere' THEN 'Matière'
    WHEN 'méthode' THEN 'Méthode'
    WHEN 'methode' THEN 'Méthode'
    WHEN 'milieu' THEN 'Milieu'
    ELSE ''
  END,
  CASE WHEN lower(trim(q."cause")) IN ('main d''œuvre', 'main d''oeuvre', 'main-d''œuvre', 'machine', 'matière', 'matiere', 'méthode', 'methode', 'milieu')
       THEN '' ELSE q."cause" END,
  q."action",
  CASE
    WHEN lower(q."statut_label") LIKE 'résolu%' OR lower(q."statut_label") LIKE 'resolu%' THEN 'cloture'
    WHEN lower(trim(q."statut_label")) = 'en cours' THEN 'en_cours'
    ELSE 'a_traiter'
  END,
  (SELECT c."id" FROM "commande" c WHERE q."cmd" <> '' AND c."of_number" = q."cmd" ORDER BY c."id" LIMIT 1),
  q."cmd",
  CASE WHEN q."date" ~ '^\d{4}-\d{2}-\d{2}$' THEN q."date"::date ELSE CURRENT_DATE END,
  CASE WHEN q."date" <> '' AND q."date" !~ '^\d{4}-\d{2}-\d{2}$' THEN 'Fiche QRQC du ' || q."date" ELSE '' END,
  q."id"
FROM "m_qrqc" q
WHERE (q."pb", q."cmd") NOT IN (
  ('Coutures décalées sur col', 'OF-2026-001'),
  ('Taux de retouches élevé', 'OF-2026-003'),
  ('Nuance tissu non conforme', 'OF-2026-004')
)
ORDER BY q."id";--> statement-breakpoint

-- Les inspections refusées pointaient sur la fiche QRQC : elles pointent
-- maintenant sur l'action qui la remplace (ou sur rien si c'était une démo).
UPDATE "qc_inspection" i
SET "qrqc_id" = (SELECT a."id" FROM "qc_action_corrective" a WHERE a."legacy_qrqc_id" = i."qrqc_id" LIMIT 1)
WHERE i."qrqc_id" IS NOT NULL;--> statement-breakpoint

ALTER TABLE "qc_action_corrective" DROP COLUMN "legacy_qrqc_id";--> statement-breakpoint

-- Plans d'actions → actions d'origine 'plan'.
INSERT INTO "qc_action_corrective"
  ("origine", "action", "responsable", "echeance", "priorite", "statut", "note")
SELECT
  'plan',
  a."action",
  a."resp",
  CASE WHEN a."echeance" ~ '^\d{4}-\d{2}-\d{2}$' THEN a."echeance"::date ELSE NULL END,
  CASE lower(trim(a."prio_label")) WHEN 'haute' THEN 'haute' WHEN 'moyenne' THEN 'moyenne' WHEN 'basse' THEN 'basse' ELSE '' END,
  CASE
    WHEN lower(a."statut_label") LIKE 'clôtur%' OR lower(a."statut_label") LIKE 'clotur%' THEN 'cloture'
    WHEN lower(trim(a."statut_label")) = 'en cours' THEN 'en_cours'
    ELSE 'a_traiter'
  END,
  CASE WHEN a."echeance" <> '' AND a."echeance" !~ '^\d{4}-\d{2}-\d{2}$' THEN 'Échéance notée : ' || a."echeance" ELSE '' END
FROM "m_action" a
WHERE (a."action", a."resp") NOT IN (
  ('Réétalonner machine boutonnière', 'M. Haddad'),
  ('Auditer fournisseur tissu denim', 'Mme Karim'),
  ('Mettre à jour gamme Polo piqué', 'Bureau Méthodes'),
  ('Formation qualité poste assemblage', 'RH Atelier')
)
ORDER BY a."id";--> statement-breakpoint

DROP TABLE "m_action" CASCADE;--> statement-breakpoint
DROP TABLE "m_alerte" CASCADE;--> statement-breakpoint
DROP TABLE "m_be" CASCADE;--> statement-breakpoint
DROP TABLE "m_capacite_chaine" CASCADE;--> statement-breakpoint
DROP TABLE "m_costing" CASCADE;--> statement-breakpoint
DROP TABLE "m_fourniture" CASCADE;--> statement-breakpoint
DROP TABLE "m_gamme" CASCADE;--> statement-breakpoint
DROP TABLE "m_of" CASCADE;--> statement-breakpoint
DROP TABLE "m_ordo" CASCADE;--> statement-breakpoint
DROP TABLE "m_qrqc" CASCADE;--> statement-breakpoint
DROP TABLE "m_tissu" CASCADE;--> statement-breakpoint

-- Droits des écrans supprimés : plus rien à piloter.
DELETE FROM "role_permission" WHERE "module_id" IN ('gammes', 'capacite', 'ordonnancement', 'ofs');
