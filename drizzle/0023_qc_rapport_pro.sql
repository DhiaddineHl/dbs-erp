ALTER TABLE "qc_defaut" ADD COLUMN "emplacement" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "qc_inspection" ADD COLUMN "saison" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "qc_inspection" ADD COLUMN "type_controle" text DEFAULT 'final' NOT NULL;--> statement-breakpoint
ALTER TABLE "qc_inspection" ADD COLUMN "qte_commande" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "qc_inspection" ADD COLUMN "qte_produite" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "qc_inspection" ADD COLUMN "qte_controlee" integer DEFAULT 0 NOT NULL;