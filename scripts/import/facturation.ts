import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "./db";
import { Rapport, type Sauvegarde, dateOuNull, entier, nombre, nombreOuNull } from "./source";
import { slugClient } from "@/lib/domain/commande";
import { MODES_PAIEMENT } from "@/lib/domain/finance";

const {
  client,
  compteBancaire,
  facture,
  factureCostLine,
  factureExtra,
  factureLigne,
  fournisseurCompte,
  fournisseurTransaction,
  reglement,
  appSetting,
} = schema;

/* Facturation, encaissements et grand livre fournisseurs.
 *
 * L'application d'origine séparait les 86 factures « de base », figées dans son
 * code, des 25 corrections stockées en localStorage sous `dbs_overrides_2026`.
 * Les corrections sont la vérité : elles portent les lignes réellement émises.
 * Elles écrasent donc la version de base, ligne par ligne. */

/** "79/2026|facture" → { num, type } */
function decouperCle(cle: string): { num: string; type: string } | null {
  const i = cle.lastIndexOf("|");
  if (i < 0) return null;
  const num = cle.slice(0, i).trim();
  const type = cle.slice(i + 1).trim();
  return num && type ? { num, type } : null;
}

/* Les corrections citent leur client par sa clé, et certaines clés n'existent
 * dans aucun référentiel — « lb_fashion » n'apparaît que là. Plutôt que de
 * rattacher la facture à personne, on crée le client manquant depuis sa clé et
 * on le signale : une facture sans client fausse tout le suivi d'encaissement. */
const clientsCrees: string[] = [];

async function resoudreClientKey(cleClient: string, r: Rapport): Promise<string | null> {
  if (!cleClient) return null;
  const [existant] = await db.select({ key: client.key }).from(client).where(eq(client.key, cleClient));
  if (existant) return existant.key;

  const nom = cleClient.replace(/_/g, " ").toUpperCase();
  await db.insert(client).values({ key: cleClient, nom }).onConflictDoNothing({ target: client.key });
  clientsCrees.push(`${nom} (${cleClient})`);
  void r;
  return cleClient;
}

async function trouverFacture(num: string, type: string) {
  const [f] = await db
    .select({ id: facture.id })
    .from(facture)
    .where(and(eq(facture.num, num), eq(facture.type, type)));
  return f?.id ?? null;
}

export async function importerFacturation(src: Sauvegarde, r: Rapport) {
  r.etape("Facturation");

  /* ── corrections de factures ── */
  let corrigees = 0;
  let creees = 0;
  let lignes = 0;

  for (const [cle, o] of Object.entries(src.overrides)) {
    const parts = decouperCle(cle);
    if (!parts) {
      r.alerte(`clé de correction illisible : ${cle}`);
      continue;
    }
    const { num, type } = parts;

    const clientKey = await resoudreClientKey(r.texte(o.client) ? slugClient(r.texte(o.client)) : "", r);
    const entete = {
      num,
      type,
      date: dateOuNull(o.date) ?? "",
      clientKey,
      total: nombre(o.total),
      poids: r.texte(o.poids),
      mp: r.texte(o.mp),
      pieces: entier(o.pieces) || (o.lignes ?? []).reduce((s, l) => s + entier(l.qte), 0),
    };

    let id = await trouverFacture(num, type);
    if (id) {
      await db.update(facture).set(entete).where(eq(facture.id, id));
      corrigees++;
    } else {
      const [ligne] = await db.insert(facture).values(entete).returning({ id: facture.id });
      id = ligne.id;
      creees++;
    }

    /* Les lignes de la correction remplacent celles de la base : une facture
     * corrigée l'a été parce que ses lignes avaient changé. */
    await db.delete(factureLigne).where(eq(factureLigne.factureId, id));
    await db.delete(factureExtra).where(eq(factureExtra.factureId, id));

    const l = (o.lignes ?? []).map((x, idx) => ({
      factureId: id,
      idx,
      modele: r.texte(x.modele),
      desig: r.texte(x.desig),
      ref: r.texte(x.ref),
      couleur: r.texte(x.couleur),
      qte: entier(x.qte),
      pu: nombre(x.pu),
      mt: nombre(x.mt),
    }));
    if (l.length) await db.insert(factureLigne).values(l);
    lignes += l.length;

    const e = (o.extras ?? [])
      .filter((x) => r.texte(x.label))
      .map((x) => ({ factureId: id, label: r.texte(x.label), mt: nombre(x.mt) }));
    if (e.length) await db.insert(factureExtra).values(e);
  }

  r.ok("factures corrigées", corrigees, `${lignes} ligne(s) réécrites`);
  if (creees) r.ok("factures créées par la correction", creees);
  if (clientsCrees.length) {
    r.alerte(`${clientsCrees.length} client(s) créé(s) depuis une clé de facture, sans fiche au référentiel :`);
    for (const c of clientsCrees) r.info(c);
  }

  /* ── coûts de production par ligne ── */
  let couts = 0;
  let orphelins = 0;

  for (const [cle, c] of Object.entries(src.couts)) {
    const parts = decouperCle(cle);
    if (!parts) continue;
    const id = await trouverFacture(parts.num, parts.type);
    if (!id) {
      orphelins++;
      continue;
    }
    for (const [idxTexte, ligne] of Object.entries(c.lines ?? {})) {
      const lineIdx = Number(idxTexte);
      if (!Number.isInteger(lineIdx)) continue;
      const valeurs = {
        factureId: id,
        lineIdx,
        lieu: r.texte(ligne.lieu),
        faconnier: r.texte(ligne.fac),
        cout: nombreOuNull(ligne.cout),
      };
      await db
        .insert(factureCostLine)
        .values(valeurs)
        .onConflictDoUpdate({ target: [factureCostLine.factureId, factureCostLine.lineIdx], set: valeurs });
      couts++;
    }
  }

  r.ok("coûts de production saisis", couts);
  if (orphelins) r.alerte(`${orphelins} bloc(s) de coûts sans facture correspondante — ignorés`);
}

/* ─────────── encaissements ─────────── */

export async function importerEncaissements(src: Sauvegarde, r: Rapport) {
  r.etape("Encaissements");

  /* ── comptes bancaires ── */
  const idCompte = new Map<string, number>();
  for (const [ordre, libelle] of src.comptesBancaires.entries()) {
    const nom = r.texte(libelle);
    if (!nom) continue;
    const [ligne] = await db
      .insert(compteBancaire)
      .values({ libelle: nom, ordre })
      .onConflictDoUpdate({ target: compteBancaire.libelle, set: { ordre } })
      .returning({ id: compteBancaire.id });
    idCompte.set(nom, ligne.id);
  }
  // Les comptes déjà présents (seed) complètent l'index.
  for (const c of await db.select().from(compteBancaire)) idCompte.set(c.libelle, c.id);
  r.ok("comptes bancaires", idCompte.size);

  /* ── règlements ── */
  let reglements = 0;
  let orphelins = 0;
  let montantTotal = 0;
  const modesInconnus = new Set<string>();

  for (const [cle, bloc] of Object.entries(src.paiements)) {
    const parts = decouperCle(cle);
    if (!parts) continue;
    const factureId = await trouverFacture(parts.num, parts.type);
    if (!factureId) {
      orphelins++;
      continue;
    }

    for (const p of bloc.reglements ?? []) {
      const montant = nombre(p.montant);
      const date = dateOuNull(p.date);
      if (montant <= 0 || !date) continue;

      const mode = r.texte(p.mode);
      // Un mode inconnu n'est pas rejeté : il est repris tel quel et signalé.
      if (mode && !(MODES_PAIEMENT as readonly string[]).includes(mode)) modesInconnus.add(mode);

      const compteNom = r.texte(p.compte);
      await db.insert(reglement).values({
        factureId,
        date,
        montant,
        mode: mode || "Virement",
        compteId: compteNom ? (idCompte.get(compteNom) ?? null) : null,
        ref: r.texte(p.ref),
        note: r.texte(p.note),
      });
      reglements++;
      montantTotal += montant;
    }
  }

  r.ok("règlements", reglements, `${Math.round(montantTotal).toLocaleString("fr-FR")} € encaissés`);
  if (orphelins) r.alerte(`${orphelins} bloc(s) de règlements sans facture correspondante — ignorés`);
  if (modesInconnus.size) r.info(`modes de paiement hors liste, repris tels quels : ${[...modesInconnus].join(", ")}`);

  /* ── taux de change ── */
  await db
    .insert(appSetting)
    .values({ key: "tauxEur", value: src.tauxEur })
    .onConflictDoUpdate({ target: appSetting.key, set: { value: src.tauxEur } });
  r.ok("taux EUR / TND", 1, String(src.tauxEur));

  /* Combien de factures restent impayées après reprise ? C'est le chiffre que
   * la comptabilité vérifiera en premier. */
  const factures = await db
    .select({ id: facture.id, total: facture.total, type: facture.type })
    .from(facture)
    .where(isNull(facture.deletedAt));
  const regles = await db.select({ factureId: reglement.factureId, montant: reglement.montant }).from(reglement);
  const parFacture = new Map<number, number>();
  for (const x of regles) parFacture.set(x.factureId, (parFacture.get(x.factureId) ?? 0) + x.montant);

  const impayees = factures.filter(
    (f) => f.type === "facture" && f.total > 0 && (parFacture.get(f.id) ?? 0) < f.total - 0.5,
  );
  r.info(`${impayees.length} facture(s) restent non soldées sur ${factures.filter((f) => f.type === "facture").length}`);
}

/* ─────────── grand livre fournisseurs ─────────── */

const CATEGORIES = ["Façonniers", "Matières / Fournitures", "Transport / Logistique", "Charges fixes", "Divers"];

export async function importerGrandLivre(src: Sauvegarde, r: Rapport) {
  r.etape("Grand livre fournisseurs");

  let comptes = 0;
  let transactions = 0;
  let ecarts = 0;
  let sansDate = 0;
  let sansDateNiRepli = 0;
  const exemples: string[] = [];

  for (const c of src.grandLivre) {
    const nom = r.texte(c.nom);
    if (!nom) continue;

    const categorie = CATEGORIES.includes(r.texte(c.categorie)) ? r.texte(c.categorie) : "Divers";
    const devise = r.texte(c.devise) === "EUR" ? "EUR" : "TND";

    const [ligne] = await db
      .insert(fournisseurCompte)
      .values({ nom, categorie, devise })
      .onConflictDoUpdate({ target: fournisseurCompte.nom, set: { categorie, devise } })
      .returning({ id: fournisseurCompte.id });

    // Réimport : on repart des mouvements du fichier, seule source de vérité.
    await db.delete(fournisseurTransaction).where(eq(fournisseurTransaction.compteId, ligne.id));

    /* 64 mouvements du fichier n'ont pas de date — pour l'essentiel des loyers
     * et des charges, dont le libellé porte la période au lieu d'une date.
     * Les écarter ferait disparaître 106 516 TND de crédits et fausserait
     * autant de soldes. On les garde et on les date : par la première date
     * lisible dans leur libellé, sinon par le plus ancien mouvement daté du
     * compte. La ligne le dit dans son libellé. */
    const datesConnues = (c.transactions ?? []).map((t) => dateOuNull(t.date)).filter((x): x is string => !!x);
    const plusAncienne = datesConnues.sort()[0] ?? null;

    let debit = 0;
    let credit = 0;
    const mouvements = (c.transactions ?? [])
      .map((t) => {
        const libelleBrut = r.texte(t.libelle);
        let date = dateOuNull(t.date);
        let libelle = libelleBrut;

        if (!date) {
          const jma = /(\d{2})\/(\d{2})\/(\d{4})/.exec(libelleBrut);
          const depuisLibelle = jma ? dateOuNull(`${jma[3]}-${jma[2]}-${jma[1]}`) : null;
          date = depuisLibelle ?? plusAncienne;
          if (!date) {
            sansDateNiRepli++;
            return null;
          }
          sansDate++;
          libelle = `${libelleBrut} (date reconstituée)`.trim();
        }

        const d = nombre(t.debit);
        const cr = nombre(t.credit);
        debit += d;
        credit += cr;
        return { compteId: ligne.id, date, libelle, debit: d, credit: cr };
      })
      .filter((t): t is NonNullable<typeof t> => t !== null);

    for (let i = 0; i < mouvements.length; i += 200) {
      await db.insert(fournisseurTransaction).values(mouvements.slice(i, i + 200));
    }
    transactions += mouvements.length;
    comptes++;

    /* Le solde stocké dans la sauvegarde avait dérivé : on ne le reprend pas,
     * il est recalculé à la lecture. On vérifie quand même l'écart, parce
     * qu'un écart important signalerait un mouvement perdu, pas un arrondi. */
    const soldeCalcule = Math.round((credit - debit) * 1000) / 1000;
    const soldeStocke = Math.round(nombre(c.solde) * 1000) / 1000;
    if (Math.abs(soldeCalcule - soldeStocke) > 0.5) {
      ecarts++;
      if (exemples.length < 5) {
        exemples.push(`${nom} : stocké ${soldeStocke}, recalculé ${soldeCalcule} ${devise}`);
      }
    }
  }

  r.ok("comptes fournisseurs", comptes, `${transactions} mouvement(s)`);
  if (sansDate) {
    r.alerte(`${sansDate} mouvement(s) sans date dans le fichier — datés depuis leur libellé ou le plus ancien du compte`);
  }
  if (sansDateNiRepli) r.alerte(`${sansDateNiRepli} mouvement(s) impossibles à dater — écartés`);
  if (ecarts) {
    r.alerte(`${ecarts} compte(s) dont le solde enregistré s'écarte de plus de 0,5 du solde recalculé`);
    for (const e of exemples) r.info(e);
  } else {
    r.info("tous les soldes recalculés retombent sur les soldes enregistrés");
  }
}
