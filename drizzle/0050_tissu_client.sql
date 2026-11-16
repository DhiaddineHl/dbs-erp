-- 0050 — Magasin tissu : le client d'une réception devient la FICHE client.
--
-- Avant : un nom tapé librement (« Lacost », « LACOSTE »…) ; une faute
-- suffisait à rendre un lot orphelin (pas proposé aux commandes du client,
-- absent de son portail). Désormais `client_id` pointe la fiche Clients.
-- La colonne `client` (le nom saisi à l'époque) est GARDÉE telle quelle.
--
-- Rattachement automatique des réceptions existantes : seulement quand le
-- nom saisi correspond à UNE SEULE fiche (casse, accents, espaces ignorés).
-- Les autres restent à rattacher à la main (Magasin tissu → Lots →
-- « À rattacher ») : rien n'est deviné.
ALTER TABLE "tissu_reception" ADD COLUMN "client_id" integer;--> statement-breakpoint
ALTER TABLE "tissu_reception" ADD CONSTRAINT "tissu_reception_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tissu_reception_client_idx" ON "tissu_reception" USING btree ("client_id");--> statement-breakpoint
WITH norm AS (
  SELECT id, lower(regexp_replace(btrim(translate(nom,
    'ÀÁÂÃÄÅàáâãäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕÖòóôõöÙÚÛÜùúûüÇçÑñ',
    'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn')), '\s+', ' ', 'g')) AS cle
  FROM client
),
uniques AS (
  SELECT cle, min(id) AS id FROM norm GROUP BY cle HAVING count(*) = 1
)
UPDATE tissu_reception r
SET client_id = u.id
FROM uniques u
WHERE r.client_id IS NULL
  AND btrim(r.client) <> ''
  AND lower(regexp_replace(btrim(translate(r.client,
    'ÀÁÂÃÄÅàáâãäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕÖòóôõöÙÚÛÜùúûüÇçÑñ',
    'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn')), '\s+', ' ', 'g')) = u.cle;
