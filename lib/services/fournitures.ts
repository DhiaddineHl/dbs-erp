import "server-only";
import { and, asc, desc, eq, inArray, isNotNull, like } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  client,
  commande,
  commandeFournitureLigne,
  commandeLancement,
  fournitureNomenclature,
  fournitureReception,
  fournitureReceptionLigne,
  fournitureReste,
} from "@/lib/db/schema";
import * as biz from "@/lib/domain/commande";
import * as fo from "@/lib/domain/fournitures";
import { type Auteur, journaliserFiche, type Tx } from "@/lib/services/journal-fiche";
import { getSetting } from "@/lib/services/permissions";

/* Magasin fournitures — nomenclature par modèle, réceptions par bon client,
 * restes, demandes au client, liste d'achat DBS, relances.
 *
 * La ligne de fourniture d'une commande (commande_fourniture_ligne) reste LA
 * vérité du feu « fournitures » : tout ce qui suit l'alimente —
 *   - la nomenclature du modèle calcule son « prévu » ;
 *   - un bon de réception client crédite son « reçu » (et se défait) ;
 *   - un reste réutilisé la crédite aussi.
 * Aucun second compteur : l'écran commande et le feu disent toujours la même
 * chose que les nouveaux écrans. */

const aujourdhui = () => new Date().toISOString().slice(0, 10);
const r2 = (n: number) => Math.round(n * 100) / 100;
const normDesig = (s: string) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/* ═══════════ commandes « porteuses » actives ═══════════ */

type CommandePorteuse = {
  id: number;
  of: string;
  modele: string;
  refArticle: string;
  couleur: string;
  client: string;
  cle: string;
  pieces: number;
  dateExport: string;
  lancee: boolean;
};

/** Les commandes qui portent leurs fournitures (un OF rattaché est porté par
 * son porteur), non archivées, avec les pièces à couvrir (groupe compris). */
async function commandesPorteuses(ex: Pick<typeof db, "select"> = db): Promise<CommandePorteuse[]> {
  const rows = await ex
    .select({ c: commande, clientNom: client.nom })
    .from(commande)
    .leftJoin(client, eq(commande.clientId, client.id))
    .where(eq(commande.archived, false))
    .orderBy(asc(commande.id));
  const lancees = new Set((await ex.select({ id: commandeLancement.commandeId }).from(commandeLancement)).map((l) => l.id));
  const enfants = new Map<number, (typeof rows)[number]["c"][]>();
  for (const { c } of rows) {
    if (c.parentId == null) continue;
    const l = enfants.get(c.parentId) ?? [];
    l.push(c);
    enfants.set(c.parentId, l);
  }
  const ids = new Set(rows.map((r) => r.c.id));
  return rows
    .filter(({ c }) => c.parentId == null || !ids.has(c.parentId))
    .filter(({ c }) => !biz.estLivree(c))
    .map(({ c, clientNom }) => ({
      id: c.id,
      of: c.ofNumber,
      modele: c.modele,
      refArticle: c.refArticle,
      couleur: c.couleur,
      client: clientNom ?? "",
      cle: fo.cleModele(c.refArticle, c.modele),
      pieces: biz.totauxGroupe(c, enfants.get(c.id) ?? []).qte,
      dateExport: c.dateExport ?? "",
      lancee: lancees.has(c.id),
    }));
}

/* ═══════════ nomenclature par modèle ═══════════ */

export type LigneNomenclature = typeof fournitureNomenclature.$inferSelect;

export type ModeleNomenclature = {
  cle: string;
  label: string;
  clients: string[];
  commandes: { id: number; of: string; pieces: number; lancee: boolean }[];
  lignes: LigneNomenclature[];
};

export async function listNomenclatures(): Promise<ModeleNomenclature[]> {
  const [lignes, cmds] = await Promise.all([
    db.select().from(fournitureNomenclature).orderBy(asc(fournitureNomenclature.modeleCle), asc(fournitureNomenclature.ordre), asc(fournitureNomenclature.id)),
    commandesPorteuses(),
  ]);
  const parCle = new Map<string, ModeleNomenclature>();
  const get = (cle: string, label: string) => {
    let m = parCle.get(cle);
    if (!m) {
      m = { cle, label, clients: [], commandes: [], lignes: [] };
      parCle.set(cle, m);
    }
    return m;
  };
  for (const c of cmds) {
    if (!c.cle) continue;
    const m = get(c.cle, fo.libelleModele(c.refArticle, c.modele));
    m.commandes.push({ id: c.id, of: c.of, pieces: c.pieces, lancee: c.lancee });
    if (c.client && !m.clients.includes(c.client)) m.clients.push(c.client);
  }
  for (const l of lignes) get(l.modeleCle, l.modeleLabel || l.modeleCle).lignes.push(l);
  // Les modèles en cours sans nomenclature d'abord : c'est là qu'il reste à faire.
  return [...parCle.values()].sort(
    (a, b) => Number(a.lignes.length > 0) - Number(b.lignes.length > 0) || a.label.localeCompare(b.label, "fr"),
  );
}

export async function ajouterLigneNomenclature(cle: string, label: string, v: Partial<LigneNomenclature>) {
  if (!cle) throw new Error("Modèle inconnu");
  const existantes = await db.select({ id: fournitureNomenclature.id }).from(fournitureNomenclature).where(eq(fournitureNomenclature.modeleCle, cle));
  await db.insert(fournitureNomenclature).values({
    modeleCle: cle,
    modeleLabel: label,
    designation: (v.designation ?? "").trim(),
    qteParPiece: v.qteParPiece ?? 0,
    unite: v.unite || "pcs",
    cassePct: v.cassePct ?? 0,
    origine: fo.origineFourniture(v.origine ?? "client"),
    fournisseur: v.fournisseur ?? "",
    ordre: existantes.length,
  });
}

export type ChampNomenclature = "designation" | "qteParPiece" | "unite" | "cassePct" | "origine" | "fournisseur";

export async function majLigneNomenclature(id: number, champ: ChampNomenclature, valeur: string): Promise<string> {
  const [l] = await db.select().from(fournitureNomenclature).where(eq(fournitureNomenclature.id, id));
  if (!l) throw new Error("Ligne introuvable");
  let v: string | number = valeur;
  if (champ === "qteParPiece" || champ === "cassePct") {
    const n = Number(valeur.replace(",", "."));
    if (!Number.isFinite(n) || n < 0) throw new Error("Valeur invalide");
    v = n;
  } else if (champ === "origine") v = fo.origineFourniture(valeur);
  await db.update(fournitureNomenclature).set({ [champ]: v }).where(eq(fournitureNomenclature.id, id));
  return l.modeleCle;
}

export async function supprimerLigneNomenclature(id: number): Promise<string | null> {
  const [l] = await db.select().from(fournitureNomenclature).where(eq(fournitureNomenclature.id, id));
  if (!l) return null;
  // Les lignes de commande générées restent (elles ont peut-être du reçu) :
  // elles redeviennent des lignes manuelles (FK → null).
  await db.delete(fournitureNomenclature).where(eq(fournitureNomenclature.id, id));
  return l.modeleCle;
}

/** Recopie la nomenclature d'un modèle sur un autre (modèle voisin). */
export async function copierNomenclature(source: string, cible: string, labelCible: string) {
  const lignes = await db.select().from(fournitureNomenclature).where(eq(fournitureNomenclature.modeleCle, source));
  if (!lignes.length) throw new Error("Le modèle source n'a pas de nomenclature");
  const deja = await db.select({ id: fournitureNomenclature.id }).from(fournitureNomenclature).where(eq(fournitureNomenclature.modeleCle, cible));
  if (deja.length) throw new Error("Le modèle cible a déjà une nomenclature");
  await db.insert(fournitureNomenclature).values(
    lignes.map((l, i) => ({
      modeleCle: cible, modeleLabel: labelCible, designation: l.designation, qteParPiece: l.qteParPiece, unite: l.unite,
      cassePct: l.cassePct, origine: l.origine, fournisseur: l.fournisseur, ordre: i,
    })),
  );
}

/* ─── synchronisation nomenclature → lignes des commandes ─── */

async function synchroniserUne(tx: Tx, c: CommandePorteuse, nomen: LigneNomenclature[], auteur: Auteur) {
  const lignes = await tx.select().from(commandeFournitureLigne).where(eq(commandeFournitureLigne.commandeId, c.id));
  let changements = 0;
  for (const n of nomen) {
    const prevu = fo.prevuNomenclature(n.qteParPiece, c.pieces, n.cassePct, n.unite);
    const liee =
      lignes.find((l) => l.nomenclatureId === n.id) ??
      lignes.find((l) => l.nomenclatureId == null && normDesig(l.designation) === normDesig(n.designation) && !!n.designation);
    const voulu = { designation: n.designation, unite: n.unite, qtePrevue: prevu, origine: n.origine, fournisseur: n.fournisseur, nomenclatureId: n.id };
    if (!liee) {
      await tx.insert(commandeFournitureLigne).values({ commandeId: c.id, ...voulu });
      changements++;
      continue;
    }
    const differe =
      liee.nomenclatureId !== n.id || liee.qtePrevue !== prevu || liee.designation !== n.designation ||
      liee.unite !== n.unite || liee.origine !== n.origine || liee.fournisseur !== n.fournisseur;
    if (differe) {
      await tx.update(commandeFournitureLigne).set(voulu).where(eq(commandeFournitureLigne.id, liee.id));
      changements++;
    }
  }
  if (changements) {
    await journaliserFiche(tx, c.id, auteur, "four", "Fournitures recalculées depuis la nomenclature du modèle", {
      detail: `${nomen.length} référence(s) · ${c.pieces} pièces`,
    });
  }
  return changements;
}

/** Applique la nomenclature de son modèle à une commande (prévu calculé). */
export async function synchroniserCommande(commandeId: number, auteur: Auteur): Promise<number> {
  const cmds = await commandesPorteuses();
  const c = cmds.find((x) => x.id === commandeId);
  if (!c) return 0; // OF rattaché, archivé ou livré : rien à calculer
  const nomen = await db.select().from(fournitureNomenclature).where(eq(fournitureNomenclature.modeleCle, c.cle)).orderBy(asc(fournitureNomenclature.ordre));
  if (!nomen.length) return 0;
  return db.transaction((tx) => synchroniserUne(tx, c, nomen, auteur));
}

/** Après une modification de nomenclature : toutes les commandes du modèle. */
export async function synchroniserModele(cle: string, auteur: Auteur): Promise<number> {
  const nomen = await db.select().from(fournitureNomenclature).where(eq(fournitureNomenclature.modeleCle, cle)).orderBy(asc(fournitureNomenclature.ordre));
  const cmds = (await commandesPorteuses()).filter((c) => c.cle === cle);
  let n = 0;
  await db.transaction(async (tx) => {
    for (const c of cmds) n += await synchroniserUne(tx, c, nomen, auteur);
  });
  return n;
}

/* ═══════════ manques : demandes client, achats DBS, relances ═══════════ */

export async function lignesEnManque(): Promise<fo.LigneManque[]> {
  const cmds = await commandesPorteuses();
  if (!cmds.length) return [];
  const parId = new Map(cmds.map((c) => [c.id, c]));
  const lignes = await db.select().from(commandeFournitureLigne).where(inArray(commandeFournitureLigne.commandeId, [...parId.keys()]));
  return lignes
    .filter((l) => fo.resteLigne(l) > 0)
    .map((l) => {
      const c = parId.get(l.commandeId)!;
      return {
        ligneId: l.id, commandeId: c.id, of: c.of, modele: c.modele, client: c.client, designation: l.designation,
        unite: l.unite, origine: l.origine, fournisseur: l.fournisseur, qtePrevue: l.qtePrevue, qteRecue: l.qteRecue,
        dateExport: c.dateExport,
      };
    });
}

export async function joursAlerte(): Promise<number> {
  const v = await getSetting<number>(fo.CLE_JOURS_ALERTE, fo.JOURS_ALERTE_FOURNITURES);
  return Number.isFinite(v) && v > 0 ? v : fo.JOURS_ALERTE_FOURNITURES;
}

export type Relance = {
  client: string;
  commandes: {
    id: number;
    of: string;
    modele: string;
    dateExport: string;
    joursRestants: number | null;
    niveau: fo.NiveauRelance;
    manques: { designation: string; unite: string; manque: number; origine: string }[];
  }[];
};

/** Commandes pas encore lancées, à qui il manque des fournitures et dont
 * l'export approche : à relancer, par client. */
export async function relances(): Promise<{ jours: number; clients: Relance[] }> {
  const [jours, manques, cmds] = await Promise.all([joursAlerte(), lignesEnManque(), commandesPorteuses()]);
  const lancees = new Set(cmds.filter((c) => c.lancee).map((c) => c.id));
  const jour = aujourdhui();
  const parCommande = new Map<number, Relance["commandes"][number] & { client: string }>();
  for (const l of manques) {
    if (lancees.has(l.commandeId)) continue;
    const { niveau, joursRestants } = fo.niveauRelance(l.dateExport, jour, jours);
    if (!niveau) continue;
    const e = parCommande.get(l.commandeId) ?? {
      id: l.commandeId, of: l.of, modele: l.modele, dateExport: l.dateExport, joursRestants, niveau, manques: [], client: l.client,
    };
    e.manques.push({ designation: l.designation, unite: l.unite, manque: r2(fo.resteLigne(l)), origine: l.origine });
    parCommande.set(l.commandeId, e);
  }
  const parClient = new Map<string, Relance>();
  for (const c of parCommande.values()) {
    const k = c.client || "Client non renseigné";
    const r = parClient.get(k) ?? { client: k, commandes: [] };
    r.commandes.push(c);
    parClient.set(k, r);
  }
  const clients = [...parClient.values()]
    .map((r) => ({ ...r, commandes: r.commandes.sort((a, b) => (a.joursRestants ?? 999) - (b.joursRestants ?? 999)) }))
    .sort((a, b) => (a.commandes[0]?.joursRestants ?? 999) - (b.commandes[0]?.joursRestants ?? 999));
  return { jours, clients };
}

/* ═══════════ réceptions par bon client (multi-commandes) ═══════════ */

export type LigneOuverte = {
  ligneId: number;
  commandeId: number;
  of: string;
  modele: string;
  couleur: string;
  designation: string;
  unite: string;
  origine: string;
  qtePrevue: number;
  qteRecue: number;
  reste: number;
};

/** Lignes de fourniture des commandes d'un client (ou de toutes), avec leur reste. */
export async function lignesPourReception(clientNom: string): Promise<{ clients: string[]; lignes: LigneOuverte[] }> {
  const cmds = await commandesPorteuses();
  const clients = [...new Set(cmds.map((c) => c.client).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr"));
  const cible = cmds.filter((c) => !clientNom || c.client.toLowerCase() === clientNom.toLowerCase());
  if (!cible.length) return { clients, lignes: [] };
  const parId = new Map(cible.map((c) => [c.id, c]));
  const lignes = await db
    .select()
    .from(commandeFournitureLigne)
    .where(inArray(commandeFournitureLigne.commandeId, [...parId.keys()]))
    .orderBy(asc(commandeFournitureLigne.commandeId), asc(commandeFournitureLigne.id));
  return {
    clients,
    lignes: lignes.map((l) => {
      const c = parId.get(l.commandeId)!;
      return {
        ligneId: l.id, commandeId: c.id, of: c.of, modele: c.modele, couleur: c.couleur, designation: l.designation, unite: l.unite,
        origine: l.origine, qtePrevue: l.qtePrevue, qteRecue: l.qteRecue, reste: r2(fo.resteLigne(l)),
      };
    }),
  };
}

async function prochainNumero(prefixeBase: string, existants: string[]): Promise<string> {
  const prefixe = `${prefixeBase}-${new Date().getFullYear()}-`;
  let max = 0;
  for (const n of existants) {
    if (!n.startsWith(prefixe)) continue;
    const v = parseInt(n.slice(prefixe.length), 10);
    if (Number.isFinite(v) && v > max) max = v;
  }
  return `${prefixe}${String(max + 1).padStart(3, "0")}`;
}

export async function creerReceptionFournitures(
  v: { date: string; client: string; blClient: string; note: string; lignes: { ligneId: number; qte: number }[] },
  auteur: Auteur,
): Promise<{ id: number; numero: string }> {
  const lignes = v.lignes.filter((l) => l.qte > 0);
  if (!lignes.length) throw new Error("Saisissez au moins une quantité reçue");
  const numero = await prochainNumero(
    "RF",
    (await db.select({ n: fournitureReception.numero }).from(fournitureReception)).map((r) => r.n),
  );
  return db.transaction(async (tx) => {
    const [rec] = await tx
      .insert(fournitureReception)
      .values({ numero, date: v.date || aujourdhui(), client: v.client, blClient: v.blClient.trim(), note: v.note, createdBy: auteur.name })
      .returning({ id: fournitureReception.id });
    for (const l of lignes) {
      const [ligne] = await tx.select().from(commandeFournitureLigne).where(eq(commandeFournitureLigne.id, l.ligneId));
      if (!ligne) throw new Error("Ligne de fourniture introuvable");
      const q = r2(l.qte);
      await tx.insert(fournitureReceptionLigne).values({
        receptionId: rec.id, ligneId: ligne.id, commandeId: ligne.commandeId, designation: ligne.designation, qte: q, unite: ligne.unite,
      });
      const apres = r2(ligne.qteRecue + q);
      await tx.update(commandeFournitureLigne).set({ qteRecue: apres }).where(eq(commandeFournitureLigne.id, ligne.id));
      await journaliserFiche(tx, ligne.commandeId, auteur, "four", `${ligne.designation || "Fourniture"} — reçu (bon ${numero}${v.blClient ? `, BL ${v.blClient}` : ""})`, {
        avant: ligne.qteRecue,
        apres,
      });
    }
    return { id: rec.id, numero };
  });
}

/** Annule un bon : retire du « reçu » ce qu'il avait crédité. */
export async function supprimerReceptionFournitures(id: number, auteur: Auteur) {
  await db.transaction(async (tx) => {
    const [rec] = await tx.select().from(fournitureReception).where(eq(fournitureReception.id, id));
    if (!rec) return;
    const lignes = await tx.select().from(fournitureReceptionLigne).where(eq(fournitureReceptionLigne.receptionId, id));
    for (const l of lignes) {
      if (l.ligneId == null) continue;
      const [ligne] = await tx.select().from(commandeFournitureLigne).where(eq(commandeFournitureLigne.id, l.ligneId));
      if (!ligne) continue;
      const apres = r2(Math.max(0, ligne.qteRecue - l.qte));
      await tx.update(commandeFournitureLigne).set({ qteRecue: apres }).where(eq(commandeFournitureLigne.id, ligne.id));
      await journaliserFiche(tx, ligne.commandeId, auteur, "four", `${ligne.designation || "Fourniture"} — bon ${rec.numero} annulé`, {
        avant: ligne.qteRecue,
        apres,
      });
    }
    await tx.delete(fournitureReception).where(eq(fournitureReception.id, id));
  });
}

export type ReceptionFournituresRow = {
  id: number;
  numero: string;
  date: string;
  client: string;
  blClient: string;
  note: string;
  createdBy: string;
  lignes: { designation: string; qte: number; unite: string; of: string }[];
};

export async function listReceptionsFournitures(limite = 50): Promise<ReceptionFournituresRow[]> {
  const recs = await db.select().from(fournitureReception).orderBy(desc(fournitureReception.date), desc(fournitureReception.id)).limit(limite);
  if (!recs.length) return [];
  const lignes = await db
    .select({ l: fournitureReceptionLigne, of: commande.ofNumber })
    .from(fournitureReceptionLigne)
    .leftJoin(commande, eq(fournitureReceptionLigne.commandeId, commande.id))
    .where(inArray(fournitureReceptionLigne.receptionId, recs.map((r) => r.id)));
  return recs.map((r) => ({
    id: r.id, numero: r.numero, date: r.date, client: r.client, blClient: r.blClient, note: r.note, createdBy: r.createdBy,
    lignes: lignes.filter((x) => x.l.receptionId === r.id).map((x) => ({ designation: x.l.designation, qte: x.l.qte, unite: x.l.unite, of: x.of ?? "" })),
  }));
}

/* ═══════════ restes par client ═══════════ */

export type ResteRow = typeof fournitureReste.$inferSelect;

export async function listRestes(): Promise<ResteRow[]> {
  return db.select().from(fournitureReste).orderBy(asc(fournitureReste.client), desc(fournitureReste.date), desc(fournitureReste.id));
}

export async function creerReste(v: { client: string; designation: string; unite: string; qte: number; origineOf: string; note: string }) {
  if (!(v.qte > 0)) throw new Error("Quantité invalide");
  if (!v.designation.trim()) throw new Error("Désignation requise");
  await db.insert(fournitureReste).values({ ...v, designation: v.designation.trim(), qte: r2(v.qte), date: aujourdhui() });
}

/** L'excédent d'une ligne (reçu > prévu) part en restes du client : il sort
 * du « reçu » de la commande pour ne pas être compté deux fois. */
export async function mettreEnReste(ligneId: number, auteur: Auteur) {
  await db.transaction(async (tx) => {
    const [l] = await tx.select().from(commandeFournitureLigne).where(eq(commandeFournitureLigne.id, ligneId));
    if (!l) throw new Error("Ligne introuvable");
    const exc = r2(fo.excedentLigne(l));
    if (exc <= 0) throw new Error("Pas d'excédent sur cette ligne");
    const [c] = await tx
      .select({ of: commande.ofNumber, clientNom: client.nom })
      .from(commande)
      .leftJoin(client, eq(commande.clientId, client.id))
      .where(eq(commande.id, l.commandeId));
    await tx.insert(fournitureReste).values({
      client: c?.clientNom ?? "", designation: l.designation, unite: l.unite, qte: exc, origineOf: c?.of ?? "", date: aujourdhui(),
    });
    await tx.update(commandeFournitureLigne).set({ qteRecue: l.qtePrevue }).where(eq(commandeFournitureLigne.id, l.id));
    await journaliserFiche(tx, l.commandeId, auteur, "four", `${l.designation} — excédent mis en restes client`, { avant: l.qteRecue, apres: l.qtePrevue });
  });
}

/** Réutilise (tout ou partie d')un reste sur une ligne d'une autre commande. */
export async function reutiliserReste(resteId: number, ligneId: number, qte: number, auteur: Auteur) {
  await db.transaction(async (tx) => {
    const [r] = await tx.select().from(fournitureReste).where(eq(fournitureReste.id, resteId));
    if (!r || r.statut !== "en_stock") throw new Error("Reste introuvable ou déjà sorti");
    const q = r2(Math.min(qte > 0 ? qte : r.qte, r.qte));
    const [l] = await tx.select().from(commandeFournitureLigne).where(eq(commandeFournitureLigne.id, ligneId));
    if (!l) throw new Error("Ligne de destination introuvable");
    const [c] = await tx.select({ of: commande.ofNumber }).from(commande).where(eq(commande.id, l.commandeId));
    if (q < r.qte) {
      await tx.update(fournitureReste).set({ qte: r2(r.qte - q) }).where(eq(fournitureReste.id, r.id));
      await tx.insert(fournitureReste).values({
        client: r.client, designation: r.designation, unite: r.unite, qte: q, origineOf: r.origineOf, statut: "reutilise",
        destination: c?.of ?? "", date: r.date, dateSortie: aujourdhui(),
      });
    } else {
      await tx.update(fournitureReste).set({ statut: "reutilise", destination: c?.of ?? "", dateSortie: aujourdhui() }).where(eq(fournitureReste.id, r.id));
    }
    const apres = r2(l.qteRecue + q);
    await tx.update(commandeFournitureLigne).set({ qteRecue: apres }).where(eq(commandeFournitureLigne.id, l.id));
    await journaliserFiche(tx, l.commandeId, auteur, "four", `${l.designation} — reste client réutilisé (de ${r.origineOf || "stock"})`, { avant: l.qteRecue, apres });
  });
}

/** Rend des restes au client : bon de retour RFR-AAAA-NNN. */
export async function rendreRestes(ids: number[]): Promise<string> {
  if (!ids.length) throw new Error("Choisissez au moins un reste");
  const restes = await db.select().from(fournitureReste).where(inArray(fournitureReste.id, ids));
  if (restes.some((r) => r.statut !== "en_stock")) throw new Error("Un des restes est déjà sorti");
  const clients = new Set(restes.map((r) => r.client.toLowerCase()));
  if (clients.size > 1) throw new Error("Un bon de retour ne concerne qu'un seul client");
  const deja = await db
    .select({ d: fournitureReste.destination })
    .from(fournitureReste)
    .where(and(eq(fournitureReste.statut, "rendu"), isNotNull(fournitureReste.destination), like(fournitureReste.destination, "RFR-%")));
  const numero = await prochainNumero("RFR", deja.map((x) => x.d));
  await db.update(fournitureReste).set({ statut: "rendu", destination: numero, dateSortie: aujourdhui() }).where(inArray(fournitureReste.id, ids));
  return numero;
}

export async function bonRetourFournitures(numero: string) {
  const restes = await db.select().from(fournitureReste).where(and(eq(fournitureReste.statut, "rendu"), eq(fournitureReste.destination, numero)));
  if (!restes.length) return null;
  return { numero, date: restes[0].dateSortie ?? aujourdhui(), client: restes[0].client, restes };
}

export async function supprimerReste(id: number) {
  await db.delete(fournitureReste).where(and(eq(fournitureReste.id, id), eq(fournitureReste.statut, "en_stock")));
}
