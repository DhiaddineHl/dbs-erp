-- Messagerie interne : conversations (directes / groupes), membres, messages,
-- lectures (accusés « lu ») et présence. Tables nouvelles uniquement.
CREATE TABLE "conversation" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" text DEFAULT 'direct' NOT NULL,
	"nom" text DEFAULT '' NOT NULL,
	"cle_direct" text,
	"cree_par" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"dernier_message_le" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_cleDirect_unique" UNIQUE("cle_direct")
);
--> statement-breakpoint
CREATE TABLE "conversation_membre" (
	"conversation_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'membre' NOT NULL,
	"ajoute_le" timestamp DEFAULT now() NOT NULL,
	"parti" boolean DEFAULT false NOT NULL,
	CONSTRAINT "conversation_membre_conversation_id_user_id_pk" PRIMARY KEY("conversation_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "message" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"auteur_id" text,
	"auteur_nom" text DEFAULT '' NOT NULL,
	"genre" text DEFAULT 'texte' NOT NULL,
	"texte" text DEFAULT '' NOT NULL,
	"fichier_hash" text,
	"fichier_nom" text DEFAULT '' NOT NULL,
	"fichier_mime" text DEFAULT '' NOT NULL,
	"fichier_taille" integer DEFAULT 0 NOT NULL,
	"commande_id" integer,
	"commande_label" text DEFAULT '' NOT NULL,
	"supprime" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_lecture" (
	"message_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"lu_le" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "message_lecture_message_id_user_id_pk" PRIMARY KEY("message_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "presence" (
	"user_id" text PRIMARY KEY NOT NULL,
	"vu_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_cree_par_user_id_fk" FOREIGN KEY ("cree_par") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_membre" ADD CONSTRAINT "conversation_membre_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_membre" ADD CONSTRAINT "conversation_membre_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_auteur_id_user_id_fk" FOREIGN KEY ("auteur_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_fichier_hash_fichier_hash_fk" FOREIGN KEY ("fichier_hash") REFERENCES "public"."fichier"("hash") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_commande_id_commande_id_fk" FOREIGN KEY ("commande_id") REFERENCES "public"."commande"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_lecture" ADD CONSTRAINT "message_lecture_message_id_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_lecture" ADD CONSTRAINT "message_lecture_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presence" ADD CONSTRAINT "presence_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversation_dernier_idx" ON "conversation" USING btree ("dernier_message_le");--> statement-breakpoint
CREATE INDEX "conversation_membre_user_idx" ON "conversation_membre" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "message_conversation_idx" ON "message" USING btree ("conversation_id","id");--> statement-breakpoint
CREATE INDEX "message_lecture_user_idx" ON "message_lecture" USING btree ("user_id");