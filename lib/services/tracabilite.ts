import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  bl,
  blLigne,
  br,
  chaine,
  client,
  commande,
  commandeEtape,
  commandeLancement,
  commandeTds,
  coupe,
  faconnier,
  magasinMouvement,
  qcInspection,
} from "@/lib/db/schema";
import * as tr from "@/lib/domain/tracabilite";
import { estVerdict, VERDICTS } from "@/lib/domain/qc";

const iso = (d: string | null) => d ?? null;
const jour = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export type CommandeIndex = {
  id: number;
  of: string;
  modele: string;
  client: string;
  refArticle: string;
  couleur: string;
  archived: boolean;
};

/** Index léger pour le sélecteur : on ne charge la frise qu'à la demande. */
export async function listCommandesTracables(): Promise<CommandeIndex[]> {
  const rows = await db
    .select({
      id: commande.id, of: commande.ofNumber, modele: commande.modele,
      refArticle: commande.refArticle, couleur: commande.couleur,
      archived: commande.archived, clientNom: client.nom,
    })
    .from(commande)
    .leftJoin(client, eq(commande.clientId, client.id))
    .orderBy(asc(commande.ofNumber));
  return rows.map((r) => ({ ...r, client: r.clientNom ?? "" }));
}

export type Frise = {
  commande: {
    id: number;
    of: string;
    modele: string;
    refArticle: string;
    couleur: string;
    saison: string;
    client: string;
    faconnier: string;
    chaine: string;
    qte: number;
    produit: number;
    coupeQte: number;
    magasinQte: number;
    factureQte: number;
    archived: boolean;
    facNums: string[];
  };
  evenements: tr.Evenement[];
  jalons: tr.Jalon[];
  cycle: ReturnType<typeof tr.dureeCycle>;
};

export async function getFrise(commandeId: number): Promise<Frise | null> {
  const [tete] = await db
    .select({ c: commande, clientNom: client.nom, faconnierNom: faconnier.nom, chaineNom: chaine.nom })
    .from(commande)
    .leftJoin(client, eq(commande.clientId, client.id))
    .leftJoin(faconnier, eq(commande.faconnierId, faconnier.id))
    .leftJoin(chaine, eq(commande.chaineId, chaine.id))
    .where(eq(commande.id, commandeId));
  if (!tete) return null;
  const c = tete.c;

  const [tds, etapes, lancement, coupes, receptions, mouvements, inspections, livraisons] = await Promise.all([
    db.select().from(commandeTds).where(eq(commandeTds.commandeId, commandeId)).orderBy(asc(commandeTds.n)),
    db.select().from(commandeEtape).where(eq(commandeEtape.commandeId, commandeId)),
    db.select().from(commandeLancement).where(eq(commandeLancement.commandeId, commandeId)),
    db.select().from(coupe).where(eq(coupe.commandeId, commandeId)).orderBy(asc(coupe.date)),
    db.select().from(br).where(eq(br.commandeId, commandeId)).orderBy(asc(br.date)),
    db
      .select()
      .from(magasinMouvement)
      .where(eq(magasinMouvement.commandeId, commandeId))
      .orderBy(asc(magasinMouvement.date)),
    db.select().from(qcInspection).where(eq(qcInspection.commandeId, commandeId)).orderBy(asc(qcInspection.date)),
    db
      .select({ l: blLigne, b: bl })
      .from(blLigne)
      .innerJoin(bl, eq(blLigne.blId, bl.id))
      .where(eq(blLigne.commandeId, commandeId))
      .orderBy(asc(bl.date)),
  ]);

  const evts: tr.Evenement[] = [];
  const atteintes = new Set<tr.EtapeCle>();
  const noter = (e: tr.Evenement) => {
    evts.push(e);
    atteintes.add(e.etape);
  };

  /* ── 1. commande ── */
  noter({
    date: jour(c.createdAt),
    etape: "commande",
    titre: `Commande enregistrée — ${c.qte} pcs`,
    detail: `${tete.clientNom ?? "client inconnu"}${c.saison ? ` · saison ${c.saison}` : ""}`,
    tone: "brand",
  });
  if (c.dateExport) {
    evts.push({
      date: c.dateExport,
      etape: "commande",
      titre: "Date d'export contractuelle",
      detail: "Engagement pris auprès du client",
      tone: "neutral",
    });
  }

  /* ── 2. matières ── */
  if (c.receptTissu) {
    noter({
      date: c.receptTissu,
      etape: "matieres",
      titre: "Réception tissu prévue",
      detail: `${c.tissuRecu > 0 ? `${c.tissuRecu} m reçus` : "en attente"}`,
      tone: c.tissuRecu > 0 ? "success" : "warning",
    });
  }
  if (c.tissuDateReelle) {
    noter({
      date: c.tissuDateReelle,
      etape: "matieres",
      titre: `Tissu reçu — ${c.tissuRecu} m`,
      detail: c.tissuNote || "Métrage enregistré au magasin",
      tone: "success",
    });
  }
  if (c.tissuControle) {
    noter({
      date: c.tissuDateReelle,
      etape: "matieres",
      titre: `Contrôle tissu : ${c.tissuControle}`,
      detail: c.tissuLibere ? "Tissu libéré pour la coupe" : "Tissu non libéré",
      tone: c.tissuControle === "refuse" ? "danger" : c.tissuControle === "reserve" ? "warning" : "success",
    });
  }
  if (c.fournituresStatut) {
    noter({
      date: null,
      etape: "matieres",
      titre: `Fournitures : ${c.fournituresStatut}`,
      detail: "Statut global du magasin fournitures",
      tone: c.fournituresStatut === "complet" ? "success" : "warning",
    });
  }

  /* ── 3. préparation ── */
  for (const t of tds) {
    if (t.envoi) {
      noter({
        date: t.envoi,
        etape: "preparation",
        titre: `TDS${t.n} envoyée au client`,
        detail: t.commentaire || "Tête de série soumise pour validation",
        tone: "brand",
        acteur: t.par,
      });
    }
    if (t.retour) {
      noter({
        date: t.retour,
        etape: "preparation",
        titre: `TDS${t.n} — ${t.verdict === "ok" ? "OK production" : t.verdict === "refus" ? "refusée" : "en attente"}`,
        detail: t.commentaire || "",
        tone: t.verdict === "ok" ? "success" : t.verdict === "refus" ? "danger" : "warning",
        acteur: t.par,
      });
    }
  }
  for (const e of etapes) {
    if (!e.fait) continue;
    noter({
      date: e.date,
      etape: "preparation",
      titre: e.etape === "patronage" ? "Patronage terminé" : "Tracés tirés",
      detail: "Bureau modélisme",
      tone: "success",
      acteur: e.par,
    });
  }

  /* ── 4. lancement ── */
  const lanc = lancement[0];
  if (lanc) {
    noter({
      date: lanc.date,
      etape: "lancement",
      titre: `Lancement ${lanc.mode === "interne" ? "en interne" : "en sous-traitance"}`,
      detail: tete.faconnierNom ?? tete.chaineNom ?? "",
      tone: "success",
      acteur: lanc.par,
    });
    if (lanc.derogationMotif) {
      noter({
        date: lanc.derogationDate ?? lanc.date,
        etape: "lancement",
        titre: "⚠ Lancement par dérogation",
        detail: `${lanc.derogationManques.join(" · ") || "feux bloquants"} — ${lanc.derogationMotif}`,
        tone: "danger",
        acteur: lanc.derogationPar ?? "",
      });
    }
  }

  /* ── 5. coupe ── */
  for (const l of coupes) {
    noter({
      date: l.date,
      etape: "coupe",
      titre: `Lâcher de coupe — ${l.qte} pcs`,
      detail: `${l.taille ? `taille ${l.taille} · ` : ""}${l.type}${l.note ? ` · ${l.note}` : ""}`,
      tone: "brand",
    });
  }

  /* ── 6. production ── */
  for (const r of receptions) {
    noter({
      date: r.date,
      etape: "production",
      titre: `Réception ${r.numero} — ${r.qteOk} conformes`,
      detail: `${r.faconnier || "sous-traitance"} · reçu ${r.qteRecue}${r.qteNc > 0 ? ` · ${r.qteNc} NC` : ""}`,
      tone: r.controle === "refuse" ? "danger" : r.controle === "ecart" ? "warning" : "success",
    });
  }

  /* ── 7. qualité ── */
  for (const i of inspections) {
    /* Le verdict AQL demanderait de recharger défauts et mesures ; la frise se
     * contente de ce qui est arrêté — verdict de clôture, sinon arbitrage du
     * contrôleur. Une inspection encore ouverte s'affiche comme telle. */
    const fige = i.verdictCloture || i.verdictForce;
    const v = estVerdict(fige) ? VERDICTS[fige] : null;
    noter({
      date: i.date,
      etape: "qualite",
      titre: `Inspection QC-${String(i.numero).padStart(3, "0")} — ${v?.label ?? "en cours"}`,
      detail: `lot ${i.lot} pcs · ${i.statut === "cloture" ? "clôturée" : "brouillon"}`,
      tone: v?.tone ?? "neutral",
      acteur: i.controleur,
    });
  }

  /* ── 8. magasin ── */
  for (const m of mouvements) {
    noter({
      date: m.date,
      etape: "magasin",
      titre: `Entrée magasin — ${m.qte} pcs`,
      detail: m.note || (m.origine === "br" ? "depuis la réception sous-traitance" : "production interne"),
      tone: "brand",
    });
  }
  if (c.magasinPrepare) {
    noter({
      date: null,
      etape: "magasin",
      titre: "Lot préparé pour l'export",
      detail: `${c.magasinQte} pcs en stock`,
      tone: "success",
    });
  }

  /* ── 9. livraison ── */
  for (const { l, b } of livraisons) {
    noter({
      date: b.date,
      etape: "livraison",
      titre: `Bon de livraison ${b.numero} — ${l.qteLivree} pcs`,
      detail: `${b.clientNom}${b.transporteur ? ` · ${b.transporteur}` : ""}`,
      tone: b.statut === "draft" ? "warning" : "success",
    });
  }
  if (c.dateExportReel) {
    noter({
      date: c.dateExportReel,
      etape: "livraison",
      titre: "Export réel",
      detail: c.dateExport ? `date contractuelle : ${c.dateExport}` : "",
      tone: "success",
    });
  }
  if (c.dateLivraison) {
    noter({
      date: c.dateLivraison,
      etape: "livraison",
      titre: "Livraison client",
      detail: "Commande sortie du magasin",
      tone: "success",
    });
  }

  /* ── 10. facturation ── */
  if (c.factureQte > 0) {
    noter({
      date: null,
      etape: "facturation",
      titre: `Facturé — ${c.factureQte} / ${c.qte} pcs`,
      detail: c.facNums.length ? `facture(s) ${c.facNums.join(", ")}` : "rapprochement automatique",
      tone: c.factureQte >= c.qte ? "success" : "warning",
    });
  }
  if (c.archived) {
    noter({
      date: iso(c.dateLivraison),
      etape: "facturation",
      titre: "Commande archivée",
      detail: "Cycle terminé",
      tone: "neutral",
    });
  }

  const evenements = tr.trierEvenements(evts);
  return {
    commande: {
      id: c.id, of: c.ofNumber, modele: c.modele, refArticle: c.refArticle, couleur: c.couleur,
      saison: c.saison, client: tete.clientNom ?? "", faconnier: tete.faconnierNom ?? "",
      chaine: tete.chaineNom ?? "", qte: c.qte, produit: c.produit, coupeQte: c.coupeQte,
      magasinQte: c.magasinQte, factureQte: c.factureQte, archived: c.archived, facNums: c.facNums,
    },
    evenements,
    jalons: tr.construireJalons(evenements, atteintes),
    cycle: tr.dureeCycle(evenements),
  };
}
