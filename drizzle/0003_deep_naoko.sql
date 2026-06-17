ALTER TABLE "m_commande" ADD COLUMN "ref_article" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "m_commande" ADD COLUMN "couleur" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "m_commande" ADD COLUMN "tailles" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "m_commande" ADD COLUMN "recept_tissu" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "m_commande" ADD COLUMN "date_export_reel" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "m_commande" ADD COLUMN "note" text DEFAULT '' NOT NULL;