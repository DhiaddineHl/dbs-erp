CREATE TABLE "qc_checklist" (
	"id" serial PRIMARY KEY NOT NULL,
	"nom" text NOT NULL,
	"type_produit" text DEFAULT '' NOT NULL,
	"type_controle" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qc_checklist_point" (
	"id" serial PRIMARY KEY NOT NULL,
	"checklist_id" integer NOT NULL,
	"ordre" integer DEFAULT 0 NOT NULL,
	"label" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qc_checklist_reponse" (
	"id" serial PRIMARY KEY NOT NULL,
	"inspection_id" integer NOT NULL,
	"ordre" integer DEFAULT 0 NOT NULL,
	"label" text NOT NULL,
	"statut" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "qc_checklist_point" ADD CONSTRAINT "qc_checklist_point_checklist_id_qc_checklist_id_fk" FOREIGN KEY ("checklist_id") REFERENCES "public"."qc_checklist"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qc_checklist_reponse" ADD CONSTRAINT "qc_checklist_reponse_inspection_id_qc_inspection_id_fk" FOREIGN KEY ("inspection_id") REFERENCES "public"."qc_inspection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "qc_checklist_point_idx" ON "qc_checklist_point" USING btree ("checklist_id");--> statement-breakpoint
CREATE INDEX "qc_checklist_rep_insp_idx" ON "qc_checklist_reponse" USING btree ("inspection_id");