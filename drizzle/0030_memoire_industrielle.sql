-- ════════════════════════════════════════════════════════════════════════
-- BLOC 2 — Fondation de la mémoire industrielle.
-- Migration ADDITIVE uniquement : aucune table supprimée, aucune colonne
-- retirée, toutes les nouvelles colonnes sont NULLABLE. Rien ne casse
-- l'existant ; les données présentes restent valides.
-- ════════════════════════════════════════════════════════════════════════

-- ── Référence industrielle DBS ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "reference_industrielle" (
  "id" serial PRIMARY KEY NOT NULL,
  "cle" text NOT NULL,
  "client" text DEFAULT '' NOT NULL,
  "ref_article" text DEFAULT '' NOT NULL,
  "modele" text DEFAULT '' NOT NULL,
  "sam_dbs" integer,
  "sam_dbs_par" text DEFAULT '' NOT NULL,
  "sam_dbs_date" date,
  "note" text DEFAULT '' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "reference_industrielle_cle_unique" UNIQUE("cle")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reference_client_idx" ON "reference_industrielle" ("client");
--> statement-breakpoint

-- ── Historique SAM par série ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "sam_serie" (
  "id" serial PRIMARY KEY NOT NULL,
  "reference_id" integer NOT NULL,
  "commande_id" integer,
  "libelle" text DEFAULT '' NOT NULL,
  "sam_theorique" integer,
  "sam_constate" integer,
  "pieces" integer DEFAULT 0 NOT NULL,
  "rendement_moyen" integer,
  "source" text DEFAULT 'auto' NOT NULL,
  "date" date,
  "note" text DEFAULT '' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sam_serie_ref_idx" ON "sam_serie" ("reference_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sam_serie_cmd_idx" ON "sam_serie" ("commande_id");
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "sam_serie" ADD CONSTRAINT "sam_serie_reference_id_fk"
    FOREIGN KEY ("reference_id") REFERENCES "reference_industrielle"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "sam_serie" ADD CONSTRAINT "sam_serie_commande_id_fk"
    FOREIGN KEY ("commande_id") REFERENCES "commande"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

-- ── Rattachements OF ↔ référence, OF ↔ journée ───────────────────────────
ALTER TABLE "commande" ADD COLUMN IF NOT EXISTS "reference_id" integer;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "commande" ADD CONSTRAINT "commande_reference_id_fk"
    FOREIGN KEY ("reference_id") REFERENCES "reference_industrielle"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "commande_reference_idx" ON "commande" ("reference_id");
--> statement-breakpoint
ALTER TABLE "journee" ADD COLUMN IF NOT EXISTS "commande_id" integer;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "journee" ADD CONSTRAINT "journee_commande_id_fk"
    FOREIGN KEY ("commande_id") REFERENCES "commande"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "journee_commande_idx" ON "journee" ("commande_id");
--> statement-breakpoint

-- ── Arrêts / temps non productifs ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "journee_arret" (
  "id" serial PRIMARY KEY NOT NULL,
  "journee_id" integer NOT NULL,
  "poste" text DEFAULT '' NOT NULL,
  "debut" text DEFAULT '' NOT NULL,
  "fin" text DEFAULT '' NOT NULL,
  "duree_min" double precision DEFAULT 0 NOT NULL,
  "cause" text DEFAULT 'autre' NOT NULL,
  "commentaire" text DEFAULT '' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "journee_arret_journee_idx" ON "journee_arret" ("journee_id");
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "journee_arret" ADD CONSTRAINT "journee_arret_journee_id_fk"
    FOREIGN KEY ("journee_id") REFERENCES "journee"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

-- ── Façonnier : rattachement de la réception + confiage ──────────────────
ALTER TABLE "br" ADD COLUMN IF NOT EXISTS "faconnier_id" integer;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "br" ADD CONSTRAINT "br_faconnier_id_fk"
    FOREIGN KEY ("faconnier_id") REFERENCES "faconnier"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "faconnier_confiage" (
  "id" serial PRIMARY KEY NOT NULL,
  "commande_id" integer NOT NULL,
  "faconnier_id" integer,
  "faconnier" text DEFAULT '' NOT NULL,
  "qte_confiee" integer DEFAULT 0 NOT NULL,
  "qte_expediee" integer DEFAULT 0 NOT NULL,
  "date_confiee" date,
  "date_retour_prevue" date,
  "prix_facon" double precision,
  "note" text DEFAULT '' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "confiage_commande_idx" ON "faconnier_confiage" ("commande_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "confiage_faconnier_idx" ON "faconnier_confiage" ("faconnier_id");
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "faconnier_confiage" ADD CONSTRAINT "confiage_commande_id_fk"
    FOREIGN KEY ("commande_id") REFERENCES "commande"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "faconnier_confiage" ADD CONSTRAINT "confiage_faconnier_id_fk"
    FOREIGN KEY ("faconnier_id") REFERENCES "faconnier"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

-- ── Config technique figée au lancement + versions de plan ───────────────
ALTER TABLE "commande_lancement" ADD COLUMN IF NOT EXISTS "version_patronage" integer;
--> statement-breakpoint
ALTER TABLE "commande_lancement" ADD COLUMN IF NOT EXISTS "version_tds" integer;
--> statement-breakpoint
ALTER TABLE "commande_lancement" ADD COLUMN IF NOT EXISTS "version_plan" integer;
--> statement-breakpoint
ALTER TABLE "commande_lancement" ADD COLUMN IF NOT EXISTS "conso_fige" double precision;
--> statement-breakpoint
ALTER TABLE "commande_lancement" ADD COLUMN IF NOT EXISTS "sam_fige" integer;
--> statement-breakpoint
ALTER TABLE "commande_lancement" ADD COLUMN IF NOT EXISTS "config_snapshot" jsonb;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "commande_plan_version" (
  "id" serial PRIMARY KEY NOT NULL,
  "commande_id" integer NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "par" text DEFAULT '' NOT NULL,
  "motif" text DEFAULT '' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "commande_plan_version_rang" UNIQUE("commande_id","version")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "commande_plan_version_cmd_idx" ON "commande_plan_version" ("commande_id");
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "commande_plan_version" ADD CONSTRAINT "commande_plan_version_commande_id_fk"
    FOREIGN KEY ("commande_id") REFERENCES "commande"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;
