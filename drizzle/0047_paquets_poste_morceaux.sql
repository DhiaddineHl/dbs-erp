-- 0047 — Paquets : « fini au poste », morceaux ajoutables, quantité réelle.
--
-- paquet.qte_reelle        : quantité corrigée après coup (l'imprimée reste figée)
-- paquet.morceaux_annules  : morceaux annulés (gardés dans liasses, ne comptent plus)
-- paquet_releve.poste / ouvrier / ouv_id / journee_id / heure :
--     le relevé « fini au poste » scanné dans la saisie horaire GPAO.
-- Déclencheurs :
--     · on peut AJOUTER un morceau à un paquet (la liste s'allonge, l'ordre
--       et les morceaux existants restent) — jamais en retirer ni renommer ;
--     · un relevé reste immuable, sauf le lien vers sa journée qui passe à
--       NULL si la journée est supprimée (sinon la suppression échouerait).
ALTER TABLE "paquet" ADD COLUMN "qte_reelle" integer;--> statement-breakpoint
ALTER TABLE "paquet" ADD COLUMN "morceaux_annules" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "paquet_releve" ADD COLUMN "poste" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "paquet_releve" ADD COLUMN "ouvrier" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "paquet_releve" ADD COLUMN "ouv_id" integer;--> statement-breakpoint
ALTER TABLE "paquet_releve" ADD COLUMN "journee_id" integer;--> statement-breakpoint
ALTER TABLE "paquet_releve" ADD COLUMN "heure" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "paquet_releve" ADD CONSTRAINT "paquet_releve_journee_id_journee_id_fk" FOREIGN KEY ("journee_id") REFERENCES "public"."journee"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "paquet_releve_journee_idx" ON "paquet_releve" USING btree ("journee_id");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "paquet_identite_figee"() RETURNS trigger AS $$
DECLARE
  prefixe jsonb;
BEGIN
  -- Morceaux : la nouvelle liste doit COMMENCER par l'ancienne (ajout seul).
  SELECT coalesce(jsonb_agg(e ORDER BY i), '[]'::jsonb) INTO prefixe
    FROM jsonb_array_elements(NEW."liasses") WITH ORDINALITY AS t(e, i)
    WHERE i <= jsonb_array_length(OLD."liasses");
  IF prefixe IS DISTINCT FROM OLD."liasses" THEN
    RAISE EXCEPTION 'Paquet % : un morceau s''ajoute, il ne se retire ni ne se renomme (annulez-le)', OLD."code";
  END IF;
  IF (NEW."code", NEW."commande_id", NEW."numero", NEW."taille", NEW."qte",
      NEW."piece_debut", NEW."piece_fin", NEW."created_at")
     IS DISTINCT FROM
     (OLD."code", OLD."commande_id", OLD."numero", OLD."taille", OLD."qte",
      OLD."piece_debut", OLD."piece_fin", OLD."created_at") THEN
    RAISE EXCEPTION 'Paquet % : numéro, taille, quantité imprimée et plage de pièces sont figés — l''étiquette est déjà collée (corrigez la quantité réelle)', OLD."code";
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "paquet_releve_immuable"() RETURNS trigger AS $$
BEGIN
  -- Seule exception : la journée liée est supprimée (ON DELETE SET NULL).
  IF NEW."journee_id" IS NULL AND OLD."journee_id" IS NOT NULL
     AND (to_jsonb(NEW) - 'journee_id') = (to_jsonb(OLD) - 'journee_id') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Relevé de paquet : l''historique ne se modifie pas — ajoutez un relevé, ou annulez celui-ci';
END $$ LANGUAGE plpgsql;
--> statement-breakpoint
ALTER TABLE "paquet" ADD CONSTRAINT "paquet_qte_reelle_positive" CHECK ("qte_reelle" IS NULL OR "qte_reelle" >= 0);
