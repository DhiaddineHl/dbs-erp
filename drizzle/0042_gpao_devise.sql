-- Devise du prix de vente saisi à la main sur un modèle GPAO (les prix
-- existants étaient en euros).
ALTER TABLE "modele" ADD COLUMN "prix_manuel_devise" text DEFAULT 'EUR' NOT NULL;