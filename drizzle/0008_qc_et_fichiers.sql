CREATE TABLE "fichier" (
	"hash" text PRIMARY KEY NOT NULL,
	"mime" text DEFAULT 'application/octet-stream' NOT NULL,
	"taille" integer DEFAULT 0 NOT NULL,
	"data" "bytea" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qc_bareme" (
	"id" serial PRIMARY KEY NOT NULL,
	"nom" text NOT NULL,
	"client" text DEFAULT '' NOT NULL,
	"refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tailles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qc_bareme_point" (
	"id" serial PRIMARY KEY NOT NULL,
	"bareme_id" integer NOT NULL,
	"ordre" integer DEFAULT 0 NOT NULL,
	"label" text NOT NULL,
	"tolerance" double precision DEFAULT 0 NOT NULL,
	"valeurs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "qc_bareme_point_ordre" UNIQUE("bareme_id","ordre")
);
--> statement-breakpoint
CREATE TABLE "qc_defaut" (
	"id" serial PRIMARY KEY NOT NULL,
	"inspection_id" integer NOT NULL,
	"famille" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"gravite" text DEFAULT 'majeur' NOT NULL,
	"nombre" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qc_inspection" (
	"id" serial PRIMARY KEY NOT NULL,
	"numero" integer NOT NULL,
	"date" date NOT NULL,
	"commande_id" integer,
	"of" text DEFAULT '' NOT NULL,
	"client" text DEFAULT '' NOT NULL,
	"modele" text DEFAULT '' NOT NULL,
	"ref" text DEFAULT '' NOT NULL,
	"couleur" text DEFAULT '' NOT NULL,
	"faconnier" text DEFAULT '' NOT NULL,
	"lot" integer DEFAULT 0 NOT NULL,
	"controleur" text DEFAULT '' NOT NULL,
	"statut" text DEFAULT 'brouillon' NOT NULL,
	"verdict_force" text DEFAULT '' NOT NULL,
	"verdict_cloture" text DEFAULT '' NOT NULL,
	"date_cloture" date,
	"note" text DEFAULT '' NOT NULL,
	"qrqc_id" integer,
	"recontrole_de_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "qc_inspection_numero_unique" UNIQUE("numero")
);
--> statement-breakpoint
CREATE TABLE "qc_mesure" (
	"id" serial PRIMARY KEY NOT NULL,
	"inspection_id" integer NOT NULL,
	"point" text DEFAULT '' NOT NULL,
	"taille" text DEFAULT '' NOT NULL,
	"spec" double precision,
	"tolerance" double precision,
	"mesure" double precision,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qc_photo" (
	"id" serial PRIMARY KEY NOT NULL,
	"inspection_id" integer NOT NULL,
	"defaut_id" integer,
	"hash" text NOT NULL,
	"legende" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "qc_bareme_point" ADD CONSTRAINT "qc_bareme_point_bareme_id_qc_bareme_id_fk" FOREIGN KEY ("bareme_id") REFERENCES "public"."qc_bareme"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qc_defaut" ADD CONSTRAINT "qc_defaut_inspection_id_qc_inspection_id_fk" FOREIGN KEY ("inspection_id") REFERENCES "public"."qc_inspection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qc_inspection" ADD CONSTRAINT "qc_inspection_commande_id_commande_id_fk" FOREIGN KEY ("commande_id") REFERENCES "public"."commande"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qc_inspection" ADD CONSTRAINT "qc_inspection_recontrole_de_id_qc_inspection_id_fk" FOREIGN KEY ("recontrole_de_id") REFERENCES "public"."qc_inspection"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qc_mesure" ADD CONSTRAINT "qc_mesure_inspection_id_qc_inspection_id_fk" FOREIGN KEY ("inspection_id") REFERENCES "public"."qc_inspection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qc_photo" ADD CONSTRAINT "qc_photo_inspection_id_qc_inspection_id_fk" FOREIGN KEY ("inspection_id") REFERENCES "public"."qc_inspection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qc_photo" ADD CONSTRAINT "qc_photo_defaut_id_qc_defaut_id_fk" FOREIGN KEY ("defaut_id") REFERENCES "public"."qc_defaut"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qc_photo" ADD CONSTRAINT "qc_photo_hash_fichier_hash_fk" FOREIGN KEY ("hash") REFERENCES "public"."fichier"("hash") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "qc_defaut_insp_idx" ON "qc_defaut" USING btree ("inspection_id");--> statement-breakpoint
CREATE INDEX "qc_inspection_cmd_idx" ON "qc_inspection" USING btree ("commande_id");--> statement-breakpoint
CREATE INDEX "qc_inspection_statut_idx" ON "qc_inspection" USING btree ("statut");--> statement-breakpoint
CREATE INDEX "qc_mesure_insp_idx" ON "qc_mesure" USING btree ("inspection_id");--> statement-breakpoint
CREATE INDEX "qc_photo_insp_idx" ON "qc_photo" USING btree ("inspection_id");