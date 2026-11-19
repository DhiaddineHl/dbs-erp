import { boolean, date, doublePrecision, index, integer, jsonb, pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";
import { br, coupeFiche } from "./aval";
import { tissuMouvement } from "./tissu";
import { commande } from "./commande";
import { conversation } from "./messagerie";
import { client, faconnier } from "./referentiel";

/* PORTAILS EXTÉRIEURS — clients et sous-traitants.
 *
 * Un ACCÈS = une personne extérieure (l'acheteuse de tel client, le patron de
 * tel atelier). Elle entre par un lien ou un QR qui porte une clé longue et
 * aléatoire, sans compte ni mot de passe ; un PIN peut s'y ajouter (toujours
 * pour un sous-traitant). Un accès se coupe ou se regénère sans toucher aux
 * autres personnes du même client.
 *
 * Ce que chaque portail montre est une LISTE FERMÉE de champs, construite
 * dans lib/services/portail-*.ts : jamais une ligne de la base telle quelle.
 * Le portail client ne voit jamais un sous-traitant ; le portail
 * sous-traitant ne voit jamais un prix de vente ni une marge. */
export const portailAcces = pgTable(
  "portail_acces",
  {
    id: serial().primaryKey(),
    /** Clé opaque de l'URL (…/portail/c/<cle>) — longue, aléatoire, unique. */
    cle: text().notNull().unique(),
    /** client | soustraitant */
    type: text().notNull(),
    clientId: integer().references(() => client.id, { onDelete: "set null" }),
    faconnierId: integer().references(() => faconnier.id, { onDelete: "set null" }),
    /** Qui utilise cet accès (« Marie — acheteuse »), pour s'y retrouver. */
    nom: text().notNull().default(""),
    /** PIN haché (scrypt) ; "" = pas de PIN. */
    pinHash: text().notNull().default(""),
    /** Change à chaque nouveau PIN : les téléphones mémorisés se déconnectent. */
    pinVersion: integer().notNull().default(1),
    echecs: integer().notNull().default(0),
    bloqueJusqua: timestamp(),
    actif: boolean().notNull().default(true),
    /** Fil de la Messagerie où arrivent ses questions et vos réponses. */
    conversationId: integer().references(() => conversation.id, { onDelete: "set null" }),
    creePar: text().notNull().default(""),
    createdAt: timestamp().notNull().defaultNow(),
    derniereVisite: timestamp(),
    nbVisites: integer().notNull().default(0),
  },
  (t) => [index("portail_acces_client_idx").on(t.clientId), index("portail_acces_faconnier_idx").on(t.faconnierId)],
);

/** Journal de ce qui se passe sur un portail : visites, questions, décisions,
 * OK / refus d'échantillon. On n'efface rien. */
export const portailEvenement = pgTable(
  "portail_evenement",
  {
    id: serial().primaryKey(),
    accesId: integer()
      .notNull()
      .references(() => portailAcces.id, { onDelete: "cascade" }),
    /** visite | question | decision | echantillon | pin_echec | … */
    type: text().notNull(),
    commandeId: integer().references(() => commande.id, { onDelete: "set null" }),
    detail: text().notNull().default(""),
    createdAt: timestamp().notNull().defaultNow(),
  },
  (t) => [index("portail_evenement_acces_idx").on(t.accesId, t.id)],
);

/** UN POINT PAR JOUR : l'avancement que voit un client est figé à la
 * première consultation de la journée, pour toutes ses commandes à la fois.
 * Ainsi une commande faite chez nous ne « bouge » pas d'heure en heure quand
 * une autre ne bouge qu'une fois par jour — la différence ne se voit pas. */
export const portailPoint = pgTable(
  "portail_point",
  {
    id: serial().primaryKey(),
    clientId: integer()
      .notNull()
      .references(() => client.id, { onDelete: "cascade" }),
    jour: date().notNull(),
    /** commandeId → { etapes, avancement, feu } (liste fermée, déjà calculée). */
    donnees: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp().notNull().defaultNow(),
  },
  (t) => [unique("portail_point_jour").on(t.clientId, t.jour)],
);

/* ═══════════ PORTAIL SOUS-TRAITANT ═══════════
 *
 * Ce que le sous-traitant DÉCLARE. Rien ici ne compte comme production :
 * `commande.produit` reste calculé par la sortie de chaîne et par les BR
 * (lib/services/avancement.ts). Une déclaration devient réalité seulement
 * quand VOUS validez — la livraison crée alors le BR habituel. */

/** Saisie du soir : quantités CUMULÉES lancées, produites, emballées.
 * Journal : on ajoute, on ne modifie pas ; la dernière ligne du jour fait foi. */
export const stDeclaration = pgTable(
  "st_declaration",
  {
    id: serial().primaryKey(),
    accesId: integer().references(() => portailAcces.id, { onDelete: "set null" }),
    faconnierId: integer()
      .notNull()
      .references(() => faconnier.id, { onDelete: "cascade" }),
    commandeId: integer()
      .notNull()
      .references(() => commande.id, { onDelete: "cascade" }),
    jour: date().notNull(),
    lance: integer().notNull().default(0),
    produit: integer().notNull().default(0),
    emballe: integer().notNull().default(0),
    /** Contrôles automatiques au moment de la saisie (« produit > lancé »…). */
    alertes: jsonb().$type<string[]>().notNull().default([]),
    note: text().notNull().default(""),
    par: text().notNull().default(""),
    createdAt: timestamp().notNull().defaultNow(),
  },
  (t) => [index("st_declaration_cmd_idx").on(t.commandeId, t.jour)],
);

/** Livraison annoncée par le sous-traitant, par taille, 1er / 2e choix.
 * À l'arrivée, vous la validez (en corrigeant si besoin) : le BR se crée. */
export const stLivraison = pgTable(
  "st_livraison",
  {
    id: serial().primaryKey(),
    /** LST-AAAA-NNN — imprimé avec son QR sur le bon du sous-traitant. */
    numero: text().notNull().unique(),
    accesId: integer().references(() => portailAcces.id, { onDelete: "set null" }),
    faconnierId: integer()
      .notNull()
      .references(() => faconnier.id, { onDelete: "cascade" }),
    commandeId: integer()
      .notNull()
      .references(() => commande.id, { onDelete: "cascade" }),
    /** annoncee | recue | annulee */
    statut: text().notNull().default("annoncee"),
    /** Déclaré : [{ taille, premier, second }]. */
    lignes: jsonb().$type<{ taille: string; premier: number; second: number }[]>().notNull().default([]),
    /** Compté à l'arrivée (rempli à la validation). */
    lignesRecues: jsonb().$type<{ taille: string; premier: number; second: number }[]>().notNull().default([]),
    /** Motif des écarts avec le plan / la coupe (manquant, défaut, reste à livrer…). */
    motif: text().notNull().default(""),
    note: text().notNull().default(""),
    par: text().notNull().default(""),
    annonceeLe: timestamp().notNull().defaultNow(),
    recueLe: timestamp(),
    recuePar: text().notNull().default(""),
    brId: integer().references(() => br.id, { onDelete: "set null" }),
  },
  (t) => [index("st_livraison_statut_idx").on(t.statut), index("st_livraison_cmd_idx").on(t.commandeId)],
);

/** Le sous-traitant confirme la réception d'un rouleau que vous lui avez
 * envoyé (mouvement de sortie), ou signale un écart. Le stock ne bouge pas :
 * c'est à vous de décider (correction tracée au magasin tissu). */
export const stReceptionTissu = pgTable(
  "st_reception_tissu",
  {
    id: serial().primaryKey(),
    accesId: integer().references(() => portailAcces.id, { onDelete: "set null" }),
    mouvementId: integer()
      .notNull()
      .references(() => tissuMouvement.id, { onDelete: "cascade" }),
    /** recu | ecart | manquant */
    etat: text().notNull().default("recu"),
    metrageConstate: doublePrecision(),
    note: text().notNull().default(""),
    par: text().notNull().default(""),
    createdAt: timestamp().notNull().defaultNow(),
  },
  (t) => [index("st_reception_tissu_mvt_idx").on(t.mouvementId)],
);

/** Rapport de coupe du sous-traitant : vous le validez, il devient une
 * fiche de coupe (consommation et chute des rouleaux, comme chez vous). */
export const stRapportCoupe = pgTable(
  "st_rapport_coupe",
  {
    id: serial().primaryKey(),
    accesId: integer().references(() => portailAcces.id, { onDelete: "set null" }),
    faconnierId: integer()
      .notNull()
      .references(() => faconnier.id, { onDelete: "cascade" }),
    /** Commande porteuse (celle du plan de coupe). */
    commandeId: integer()
      .notNull()
      .references(() => commande.id, { onDelete: "cascade" }),
    /** annonce | valide | refuse */
    statut: text().notNull().default("annonce"),
    /** Pièces coupées : OF (id) → taille → qté. */
    coupe: jsonb().$type<Record<string, Record<string, number>>>().notNull().default({}),
    /** Par rouleau : consommé, chute, reste (le reste = retour attendu). */
    rouleaux: jsonb().$type<{ code: string; consomme: number; chute: number; reste: number }[]>().notNull().default([]),
    /** Constats pour le « Résultat de coupe » client (laize, 2e choix, défauts). */
    constats: jsonb()
      .$type<{ laize: number | null; second: Record<string, Record<string, number>>; rouleaux: { code: string; defaut: string; manquant: number }[] }>()
      .notNull()
      .default({ laize: null, second: {}, rouleaux: [] }),
    note: text().notNull().default(""),
    par: text().notNull().default(""),
    createdAt: timestamp().notNull().defaultNow(),
    traiteLe: timestamp(),
    traitePar: text().notNull().default(""),
    motifRefus: text().notNull().default(""),
    ficheId: integer().references(() => coupeFiche.id, { onDelete: "set null" }),
  },
  (t) => [index("st_rapport_coupe_statut_idx").on(t.statut)],
);

/* ═══════════ PRÉVISION D'EXPORT PUBLIÉE AUX CLIENTS ═══════════
 *
 * Chaque week-end, vous publiez la prévision des deux semaines à venir : une
 * PHOTO figée (ce que le client lit ne bouge plus jusqu'à la publication
 * suivante). Republier la même période crée une version de plus : l'ancienne
 * reste en base, rien n'est écrasé. */
export const exportPrevision = pgTable(
  "export_prevision",
  {
    id: serial().primaryKey(),
    /** Lundi de la première semaine couverte. */
    debut: date().notNull(),
    /** Dimanche de la dernière semaine couverte. */
    fin: date().notNull(),
    version: integer().notNull().default(1),
    /** Mot libre par client : { "<clientId>": "transport groupé vendredi" }. */
    commentaires: jsonb().$type<Record<string, string>>().notNull().default({}),
    publieLe: timestamp().notNull().defaultNow(),
    publiePar: text().notNull().default(""),
  },
  (t) => [unique("export_prevision_periode_version").on(t.debut, t.version)],
);

export const exportPrevisionLigne = pgTable(
  "export_prevision_ligne",
  {
    id: serial().primaryKey(),
    previsionId: integer()
      .notNull()
      .references(() => exportPrevision.id, { onDelete: "cascade" }),
    clientId: integer().references(() => client.id, { onDelete: "set null" }),
    /** Commande telle que le client la connaît (la tête du groupe). */
    commandeId: integer().references(() => commande.id, { onDelete: "set null" }),
    of: text().notNull().default(""),
    modele: text().notNull().default(""),
    reference: text().notNull().default(""),
    couleur: text().notNull().default(""),
    /** Date d'export prévue (null pour une ligne « retirée » de la prévision). */
    date: date(),
    qte: integer().notNull().default(0),
    qteCommande: integer().notNull().default(0),
    /** prete | emballage | production */
    etat: text().notNull().default(""),
    /** nouvelle | inchangee | avancee | reportee | quantite | retiree */
    changement: text().notNull().default(""),
    dateAvant: date(),
    qteAvant: integer(),
  },
  (t) => [index("export_prevision_ligne_prev_idx").on(t.previsionId), index("export_prevision_ligne_client_idx").on(t.clientId)],
);
