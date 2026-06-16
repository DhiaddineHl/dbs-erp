CREATE TABLE "m_action" (
	"id" serial PRIMARY KEY NOT NULL,
	"action" text NOT NULL,
	"resp" text DEFAULT '' NOT NULL,
	"echeance" text DEFAULT '' NOT NULL,
	"prio_tone" text DEFAULT 'neutral' NOT NULL,
	"prio_label" text DEFAULT '' NOT NULL,
	"statut_tone" text DEFAULT 'neutral' NOT NULL,
	"statut_label" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "m_alerte" (
	"id" serial PRIMARY KEY NOT NULL,
	"icon_name" text DEFAULT 'AlertCircle' NOT NULL,
	"tone" text DEFAULT 'neutral' NOT NULL,
	"title" text NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"level_tone" text DEFAULT 'neutral' NOT NULL,
	"level_label" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "m_archive" (
	"id" serial PRIMARY KEY NOT NULL,
	"of" text NOT NULL,
	"modele" text NOT NULL,
	"client" text NOT NULL,
	"qte" integer DEFAULT 0 NOT NULL,
	"ca" text DEFAULT '' NOT NULL,
	"marge" text DEFAULT '' NOT NULL,
	"livre" text DEFAULT '' NOT NULL,
	"retard_tone" text DEFAULT 'neutral' NOT NULL,
	"retard_label" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "m_be" (
	"id" serial PRIMARY KEY NOT NULL,
	"of" text NOT NULL,
	"mc" text NOT NULL,
	"envoi" text DEFAULT '' NOT NULL,
	"ok" text DEFAULT '' NOT NULL,
	"ref" text DEFAULT '' NOT NULL,
	"statut_tone" text DEFAULT 'neutral' NOT NULL,
	"statut_label" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "m_bl" (
	"id" serial PRIMARY KEY NOT NULL,
	"bl" text NOT NULL,
	"date" text NOT NULL,
	"client" text NOT NULL,
	"lignes" integer DEFAULT 0 NOT NULL,
	"qte" integer DEFAULT 0 NOT NULL,
	"total" text DEFAULT '' NOT NULL,
	"statut_tone" text DEFAULT 'neutral' NOT NULL,
	"statut_label" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "m_br" (
	"id" serial PRIMARY KEY NOT NULL,
	"br" text NOT NULL,
	"date" text NOT NULL,
	"facon" text NOT NULL,
	"cmd" text NOT NULL,
	"recu" integer DEFAULT 0 NOT NULL,
	"oknc" text DEFAULT '' NOT NULL,
	"controle_tone" text DEFAULT 'neutral' NOT NULL,
	"controle_label" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "m_capacite_chaine" (
	"id" serial PRIMARY KEY NOT NULL,
	"ch" text NOT NULL,
	"eff" integer DEFAULT 0 NOT NULL,
	"min" text DEFAULT '' NOT NULL,
	"modele" text DEFAULT '' NOT NULL,
	"cap" text DEFAULT '' NOT NULL,
	"cout" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "m_client" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"nom" text NOT NULL,
	"contact" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"ville" text DEFAULT '' NOT NULL,
	"cmd" integer DEFAULT 0 NOT NULL,
	"ca" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "m_commande" (
	"id" serial PRIMARY KEY NOT NULL,
	"of" text NOT NULL,
	"modele" text NOT NULL,
	"client" text NOT NULL,
	"assigne" text DEFAULT '' NOT NULL,
	"qte" integer DEFAULT 0 NOT NULL,
	"pv" text DEFAULT '' NOT NULL,
	"pf" text DEFAULT '' NOT NULL,
	"marge" text DEFAULT '' NOT NULL,
	"export" text DEFAULT '' NOT NULL,
	"retard_tone" text DEFAULT 'neutral' NOT NULL,
	"retard_label" text DEFAULT '' NOT NULL,
	"av" integer DEFAULT 0 NOT NULL,
	"statut_tone" text DEFAULT 'neutral' NOT NULL,
	"statut_label" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "m_costing" (
	"id" serial PRIMARY KEY NOT NULL,
	"of" text NOT NULL,
	"modele" text NOT NULL,
	"qte" integer DEFAULT 0 NOT NULL,
	"sam" text DEFAULT '' NOT NULL,
	"cout_p" text DEFAULT '' NOT NULL,
	"cout_t" text DEFAULT '' NOT NULL,
	"pf" text DEFAULT '' NOT NULL,
	"ecart_tone" text DEFAULT 'neutral' NOT NULL,
	"ecart_label" text DEFAULT '' NOT NULL,
	"delai" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "m_coupe" (
	"id" serial PRIMARY KEY NOT NULL,
	"of" text NOT NULL,
	"mc" text NOT NULL,
	"qte" integer DEFAULT 0 NOT NULL,
	"coupee" integer DEFAULT 0 NOT NULL,
	"planif" text DEFAULT '' NOT NULL,
	"fin" text DEFAULT '' NOT NULL,
	"statut_tone" text DEFAULT 'neutral' NOT NULL,
	"statut_label" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "m_faconnier" (
	"id" serial PRIMARY KEY NOT NULL,
	"nom" text NOT NULL,
	"spec" text DEFAULT '' NOT NULL,
	"contact" text DEFAULT '' NOT NULL,
	"tel" text DEFAULT '' NOT NULL,
	"prix" text DEFAULT '' NOT NULL,
	"cmd" integer DEFAULT 0 NOT NULL,
	"charge" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "m_fourniture" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" text NOT NULL,
	"cmd" text NOT NULL,
	"type" text NOT NULL,
	"design" text NOT NULL,
	"qte" text DEFAULT '' NOT NULL,
	"controle_tone" text DEFAULT 'neutral' NOT NULL,
	"controle_label" text DEFAULT '' NOT NULL,
	"statut_tone" text DEFAULT 'neutral' NOT NULL,
	"statut_label" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "m_gamme" (
	"id" serial PRIMARY KEY NOT NULL,
	"modele" text NOT NULL,
	"ops" integer DEFAULT 0 NOT NULL,
	"sam" text DEFAULT '' NOT NULL,
	"cout" text DEFAULT '' NOT NULL,
	"cap" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "m_magasin" (
	"id" serial PRIMARY KEY NOT NULL,
	"of" text NOT NULL,
	"mc" text NOT NULL,
	"source_tone" text DEFAULT 'neutral' NOT NULL,
	"source_label" text DEFAULT '' NOT NULL,
	"cmd" integer DEFAULT 0 NOT NULL,
	"recu" integer DEFAULT 0 NOT NULL,
	"statut_tone" text DEFAULT 'neutral' NOT NULL,
	"statut_label" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "m_of" (
	"id" serial PRIMARY KEY NOT NULL,
	"of" text NOT NULL,
	"article" text NOT NULL,
	"chaine" text DEFAULT '' NOT NULL,
	"qte" integer DEFAULT 0 NOT NULL,
	"prod" integer DEFAULT 0 NOT NULL,
	"debut" text DEFAULT '' NOT NULL,
	"fin" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "m_ordo" (
	"id" serial PRIMARY KEY NOT NULL,
	"rang" integer DEFAULT 0 NOT NULL,
	"prio_tone" text DEFAULT 'neutral' NOT NULL,
	"prio_label" text DEFAULT '' NOT NULL,
	"of" text NOT NULL,
	"mc" text NOT NULL,
	"qte" integer DEFAULT 0 NOT NULL,
	"sam" text DEFAULT '' NOT NULL,
	"charge" text DEFAULT '' NOT NULL,
	"assigne" text DEFAULT '' NOT NULL,
	"export" text DEFAULT '' NOT NULL,
	"crit_tone" text DEFAULT 'neutral' NOT NULL,
	"crit_label" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "m_qrqc" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" text NOT NULL,
	"pb" text NOT NULL,
	"cause" text DEFAULT '' NOT NULL,
	"cmd" text DEFAULT '' NOT NULL,
	"action" text DEFAULT '' NOT NULL,
	"statut_tone" text DEFAULT 'neutral' NOT NULL,
	"statut_label" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "m_tissu" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" text NOT NULL,
	"cmd" text NOT NULL,
	"design" text NOT NULL,
	"recue" integer DEFAULT 0 NOT NULL,
	"prevue" integer DEFAULT 0 NOT NULL,
	"ecart_tone" text DEFAULT 'neutral' NOT NULL,
	"ecart_label" text DEFAULT '' NOT NULL,
	"controle_tone" text DEFAULT 'neutral' NOT NULL,
	"controle_label" text DEFAULT '' NOT NULL,
	"statut_tone" text DEFAULT 'neutral' NOT NULL,
	"statut_label" text DEFAULT '' NOT NULL
);
