CREATE TABLE "operation" (
	"id" serial PRIMARY KEY NOT NULL,
	"nom" text NOT NULL,
	"sam" integer DEFAULT 0 NOT NULL,
	"archive" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "personnel" (
	"id" serial PRIMARY KEY NOT NULL,
	"matricule" text NOT NULL,
	"nom" text NOT NULL,
	"fonction" text DEFAULT '' NOT NULL,
	"atelier" text DEFAULT '' NOT NULL,
	"statut" text DEFAULT 'active' NOT NULL,
	"date_entree" date,
	"portail_cle" text NOT NULL,
	CONSTRAINT "personnel_matricule_unique" UNIQUE("matricule"),
	CONSTRAINT "personnel_portailCle_unique" UNIQUE("portail_cle")
);
--> statement-breakpoint
CREATE TABLE "activity_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"ts" timestamp DEFAULT now() NOT NULL,
	"user_id" text,
	"user_name" text DEFAULT '' NOT NULL,
	"role" text DEFAULT '' NOT NULL,
	"action" text NOT NULL,
	"cible" text DEFAULT '' NOT NULL,
	"detail" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role" (
	"key" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"color" text DEFAULT '#64748b' NOT NULL,
	"builtin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ouvriere" ADD COLUMN "personnel_id" integer;--> statement-breakpoint
CREATE INDEX "operation_archive_idx" ON "operation" USING btree ("archive");--> statement-breakpoint
CREATE INDEX "personnel_statut_idx" ON "personnel" USING btree ("statut");--> statement-breakpoint
CREATE INDEX "activity_ts_idx" ON "activity_log" USING btree ("ts");--> statement-breakpoint
CREATE INDEX "activity_action_idx" ON "activity_log" USING btree ("action");--> statement-breakpoint
ALTER TABLE "ouvriere" ADD CONSTRAINT "ouvriere_personnel_id_personnel_id_fk" FOREIGN KEY ("personnel_id") REFERENCES "public"."personnel"("id") ON DELETE set null ON UPDATE no action;