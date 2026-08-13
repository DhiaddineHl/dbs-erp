import { eq } from "drizzle-orm";
import { db, schema } from "./db";
import { Rapport, type OrderSrc, type Sauvegarde, dateOuNull, entier, nombreOuNull } from "./source";
import { assurerClient, assurerFaconnier, type IndexReferentiel } from "./referentiel";
import { isStatut } from "@/lib/domain/commande";
import { estStatutLogistique } from "@/lib/domain/aval";

const { commande, commandeTds, commandeEtape, ofSupprime } = schema;

/* Commandes.
 *
 * 294 lignes dans la sauvegarde, dont 8 qui ne sont pas des commandes : cinq
 * lignes de frais et trois avoirs, glissés dans la même liste parce que
 * l'application d'origine s'en servait pour la facturation. Elles sont
 * écartées et comptées.
 *
 * Le reste est repris tel quel, y compris les 179 lignes marquées `_pre` :
 * ce sont des commandes historiques reconstruites depuis les factures. Elles
 * sont archivées et leur production est déclarée sans bon de réception —
 * l'étape « flux aval » s'en occupe. */

export type IndexCommandes = {
  /** id PilotPro → id Postgres */
  parIdSource: Map<number, number>;
  /** of_number → id Postgres */
  parOf: Map<string, number>;
  /** id PilotPro → quantité produite déclarée dans la sauvegarde */
  produitDeclare: Map<number, number>;
  /** id PilotPro → quantité magasin déclarée */
  magasinDeclare: Map<number, number>;
};

/** Une ligne de frais ou d'avoir n'est pas une commande de production. */
const estLigneFacturation = (o: OrderSrc) => o._type === "frais" || o._type === "avoir";

export async function importerCommandes(
  src: Sauvegarde,
  idx: IndexReferentiel,
  r: Rapport,
): Promise<IndexCommandes> {
  r.etape("Commandes");

  const parIdSource = new Map<number, number>();
  const parOf = new Map<string, number>();
  const produitDeclare = new Map<number, number>();
  const magasinDeclare = new Map<number, number>();

  const ecartees = src.orders.filter(estLigneFacturation);
  const aImporter = src.orders.filter((o) => !estLigneFacturation(o));

  let crees = 0;
  let majs = 0;
  const clientsAjoutes = new Set<string>();
  const faconniersAjoutes = new Set<string>();
  let prefacturation = 0;

  for (const o of aImporter) {
    const ofNumber = r.texte(o.of_number);
    if (!ofNumber) {
      r.alerte(`commande source ${o.id} sans numéro d'OF — ignorée`);
      continue;
    }

    const clientNom = r.texte(o.client);
    const faconnierNom = r.texte(o.faconnier);
    const clientId = clientNom ? await assurerClient(idx, clientNom, clientsAjoutes) : null;
    const faconnierId = faconnierNom ? await assurerFaconnier(idx, faconnierNom, faconniersAjoutes) : null;
    if (o._pre) prefacturation++;

    const qte = entier(o.qte);
    const produit = entier(o.produit);
    const magasinQte = entier(o.magasin_qte);
    const statutLog = estStatutLogistique(r.texte(o.statutLog)) ? r.texte(o.statutLog) : "attente";

    const valeurs = {
      ofNumber,
      modele: r.texte(o.modele) || "(sans modèle)",
      refArticle: r.texte(o.ref_article),
      couleur: r.texte(o.couleur),
      saison: r.texte(o.saison),
      note: r.texte(o.note),
      clientId,
      faconnierId,
      chaineId: null,
      qte,
      tailles: Array.isArray(o.tailles)
        ? o.tailles
            .filter((t) => t && typeof t.taille === "string")
            .map((t) => ({ taille: t.taille.trim(), qte: entier(t.qte) }))
        : [],
      prixVente: nombreOuNull(o.prix_vente),
      prixFacon: nombreOuNull(o.prix_facon),
      consoTheo: nombreOuNull(o.conso_theo),
      consoReel: nombreOuNull(o.conso_reel),
      chutePct: nombreOuNull(o.chute_pct),
      receptTissu: dateOuNull(o.recept_tissu),
      dateExport: dateOuNull(o.date_export),
      dateExportReel: dateOuNull(o.date_export_reel),
      dateLivraison: dateOuNull(o.date_livraison),
      exportPrev: dateOuNull(o.exportPrev),

      /* Les compteurs sont posés tels que déclarés ; l'étape « flux aval »
       * crée ensuite les mouvements qui les justifient, faute de quoi la
       * première écriture dans l'application les remettrait à zéro. */
      produit,
      coupeQte: entier(o.coupe_qte),
      magasinQte,
      factureQte: entier(o.facture_qte),
      tissuRecu: entier(o.tissu_recu),

      tissuLibere: Boolean(o.tissu_libere),
      /* La sauvegarde ne connaît pas l'état du magasin : on le déduit du statut
       * logistique, seul indicateur disponible. */
      magasinPrepare: statutLog === "pret" || statutLog === "expedie",
      magasinExpedie: statutLog === "expedie",
      archived: o.statut === "archived",
      statutManuel: isStatut(r.texte(o.statut_manuel)) ? r.texte(o.statut_manuel) : null,
      statutLog,
      facNums: Array.isArray(o.fac_nums)
        ? o.fac_nums.filter((n): n is string => typeof n === "string" && n.trim() !== "")
        : r.texte(o.fac_num)
          ? [r.texte(o.fac_num)]
          : [],
      updatedAt: new Date(),
    };

    const [existante] = await db.select({ id: commande.id }).from(commande).where(eq(commande.ofNumber, ofNumber));
    let id: number;
    if (existante) {
      await db.update(commande).set(valeurs).where(eq(commande.id, existante.id));
      id = existante.id;
      majs++;
    } else {
      const [ligne] = await db.insert(commande).values(valeurs).returning({ id: commande.id });
      id = ligne.id;
      crees++;
    }

    parIdSource.set(o.id, id);
    parOf.set(ofNumber, id);
    produitDeclare.set(o.id, produit);
    magasinDeclare.set(o.id, magasinQte);
  }

  r.ok("commandes créées", crees);
  r.ok("commandes mises à jour", majs);
  r.info(`${prefacturation} commande(s) historiques reconstruites depuis les factures (marquées « _pre » à l'origine)`);
  if (ecartees.length) {
    r.info(
      `${ecartees.length} ligne(s) écartée(s) — ce ne sont pas des commandes : ` +
        ecartees.map((o) => `${o.of_number} (${o._type})`).join(", "),
    );
  }
  if (clientsAjoutes.size) {
    r.alerte(`client(s) créé(s) depuis les commandes, absents du référentiel : ${[...clientsAjoutes].join(", ")}`);
  }
  if (faconniersAjoutes.size) {
    r.alerte(`façonnier(s) créé(s) depuis les commandes, absents du référentiel : ${[...faconniersAjoutes].join(", ")}`);
  }

  await importerTombstones(src, r);
  await importerPreparation(src, parIdSource, r);

  return { parIdSource, parOf, produitDeclare, magasinDeclare };
}

/** Numéros d'OF supprimés : les réimporter ferait réapparaître des commandes
 * que quelqu'un a explicitement effacées. */
async function importerTombstones(src: Sauvegarde, r: Rapport) {
  let n = 0;
  for (const of of src.deletedOfs) {
    const numero = typeof of === "string" ? of.trim() : "";
    if (!numero) continue;
    await db.insert(ofSupprime).values({ ofNumber: numero }).onConflictDoNothing({ target: ofSupprime.ofNumber });
    n++;
  }
  r.ok("numéros d'OF supprimés (pierres tombales)", n);
}

/* ─────────── préparation ───────────
 * La sauvegarde ne porte presque rien : une seule commande a un cycle de têtes
 * de série, six ont un OK production. C'est peu, mais c'est justement ce qui
 * ne doit pas se perdre — c'est la trace d'une validation client. */

async function importerPreparation(src: Sauvegarde, parIdSource: Map<number, number>, r: Rapport) {
  let tds = 0;
  let okPro = 0;

  for (const o of src.orders) {
    const commandeId = parIdSource.get(o.id);
    if (!commandeId) continue;

    for (const t of o.dt_tds ?? []) {
      const n = entier(t.n, 1);
      if (n <= 0) continue;
      const verdict = ["attente", "ok", "refus"].includes(r.texte(t.verdict)) ? r.texte(t.verdict) : "attente";
      await db
        .insert(commandeTds)
        .values({
          commandeId,
          n,
          envoi: dateOuNull(t.envoi),
          retour: dateOuNull(t.retour),
          verdict,
          commentaire: r.texte(t.comm),
          par: r.texte(t.par),
        })
        .onConflictDoNothing({ target: [commandeTds.commandeId, commandeTds.n] });
      tds++;
    }

    /* Un OK production sans cycle de TDS : on matérialise la validation par une
     * TDS acceptée, car c'est ce que lit la règle des feux. Le commentaire dit
     * d'où elle vient, pour ne pas faire croire à une tête de série réelle. */
    if (o.ok_pro && !(o.dt_tds ?? []).length) {
      await db
        .insert(commandeTds)
        .values({
          commandeId,
          n: 1,
          envoi: dateOuNull(o.be_date_envoi),
          retour: dateOuNull(o.date_ok_pro),
          verdict: "ok",
          commentaire:
            [r.texte(o.ok_pro_ref) && `réf. ${r.texte(o.ok_pro_ref)}`, r.texte(o.ok_pro_note)]
              .filter(Boolean)
              .join(" · ") || "OK production repris de PilotPro (pas de cycle TDS enregistré)",
          par: r.texte(o.ok_pro_valide_par),
        })
        .onConflictDoNothing({ target: [commandeTds.commandeId, commandeTds.n] });
      okPro++;
    }

    for (const l of o.dt_four_lignes ?? []) {
      const designation = r.texte(l.designation);
      if (!designation) continue;
      await db.insert(schema.commandeFournitureLigne).values({
        commandeId,
        designation,
        qtePrevue: entier(l.prevue),
        qteRecue: entier(l.recue),
        unite: r.texte(l.unite) || "pcs",
      });
    }

    /* Le bureau modélisme n'existait pas comme tel : une commande dont la coupe
     * est terminée a forcément eu ses tracés. On ne l'invente pas au-delà. */
    if (r.texte(o.coupe_statut) === "coupe") {
      for (const etape of ["patronage", "traces"]) {
        await db
          .insert(commandeEtape)
          .values({ commandeId, etape, fait: true, date: dateOuNull(o.coupe_date_plan), par: "reprise PilotPro" })
          .onConflictDoNothing({ target: [commandeEtape.commandeId, commandeEtape.etape] });
      }
    }
  }

  r.ok("têtes de série", tds);
  r.ok("OK production repris en TDS acceptée", okPro, "aucun cycle TDS n'existait");
}
