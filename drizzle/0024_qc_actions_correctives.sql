CREATE TABLE "qc_action_corrective" (
	"id" serial PRIMARY KEY NOT NULL,
	"inspection_id" integer NOT NULL,
	"defaut_id" integer,
	"defaut" text DEFAULT '' NOT NULL,
	"cause" text DEFAULT '' NOT NULL,
	"action" text DEFAULT '' NOT NULL,
	"responsable" text DEFAULT '' NOT NULL,
	"echeance" date,
	"statut" text DEFAULT 'a_traiter' NOT NULL,
	"photo_avant" text,
	"photo_apres" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "qc_action_corrective" ADD CONSTRAINT "qc_action_corrective_inspection_id_qc_inspection_id_fk" FOREIGN KEY ("inspection_id") REFERENCES "public"."qc_inspection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qc_action_corrective" ADD CONSTRAINT "qc_action_corrective_defaut_id_qc_defaut_id_fk" FOREIGN KEY ("defaut_id") REFERENCES "public"."qc_defaut"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qc_action_corrective" ADD CONSTRAINT "qc_action_corrective_photo_avant_fichier_hash_fk" FOREIGN KEY ("photo_avant") REFERENCES "public"."fichier"("hash") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qc_action_corrective" ADD CONSTRAINT "qc_action_corrective_photo_apres_fichier_hash_fk" FOREIGN KEY ("photo_apres") REFERENCES "public"."fichier"("hash") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "qc_action_insp_idx" ON "qc_action_corrective" USING btree ("inspection_id");