CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"impersonated_by" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"role" text DEFAULT 'analyst',
	"banned" boolean DEFAULT false,
	"ban_reason" text,
	"ban_expires" timestamp,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "client" (
	"key" text PRIMARY KEY NOT NULL,
	"nom" text NOT NULL,
	"adresse" text DEFAULT '' NOT NULL,
	"livraison" text DEFAULT '' NOT NULL,
	"marque" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "faconnier" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "faconnier_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "facture" (
	"id" serial PRIMARY KEY NOT NULL,
	"num" text NOT NULL,
	"type" text NOT NULL,
	"date" text NOT NULL,
	"client_key" text,
	"marque" text DEFAULT '' NOT NULL,
	"client_raw" text DEFAULT '' NOT NULL,
	"pieces" integer DEFAULT 0 NOT NULL,
	"total" double precision DEFAULT 0 NOT NULL,
	"fournitures" double precision DEFAULT 0 NOT NULL,
	"poids" text DEFAULT '' NOT NULL,
	"mp" text DEFAULT '' NOT NULL,
	"incoterm" text DEFAULT '' NOT NULL,
	"paiement" text DEFAULT '' NOT NULL,
	"matieres" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "facture_num_type" UNIQUE("num","type")
);
--> statement-breakpoint
CREATE TABLE "facture_cost_line" (
	"id" serial PRIMARY KEY NOT NULL,
	"facture_id" integer NOT NULL,
	"line_idx" integer NOT NULL,
	"lieu" text DEFAULT '' NOT NULL,
	"faconnier" text DEFAULT '' NOT NULL,
	"cout" double precision,
	CONSTRAINT "cost_line_facture_idx" UNIQUE("facture_id","line_idx")
);
--> statement-breakpoint
CREATE TABLE "facture_extra" (
	"id" serial PRIMARY KEY NOT NULL,
	"facture_id" integer NOT NULL,
	"label" text NOT NULL,
	"mt" double precision DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "facture_ligne" (
	"id" serial PRIMARY KEY NOT NULL,
	"facture_id" integer NOT NULL,
	"idx" integer NOT NULL,
	"modele" text DEFAULT '' NOT NULL,
	"desig" text DEFAULT '' NOT NULL,
	"ref" text DEFAULT '' NOT NULL,
	"couleur" text DEFAULT '' NOT NULL,
	"qte" integer DEFAULT 0 NOT NULL,
	"pu" double precision DEFAULT 0 NOT NULL,
	"mt" double precision DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chaine" (
	"id" serial PRIMARY KEY NOT NULL,
	"nom" text NOT NULL,
	"chef" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journee" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" text NOT NULL,
	"chaine_id" integer NOT NULL,
	"modele_id" integer NOT NULL,
	"effectif" integer DEFAULT 0 NOT NULL,
	"nb_heures" integer DEFAULT 8 NOT NULL,
	"cloture" boolean DEFAULT false NOT NULL,
	"obj_manuel" double precision,
	"cols" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sortie" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ops" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ret" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ops_sam" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ops_poste" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ops_detail" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "modele" (
	"id" serial PRIMARY KEY NOT NULL,
	"nom" text NOT NULL,
	"ref" text DEFAULT '' NOT NULL,
	"client" text DEFAULT '' NOT NULL,
	"sam" integer DEFAULT 1800 NOT NULL,
	"qte" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ouvriere" (
	"id" serial PRIMARY KEY NOT NULL,
	"chaine_id" integer NOT NULL,
	"nom" text NOT NULL,
	"poste" text DEFAULT '' NOT NULL,
	"sam" integer DEFAULT 100 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_setting" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permission" (
	"role" text NOT NULL,
	"module_id" text NOT NULL,
	"allowed" boolean DEFAULT true NOT NULL,
	CONSTRAINT "role_permission_role_module_id_pk" PRIMARY KEY("role","module_id")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facture" ADD CONSTRAINT "facture_client_key_client_key_fk" FOREIGN KEY ("client_key") REFERENCES "public"."client"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facture_cost_line" ADD CONSTRAINT "facture_cost_line_facture_id_facture_id_fk" FOREIGN KEY ("facture_id") REFERENCES "public"."facture"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facture_extra" ADD CONSTRAINT "facture_extra_facture_id_facture_id_fk" FOREIGN KEY ("facture_id") REFERENCES "public"."facture"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facture_ligne" ADD CONSTRAINT "facture_ligne_facture_id_facture_id_fk" FOREIGN KEY ("facture_id") REFERENCES "public"."facture"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journee" ADD CONSTRAINT "journee_chaine_id_chaine_id_fk" FOREIGN KEY ("chaine_id") REFERENCES "public"."chaine"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journee" ADD CONSTRAINT "journee_modele_id_modele_id_fk" FOREIGN KEY ("modele_id") REFERENCES "public"."modele"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ouvriere" ADD CONSTRAINT "ouvriere_chaine_id_chaine_id_fk" FOREIGN KEY ("chaine_id") REFERENCES "public"."chaine"("id") ON DELETE cascade ON UPDATE no action;