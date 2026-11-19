-- 0053 — Magasin produits finis : stock par taille.
--
-- magasin_mouvement.tailles : rangement par taille d'une entrée (1er choix
--                             d'une livraison d'atelier, entrée de production
--                             interne après contrôle et finition).
-- bl_ligne.tailles          : pièces livrées par taille.
-- Vide = non ventilé (les mouvements anciens le restent : rien n'est deviné).
ALTER TABLE "bl_ligne" ADD COLUMN "tailles" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "magasin_mouvement" ADD COLUMN "tailles" jsonb DEFAULT '{}'::jsonb NOT NULL;