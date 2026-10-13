/* PAQUETS DE COUPE — suivi physique de la coupe à l'assemblage.
 *
 * Le paquet naît à la validation d'une fiche de coupe et meurt à
 * l'assemblage. Après, ce sont des pièces entières finies : c'est le circuit
 * actuel (sortie de chaîne, contrôle, magasin) qui prend le relais.
 *
 * AUCUNE de ces tables n'entre dans le comptage de la production :
 * `produit`, `coupe_qte` et `magasin_qte` gardent leurs sources
 * d'aujourd'hui. Le suivi par paquets observe et signale ; il ne compte pas,
 * et il n'empêche jamais rien d'avancer.
 *
 * Les relevés sont un JOURNAL : on n'efface pas, on annule. L'état d'un
 * paquet est dérivé de ce journal, jamais stocké. */
CREATE TABLE "liasse_gabarit" (
	"id" serial PRIMARY KEY NOT NULL,
	"nom" text NOT NULL,
	"liasses" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"archive" text DEFAULT '' NOT NULL,
	"created_by" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "liasse_gabarit_nom_unique" UNIQUE("nom")
);
--> statement-breakpoint
CREATE TABLE "paquet" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"commande_id" integer NOT NULL,
	"fiche_id" integer,
	"numero" integer NOT NULL,
	"taille" text DEFAULT '' NOT NULL,
	"modele" text DEFAULT '' NOT NULL,
	"couleur" text DEFAULT '' NOT NULL,
	"of_number" text DEFAULT '' NOT NULL,
	"qte" integer DEFAULT 0 NOT NULL,
	"piece_debut" integer DEFAULT 0 NOT NULL,
	"piece_fin" integer DEFAULT 0 NOT NULL,
	"liasses" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"statut" text DEFAULT 'actif' NOT NULL,
	"annule_le" timestamp,
	"annule_par" text DEFAULT '' NOT NULL,
	"motif_annulation" text DEFAULT '' NOT NULL,
	"created_by" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "paquet_code_unique" UNIQUE("code"),
	CONSTRAINT "paquet_numero_of" UNIQUE("commande_id","numero")
);
--> statement-breakpoint
CREATE TABLE "paquet_releve" (
	"id" serial PRIMARY KEY NOT NULL,
	"paquet_id" integer NOT NULL,
	"liasse" text DEFAULT '' NOT NULL,
	"etape" text NOT NULL,
	"qte" integer,
	"note" text DEFAULT '' NOT NULL,
	"date" date NOT NULL,
	"annule_id" integer,
	"created_by" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "commande_plan" ADD COLUMN "liasses" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "paquet" ADD CONSTRAINT "paquet_commande_id_commande_id_fk" FOREIGN KEY ("commande_id") REFERENCES "public"."commande"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paquet" ADD CONSTRAINT "paquet_fiche_id_coupe_fiche_id_fk" FOREIGN KEY ("fiche_id") REFERENCES "public"."coupe_fiche"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paquet_releve" ADD CONSTRAINT "paquet_releve_paquet_id_paquet_id_fk" FOREIGN KEY ("paquet_id") REFERENCES "public"."paquet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "paquet_commande_idx" ON "paquet" USING btree ("commande_id");--> statement-breakpoint
CREATE INDEX "paquet_fiche_idx" ON "paquet" USING btree ("fiche_id");--> statement-breakpoint
CREATE INDEX "paquet_statut_idx" ON "paquet" USING btree ("statut");--> statement-breakpoint
CREATE INDEX "paquet_releve_paquet_idx" ON "paquet_releve" USING btree ("paquet_id","id");--> statement-breakpoint
CREATE INDEX "paquet_releve_date_idx" ON "paquet_releve" USING btree ("date");
--> statement-breakpoint
-- Code du QR, unique dans l'usine (PQ-2026-000145), comme pour les rouleaux.
CREATE SEQUENCE IF NOT EXISTS "paquet_seq" START 1;--> statement-breakpoint

-- Identité d'un paquet figée : ce qui est imprimé sur l'étiquette ne change
-- plus. Seuls le statut et l'annulation restent modifiables.
CREATE OR REPLACE FUNCTION "paquet_identite_figee"() RETURNS trigger AS $$
BEGIN
  IF (NEW."code", NEW."commande_id", NEW."numero", NEW."taille", NEW."qte",
      NEW."piece_debut", NEW."piece_fin", NEW."liasses", NEW."created_at")
     IS DISTINCT FROM
     (OLD."code", OLD."commande_id", OLD."numero", OLD."taille", OLD."qte",
      OLD."piece_debut", OLD."piece_fin", OLD."liasses", OLD."created_at") THEN
    RAISE EXCEPTION 'Paquet % : numéro, taille, quantité, plage de pièces et liasses sont figés — l''étiquette est déjà collée', OLD."code";
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "paquet_identite_figee" BEFORE UPDATE ON "paquet"
  FOR EACH ROW EXECUTE FUNCTION "paquet_identite_figee"();--> statement-breakpoint

-- Un relevé ne se modifie pas : on en ajoute un autre, ou on l'annule.
CREATE OR REPLACE FUNCTION "paquet_releve_immuable"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Relevé de paquet : l''historique ne se modifie pas — ajoutez un relevé, ou annulez celui-ci';
END $$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "paquet_releve_immuable" BEFORE UPDATE ON "paquet_releve"
  FOR EACH ROW EXECUTE FUNCTION "paquet_releve_immuable"();--> statement-breakpoint

-- Un paquet contient au moins une pièce, et la plage est cohérente.
ALTER TABLE "paquet" ADD CONSTRAINT "paquet_qte_positive" CHECK ("qte" > 0 AND "piece_fin" >= "piece_debut");
