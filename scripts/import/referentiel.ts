import { eq } from "drizzle-orm";
import { db, schema } from "./db";
import { Rapport, type Sauvegarde, nombreOuNull } from "./source";
import { slugClient } from "@/lib/domain/commande";

const { client, faconnier } = schema;

/* Clients et façonniers.
 *
 * La clé métier d'un client est son slug (« GÉRARD DAREL » → gerard_darel) :
 * c'est elle que portent les factures, et elle survit à un changement de casse
 * ou d'accent. Le référentiel du fichier de facturation a déjà créé une partie
 * des lignes ; on complète sans écraser ce qui est déjà renseigné. */

export type IndexReferentiel = {
  clientsParNom: Map<string, number>;
  faconniersParNom: Map<string, number>;
};

const cle = (s: string) => s.trim().toLowerCase();

export async function importerReferentiel(src: Sauvegarde, r: Rapport): Promise<IndexReferentiel> {
  r.etape("Référentiel");

  let clientsCrees = 0;
  let clientsCompletes = 0;

  for (const c of src.clients) {
    const nom = r.texte(c.nom);
    if (!nom) continue;
    const key = slugClient(nom);

    const [existant] = await db.select().from(client).where(eq(client.key, key));
    const champs = {
      nom,
      code: r.texte(c.code),
      contact: r.texte(c.contact),
      email: r.texte(c.email),
      tel: r.texte(c.tel),
      ville: r.texte(c.ville),
      pays: r.texte(c.pays),
      tva: r.texte(c.tva),
      adresse: r.texte(c.adresse),
    };

    if (!existant) {
      await db.insert(client).values({ key, ...champs });
      clientsCrees++;
      continue;
    }

    /* Le client existe déjà (créé par le référentiel de facturation, qui porte
     * la marque et l'adresse de livraison). On ne remplace que les champs
     * vides : l'import complète, il n'écrase pas. */
    const patch: Record<string, string> = {};
    for (const [k, v] of Object.entries(champs)) {
      if (!v) continue;
      const actuel = (existant as unknown as Record<string, string>)[k];
      if (!actuel) patch[k] = v;
    }
    if (Object.keys(patch).length) {
      await db.update(client).set(patch).where(eq(client.id, existant.id));
      clientsCompletes++;
    }
  }

  r.ok("clients créés", clientsCrees);
  r.ok("clients complétés", clientsCompletes, "champs vides seulement");

  let faconniersCrees = 0;
  let faconniersCompletes = 0;

  for (const f of src.faconniers) {
    const nom = r.texte(f.nom);
    if (!nom) continue;
    const [existant] = await db.select().from(faconnier).where(eq(faconnier.nom, nom));
    const champs = {
      specialite: r.texte(f.specialite),
      contact: r.texte(f.contact),
      tel: r.texte(f.tel),
      prixFacon: nombreOuNull(f.prix_facon),
    };

    if (!existant) {
      await db.insert(faconnier).values({ nom, ...champs });
      faconniersCrees++;
      continue;
    }
    const patch: Record<string, unknown> = {};
    if (champs.specialite && !existant.specialite) patch.specialite = champs.specialite;
    if (champs.contact && !existant.contact) patch.contact = champs.contact;
    if (champs.tel && !existant.tel) patch.tel = champs.tel;
    if (champs.prixFacon !== null && existant.prixFacon === null) patch.prixFacon = champs.prixFacon;
    if (Object.keys(patch).length) {
      await db.update(faconnier).set(patch).where(eq(faconnier.id, existant.id));
      faconniersCompletes++;
    }
  }

  r.ok("façonniers créés", faconniersCrees);
  r.ok("façonniers complétés", faconniersCompletes);

  return indexer();
}

/** Index nom → id, insensible à la casse, pour rattacher les commandes. */
export async function indexer(): Promise<IndexReferentiel> {
  const [clients, faconniers] = await Promise.all([
    db.select({ id: client.id, nom: client.nom, key: client.key }).from(client),
    db.select({ id: faconnier.id, nom: faconnier.nom }).from(faconnier),
  ]);

  const clientsParNom = new Map<string, number>();
  for (const c of clients) {
    clientsParNom.set(cle(c.nom), c.id);
    // Le slug sert de repli : les commandes citent parfois la clé, pas le nom.
    clientsParNom.set(c.key, c.id);
    clientsParNom.set(slugClient(c.nom), c.id);
  }

  const faconniersParNom = new Map<string, number>();
  for (const f of faconniers) faconniersParNom.set(cle(f.nom), f.id);

  return { clientsParNom, faconniersParNom };
}

export const trouverClient = (idx: IndexReferentiel, nom: string): number | null =>
  idx.clientsParNom.get(cle(nom)) ?? idx.clientsParNom.get(slugClient(nom)) ?? null;

export const trouverFaconnier = (idx: IndexReferentiel, nom: string): number | null =>
  idx.faconniersParNom.get(cle(nom)) ?? null;

/* Certaines commandes citent un client ou un façonnier absent du référentiel :
 * « UN JOUR AILLEUR » et « LAURENCE BRAS » côté clients, « DBS » côté
 * façonniers — la production interne, que l'ancien système notait comme un
 * sous-traitant. Les laisser sans rattachement viderait leur nom des écrans ;
 * on crée la fiche manquante et on la signale. */

export async function assurerClient(idx: IndexReferentiel, nom: string, crees: Set<string>): Promise<number | null> {
  const existant = trouverClient(idx, nom);
  if (existant !== null) return existant;
  const key = slugClient(nom);
  if (!key) return null;
  const [ligne] = await db
    .insert(client)
    .values({ key, nom })
    .onConflictDoUpdate({ target: client.key, set: { nom } })
    .returning({ id: client.id });
  idx.clientsParNom.set(cle(nom), ligne.id);
  idx.clientsParNom.set(key, ligne.id);
  crees.add(nom);
  return ligne.id;
}

export async function assurerFaconnier(idx: IndexReferentiel, nom: string, crees: Set<string>): Promise<number | null> {
  const existant = trouverFaconnier(idx, nom);
  if (existant !== null) return existant;
  if (!nom.trim()) return null;
  const [ligne] = await db
    .insert(faconnier)
    .values({ nom })
    .onConflictDoUpdate({ target: faconnier.nom, set: { nom } })
    .returning({ id: faconnier.id });
  idx.faconniersParNom.set(cle(nom), ligne.id);
  crees.add(nom);
  return ligne.id;
}
