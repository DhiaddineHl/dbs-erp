import { eq, sql } from "drizzle-orm";
import { db, schema } from "./db";
import { Rapport, type Sauvegarde, dateOuNull, entier } from "./source";
import type { IndexCommandes } from "./commandes";

const { br, commande, coupe, magasinMouvement } = schema;

/* Flux aval : coupe, réceptions sous-traitance, stock magasin.
 *
 * Le point délicat de tout l'import est ici. Dans le nouveau modèle, les
 * compteurs de la commande sont la somme de ses mouvements : `produit` vaut
 * Σ(qte_ok des bons de réception), et le service les recalcule après chaque
 * écriture. La sauvegarde, elle, porte des compteurs libres — 208 commandes y
 * déclarent 73 955 pièces produites sans le moindre bon de réception, parce
 * qu'elles ont été reconstruites depuis les factures.
 *
 * Importer les compteurs seuls serait une bombe à retardement : la première
 * saisie faite dans l'application les remettrait à leur somme réelle, c'est-à-
 * dire à zéro, sans que personne comprenne pourquoi.
 *
 * On matérialise donc l'écart par un bon de reprise, numéroté `BR-REPRISE-…`
 * pour qu'il ne se confonde jamais avec un vrai bon, daté de la livraison et
 * annoté. Ce n'est pas une invention : c'est la production que l'ancien système
 * déclarait, rendue visible et effaçable au lieu d'être implicite. */

const NUM_REPRISE = (n: number) => `BR-REPRISE-${String(n).padStart(4, "0")}`;

export async function importerAval(src: Sauvegarde, idx: IndexCommandes, r: Rapport) {
  r.etape("Flux aval");

  /* ── lâchers de coupe ── */
  let coupes = 0;
  for (const c of src.coupes) {
    const commandeId = idx.parIdSource.get(c.cmdId);
    if (!commandeId) {
      r.alerte(`lâcher de coupe ${c.id} rattaché à une commande absente (${c.cmdId}) — ignoré`);
      continue;
    }
    await db.insert(coupe).values({
      commandeId,
      date: dateOuNull(c.date) ?? new Date().toISOString().slice(0, 10),
      qte: entier(c.qte),
      taille: r.texte(c.taille),
      type: r.texte(c.type) === "soustraite" ? "soustraite" : "interne",
      note: r.texte(c.note),
    });
    coupes++;
  }
  r.ok("lâchers de coupe", coupes);

  /* ── bons de réception réels ── */
  const recuParCommande = new Map<number, number>();
  let bons = 0;
  for (const b of src.brs) {
    const commandeId = idx.parIdSource.get(b.cmdId);
    if (!commandeId) {
      r.alerte(`bon de réception ${b.numero} rattaché à une commande absente (${b.cmdId}) — ignoré`);
      continue;
    }
    const qteOk = entier(b.qte_ok);
    const controle = ["ok", "ecart", "refuse"].includes(r.texte(b.statut)) ? r.texte(b.statut) : "ok";

    await db
      .insert(br)
      .values({
        numero: r.texte(b.numero) || `BR-IMPORT-${b.id}`,
        commandeId,
        date: dateOuNull(b.date) ?? new Date().toISOString().slice(0, 10),
        faconnier: r.texte(b.faconnier),
        qteRecue: entier(b.qte_recue),
        qteOk,
        qteNc: entier(b.qte_nc),
        controle,
        note: r.texte(b.note),
      })
      .onConflictDoNothing({ target: br.numero });

    recuParCommande.set(commandeId, (recuParCommande.get(commandeId) ?? 0) + qteOk);
    bons++;
  }
  r.ok("bons de réception", bons);

  /* ── bons de reprise, pour justifier la production déclarée ── */
  let reprises = 0;
  let piecesReprises = 0;
  let sequence = 0;

  for (const [idSource, produit] of idx.produitDeclare) {
    const commandeId = idx.parIdSource.get(idSource);
    if (!commandeId || produit <= 0) continue;

    const [c] = await db
      .select({
        of: commande.ofNumber,
        qte: commande.qte,
        dateLivraison: commande.dateLivraison,
        dateExport: commande.dateExport,
      })
      .from(commande)
      .where(eq(commande.id, commandeId));

    /* Le compteur `produit` est plafonné à la quantité commandée : une reprise
     * qui dépasserait ce plafond serait recalculée à la baisse juste après et
     * laisserait un écart permanent. On s'arrête au plafond et on le signale. */
    const dejaRecu = recuParCommande.get(commandeId) ?? 0;
    const cible = Math.min(produit, c?.qte ?? produit);
    if (produit > cible) {
      r.info(`${c?.of ?? commandeId} : ${produit} pièces déclarées pour ${c?.qte} commandées — reprise plafonnée`);
    }
    const manque = cible - dejaRecu;
    if (manque <= 0) continue;

    await db.insert(br).values({
      numero: NUM_REPRISE(++sequence),
      commandeId,
      date: c?.dateLivraison ?? c?.dateExport ?? new Date().toISOString().slice(0, 10),
      faconnier: "",
      qteRecue: manque,
      qteOk: manque,
      qteNc: 0,
      controle: "ok",
      note: `Reprise d'historique PilotPro — production déclarée sans bon de réception (${c?.of ?? ""}).`,
    });
    reprises++;
    piecesReprises += manque;
  }

  r.ok("bons de reprise créés", reprises, `${piecesReprises} pièces déclarées sans bon d'origine`);

  /* ── stock magasin ──
   * Le stock déclaré est repris en une écriture par commande. On ne le déduit
   * pas des bons de réception : la marchandise reçue puis expédiée n'est plus
   * en stock, et la sauvegarde ne dit pas quand elle en est sortie. */
  let mouvements = 0;
  let piecesStock = 0;
  for (const [idSource, qte] of idx.magasinDeclare) {
    const commandeId = idx.parIdSource.get(idSource);
    if (!commandeId || qte <= 0) continue;
    const [c] = await db
      .select({ dateExport: commande.dateExport })
      .from(commande)
      .where(eq(commande.id, commandeId));
    await db.insert(magasinMouvement).values({
      commandeId,
      date: c?.dateExport ?? new Date().toISOString().slice(0, 10),
      qte,
      origine: "interne",
      note: "Stock repris de PilotPro à la migration",
    });
    mouvements++;
    piecesStock += qte;
  }
  r.ok("entrées magasin reprises", mouvements, `${piecesStock} pièces en stock`);

  await recalculerTout(r);
}

/** Recalcule tous les compteurs depuis les mouvements, exactement comme le fait
 * le service après chaque écriture. Si l'import est correct, cette passe ne
 * change rien — et c'est précisément ce qu'on veut vérifier. */
export async function recalculerTout(r: Rapport) {
  const avant = await db
    .select({
      id: commande.id,
      of: commande.ofNumber,
      qte: commande.qte,
      produit: commande.produit,
      coupeQte: commande.coupeQte,
      magasinQte: commande.magasinQte,
    })
    .from(commande);

  const sommes = async (table: "coupe" | "br" | "magasin_mouvement", colonne: string) => {
    const rows = await db.execute(
      sql.raw(`select commande_id as id, coalesce(sum(${colonne}), 0)::int as total
               from ${table} group by commande_id`),
    );
    const m = new Map<number, number>();
    for (const row of rows.rows as { id: number; total: number }[]) m.set(Number(row.id), Number(row.total));
    return m;
  };

  const [sCoupe, sBr, sMag] = await Promise.all([
    sommes("coupe", "qte"),
    sommes("br", "qte_ok"),
    sommes("magasin_mouvement", "qte"),
  ]);

  let corriges = 0;
  const ecarts: string[] = [];

  for (const c of avant) {
    const coupeQte = sCoupe.get(c.id) ?? 0;
    const produit = Math.min(sBr.get(c.id) ?? 0, c.qte);
    const magasinQte = sMag.get(c.id) ?? 0;
    if (coupeQte === c.coupeQte && produit === c.produit && magasinQte === c.magasinQte) continue;

    if (ecarts.length < 8) {
      ecarts.push(
        `${c.of} : produit ${c.produit}→${produit}, coupe ${c.coupeQte}→${coupeQte}, magasin ${c.magasinQte}→${magasinQte}`,
      );
    }
    await db
      .update(commande)
      .set({ coupeQte, produit, magasinQte, updatedAt: new Date() })
      .where(eq(commande.id, c.id));
    corriges++;
  }

  if (corriges === 0) {
    r.ok("compteurs vérifiés", avant.length, "aucun écart entre les compteurs et les mouvements");
  } else {
    r.alerte(`${corriges} commande(s) dont les compteurs ne correspondaient pas aux mouvements — corrigés`);
    for (const e of ecarts) r.info(e);
  }
}
