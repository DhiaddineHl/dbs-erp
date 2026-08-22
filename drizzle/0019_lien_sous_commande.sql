ALTER TABLE "commande" ADD COLUMN "lien_parent" text DEFAULT '' NOT NULL;--> statement-breakpoint
-- Tout rattachement antérieur est une découpe : le regroupement n'existait pas.
UPDATE "commande" SET "lien_parent" = 'decoupe' WHERE "parent_id" IS NOT NULL;
