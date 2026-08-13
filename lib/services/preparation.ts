import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  chaine,
  client,
  commande,
  commandeEtape,
  commandeFournitureLigne,
  commandeJournal,
  commandeLancement,
  commandeTds,
  faconnier,
} from "@/lib/db/schema";
import * as biz from "@/lib/domain/commande";
import * as fx from "@/lib/domain/feux";
import { getChuteDefaut } from "@/lib/services/commandes";

/* Lecture agrégée des cinq écrans de préparation. Une seule requête par table,
 * recollées en mémoire : la liste tient dans quelques centaines de lignes et
 * chaque écran a besoin de l'ensemble pour calculer les feux. */

export type PreparationRow = {
  id: number;
  of: string;
  modele: string;
  refArticle: string;
  couleur: string;
  client: string;
  faconnier: string;
  chaine: string;
  qte: number;

  dateExport: string;
  receptTissu: string;
  joursExport: number | null;
  joursRetardReception: number | null;

  /* nomenclature */
  consoTheo: number | null;
  consoReel: number | null;
  chutePct: number | null;
  chuteEffective: number;
  besoinTissu: number;
  ecartTissu: number | null;
  ecartConsoPct: number | null;

  /* tissu */
  tissuRecu: number;
  tissuDateReelle: string;
  tissuControle: string;
  tissuNote: string;

  /* fournitures */
  fournituresStatut: string;
  fournitures: fx.LigneFourniture[];

  /* tds + modélisme */
  tds: fx.Tds[];
  okPro: boolean;
  refOkPro: string;
  etapes: fx.Etape[];

  /* lancement */
  lancement: fx.Lancement | null;

  /* dérivés */
  feux: fx.Feu[];
  bloquants: fx.Feu[];
  pret: boolean;
  lancee: boolean;
  statut: fx.StatutPrepa;
};

const iso = (d: string | null) => d ?? "";

export async function listPreparation(): Promise<PreparationRow[]> {
  const [rows, chuteDefaut] = await Promise.all([
    db
      .select({ c: commande, clientNom: client.nom, faconnierNom: faconnier.nom, chaineNom: chaine.nom })
      .from(commande)
      .leftJoin(client, eq(commande.clientId, client.id))
      .leftJoin(faconnier, eq(commande.faconnierId, faconnier.id))
      .leftJoin(chaine, eq(commande.chaineId, chaine.id))
      .where(eq(commande.archived, false))
      .orderBy(commande.id),
    getChuteDefaut(),
  ]);

  const ids = rows.map((r) => r.c.id);
  if (!ids.length) return [];

  const [tdsRows, etapeRows, fournRows, lancRows] = await Promise.all([
    db.select().from(commandeTds).where(inArray(commandeTds.commandeId, ids)).orderBy(asc(commandeTds.n)),
    db.select().from(commandeEtape).where(inArray(commandeEtape.commandeId, ids)),
    db
      .select()
      .from(commandeFournitureLigne)
      .where(inArray(commandeFournitureLigne.commandeId, ids))
      .orderBy(asc(commandeFournitureLigne.id)),
    db.select().from(commandeLancement).where(inArray(commandeLancement.commandeId, ids)),
  ]);

  const groupBy = <T extends { commandeId: number }>(list: T[]) => {
    const m = new Map<number, T[]>();
    for (const r of list) {
      const g = m.get(r.commandeId);
      if (g) g.push(r);
      else m.set(r.commandeId, [r]);
    }
    return m;
  };
  const parTds = groupBy(tdsRows);
  const parEtape = groupBy(etapeRows);
  const parFourn = groupBy(fournRows);
  const parLanc = new Map(lancRows.map((l) => [l.commandeId, l]));
  const now = new Date();

  return rows.map(({ c, clientNom, faconnierNom, chaineNom }) => {
    const tds: fx.Tds[] = (parTds.get(c.id) ?? []).map((t) => ({
      id: t.id, n: t.n, envoi: t.envoi, retour: t.retour,
      verdict: t.verdict, commentaire: t.commentaire, par: t.par,
    }));
    const etapes: fx.Etape[] = (parEtape.get(c.id) ?? []).map((e) => ({
      etape: e.etape, fait: e.fait, date: e.date, par: e.par,
    }));
    const fournitures: fx.LigneFourniture[] = (parFourn.get(c.id) ?? []).map((f) => ({
      id: f.id, designation: f.designation, qtePrevue: f.qtePrevue, qteRecue: f.qteRecue, unite: f.unite,
    }));
    const l = parLanc.get(c.id);
    const lancement: fx.Lancement | null = l
      ? {
          date: l.date, mode: l.mode, par: l.par,
          derogationMotif: l.derogationMotif, derogationPar: l.derogationPar,
          derogationDate: l.derogationDate, derogationManques: l.derogationManques,
        }
      : null;

    const commandeFacts = { ...c, statutGlobalFournitures: c.fournituresStatut };
    const ctx: fx.ContextePrepa = { commande: commandeFacts, tds, etapes, fournitures, lancement, chuteDefaut };
    const tousFeux = fx.feux(ctx);

    return {
      id: c.id,
      of: c.ofNumber,
      modele: c.modele,
      refArticle: c.refArticle,
      couleur: c.couleur,
      client: clientNom ?? "",
      faconnier: faconnierNom ?? "",
      chaine: chaineNom ?? "",
      qte: c.qte,

      dateExport: iso(c.dateExport),
      receptTissu: iso(c.receptTissu),
      joursExport: biz.joursJusqua(c.dateExport, now),
      joursRetardReception: fx.receptionEnRetard(commandeFacts, now),

      consoTheo: c.consoTheo,
      consoReel: c.consoReel,
      chutePct: c.chutePct,
      chuteEffective: biz.chuteEffective(c, chuteDefaut),
      besoinTissu: biz.besoinTissu(c, chuteDefaut),
      ecartTissu: biz.ecartTissu(c, chuteDefaut),
      ecartConsoPct: fx.ecartConsommationPct(c),

      tissuRecu: c.tissuRecu,
      tissuDateReelle: iso(c.tissuDateReelle),
      tissuControle: c.tissuControle,
      tissuNote: c.tissuNote,

      fournituresStatut: c.fournituresStatut,
      fournitures,

      tds,
      okPro: fx.estOkPro(tds),
      refOkPro: fx.referenceOkPro(tds),
      etapes,

      lancement,

      feux: tousFeux,
      bloquants: tousFeux.filter((f) => f.bloquant && f.etat.kind !== "ok"),
      pret: fx.estPret(ctx),
      lancee: lancement !== null,
      statut: fx.statutPreparation(ctx),
    };
  });
}

/** Journal d'une fiche, du plus récent au plus ancien. */
export async function journalDe(commandeId: number, domaine?: string) {
  const where = domaine
    ? and(eq(commandeJournal.commandeId, commandeId), eq(commandeJournal.domaine, domaine))
    : eq(commandeJournal.commandeId, commandeId);
  return db.select().from(commandeJournal).where(where).orderBy(desc(commandeJournal.ts)).limit(400);
}

/* ─────────── écriture ───────────
 * Chaque mutation passe par une transaction qui écrit aussi la ligne de
 * journal : une modification sans trace n'existe pas. */

export type Auteur = { id: string; name: string; role: string };

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function log(
  tx: Tx,
  commandeId: number,
  auteur: Auteur,
  domaine: fx.DomainePrepa,
  action: string,
  opts: { detail?: string; avant?: string | number | null; apres?: string | number | null } = {},
) {
  await tx.insert(commandeJournal).values({
    commandeId,
    par: auteur.name,
    role: auteur.role,
    domaine,
    action,
    detail: opts.detail ?? "",
    avant: opts.avant == null ? "" : String(opts.avant),
    apres: opts.apres == null ? "" : String(opts.apres),
  });
}

const VERDICT_LABEL: Record<string, string> = {
  attente: "En attente client",
  ok: "OK Production",
  refus: "Refusée",
};
const CONTROLE_LABEL: Record<string, string> = {
  "": "Non contrôlé",
  conforme: "Conforme",
  reserve: "Accepté sous réserve",
  refuse: "Refusé",
};

/* ── têtes de série ── */

export async function ajouterTds(commandeId: number, auteur: Auteur) {
  return db.transaction(async (tx) => {
    const existantes = await tx.select().from(commandeTds).where(eq(commandeTds.commandeId, commandeId));
    const n = existantes.reduce((max, t) => Math.max(max, t.n), 0) + 1;
    await tx
      .insert(commandeTds)
      .values({ commandeId, n, envoi: biz.todayISO(), verdict: "attente", par: auteur.name });
    await log(tx, commandeId, auteur, "tds", `TDS${n} lancée`, { apres: `envoyée le ${biz.todayISO()}` });
    return n;
  });
}

export async function majTds(
  tdsId: number,
  champ: "envoi" | "retour" | "verdict" | "commentaire",
  valeur: string,
  auteur: Auteur,
) {
  return db.transaction(async (tx) => {
    const [t] = await tx.select().from(commandeTds).where(eq(commandeTds.id, tdsId));
    if (!t) throw new Error("Tête de série introuvable");
    const avant = t[champ] ?? "";
    if (String(avant) === valeur) return;

    const patch: Record<string, string | null> = { [champ]: valeur || null };
    // Valider une TDS date automatiquement le retour s'il manque.
    if (champ === "verdict" && (valeur === "ok" || valeur === "refus") && !t.retour) {
      patch.retour = biz.todayISO();
    }
    if (champ === "commentaire") patch[champ] = valeur;
    await tx.update(commandeTds).set(patch).where(eq(commandeTds.id, tdsId));

    if (champ === "verdict") {
      await log(tx, t.commandeId, auteur, "tds", `TDS${t.n} — ${VERDICT_LABEL[valeur] ?? valeur}`, {
        avant: VERDICT_LABEL[String(avant)] ?? String(avant),
        apres: VERDICT_LABEL[valeur] ?? valeur,
      });
    } else {
      const lbl = { envoi: "date d'envoi", retour: "date de retour", commentaire: "commentaire client" }[champ];
      await log(tx, t.commandeId, auteur, "tds", `TDS${t.n} — ${lbl} modifiée`, { avant, apres: valeur });
    }
  });
}

export async function supprimerTds(tdsId: number, auteur: Auteur) {
  return db.transaction(async (tx) => {
    const [t] = await tx.select().from(commandeTds).where(eq(commandeTds.id, tdsId));
    if (!t) return;
    await tx.delete(commandeTds).where(eq(commandeTds.id, tdsId));
    // Renuméroter pour que le cycle reste TDS1, TDS2… sans trou.
    const reste = await tx
      .select()
      .from(commandeTds)
      .where(eq(commandeTds.commandeId, t.commandeId))
      .orderBy(asc(commandeTds.n));
    // Décalage en deux temps : la contrainte d'unicité (commande, n) interdit
    // de réutiliser un rang encore occupé.
    for (const [i, r] of reste.entries()) {
      if (r.n !== i + 1) await tx.update(commandeTds).set({ n: -(i + 1) }).where(eq(commandeTds.id, r.id));
    }
    for (const [i, r] of reste.entries()) {
      if (r.n !== i + 1) await tx.update(commandeTds).set({ n: i + 1 }).where(eq(commandeTds.id, r.id));
    }
    await log(tx, t.commandeId, auteur, "tds", `TDS${t.n} supprimée`, { avant: `TDS${t.n}` });
  });
}

/* ── modélisme ── */

export async function majEtape(commandeId: number, etape: "patronage" | "traces", fait: boolean, auteur: Auteur) {
  const label = etape === "patronage" ? "Patronage modéliste" : "Tirage des tracés";
  return db.transaction(async (tx) => {
    const [avant] = await tx
      .select()
      .from(commandeEtape)
      .where(and(eq(commandeEtape.commandeId, commandeId), eq(commandeEtape.etape, etape)));
    const valeurs = { fait, date: fait ? biz.todayISO() : null, par: fait ? auteur.name : "" };
    await tx
      .insert(commandeEtape)
      .values({ commandeId, etape, ...valeurs })
      .onConflictDoUpdate({ target: [commandeEtape.commandeId, commandeEtape.etape], set: valeurs });
    await log(tx, commandeId, auteur, "modelisme", `${label}${fait ? " validé" : " dévalidé"}`, {
      avant: avant?.fait ? "fait" : "à faire",
      apres: fait ? "fait" : "à faire",
    });
  });
}

/* ── nomenclature & tissu (champs portés par la commande) ── */

const CHAMPS_COMMANDE = {
  consoTheo: { domaine: "nomen", label: "consommation théorique", type: "number" },
  consoReel: { domaine: "nomen", label: "consommation réelle", type: "number" },
  chutePct: { domaine: "nomen", label: "taux de chute", type: "number" },
  tissuRecu: { domaine: "tissu", label: "métrage reçu", type: "number" },
  receptTissu: { domaine: "tissu", label: "date de réception prévue", type: "date" },
  tissuDateReelle: { domaine: "tissu", label: "date de réception réelle", type: "date" },
  tissuControle: { domaine: "tissu", label: "contrôle qualité", type: "enum" },
  tissuNote: { domaine: "tissu", label: "observations", type: "text" },
  fournituresStatut: { domaine: "four", label: "statut global des fournitures", type: "enum" },
} as const;

export type ChampCommandePrepa = keyof typeof CHAMPS_COMMANDE;
export const champDomaine = (champ: ChampCommandePrepa) => CHAMPS_COMMANDE[champ].domaine as fx.DomainePrepa;

export async function majChampCommande(commandeId: number, champ: ChampCommandePrepa, valeur: string, auteur: Auteur) {
  const cfg = CHAMPS_COMMANDE[champ];
  return db.transaction(async (tx) => {
    const [c] = await tx.select().from(commande).where(eq(commande.id, commandeId));
    if (!c) throw new Error("Commande introuvable");

    let nouvelle: string | number | null;
    if (cfg.type === "number") {
      if (valeur === "") nouvelle = champ === "tissuRecu" ? 0 : null;
      else {
        const n = Number(valeur.replace(",", "."));
        if (!Number.isFinite(n) || n < 0) throw new Error("Valeur invalide");
        nouvelle = n;
      }
    } else if (cfg.type === "date") {
      nouvelle = valeur || null;
    } else {
      nouvelle = valeur;
    }

    const avant = c[champ];
    if (String(avant ?? "") === String(nouvelle ?? "")) return;

    const patch: Record<string, unknown> = { [champ]: nouvelle, updatedAt: new Date() };
    // Un tissu conforme ou accepté sous réserve libère la coupe.
    if (champ === "tissuControle") patch.tissuLibere = nouvelle === "conforme" || nouvelle === "reserve";
    await tx.update(commande).set(patch).where(eq(commande.id, commandeId));

    const action = champ === "tissuControle" ? "Contrôle tissu" : `Modification — ${cfg.label}`;
    const lisible = (v: unknown) =>
      cfg.type === "enum" && champ === "tissuControle" ? (CONTROLE_LABEL[String(v ?? "")] ?? String(v ?? "")) : v;
    await log(tx, commandeId, auteur, cfg.domaine as fx.DomainePrepa, action, {
      avant: lisible(avant) as string,
      apres: lisible(nouvelle) as string,
    });
  });
}

/* ── fournitures ── */

export async function ajouterLigneFourniture(commandeId: number, auteur: Auteur) {
  return db.transaction(async (tx) => {
    await tx.insert(commandeFournitureLigne).values({ commandeId });
    await log(tx, commandeId, auteur, "four", "Ligne de fourniture ajoutée", { apres: "nouvelle ligne" });
  });
}

export async function majLigneFourniture(
  ligneId: number,
  champ: "designation" | "qtePrevue" | "qteRecue" | "unite",
  valeur: string,
  auteur: Auteur,
) {
  return db.transaction(async (tx) => {
    const [l] = await tx.select().from(commandeFournitureLigne).where(eq(commandeFournitureLigne.id, ligneId));
    if (!l) throw new Error("Ligne introuvable");
    const numerique = champ === "qtePrevue" || champ === "qteRecue";
    const nouvelle = numerique ? Math.max(0, Number(valeur.replace(",", ".")) || 0) : valeur;
    const avant = l[champ];
    if (String(avant) === String(nouvelle)) return;

    await tx
      .update(commandeFournitureLigne)
      .set({ [champ]: nouvelle })
      .where(eq(commandeFournitureLigne.id, ligneId));

    const lbl = { designation: "désignation", qtePrevue: "quantité prévue", qteRecue: "quantité reçue", unite: "unité" }[champ];
    await log(tx, l.commandeId, auteur, "four", `${l.designation || "Ligne sans désignation"} — ${lbl}`, {
      avant, apres: nouvelle,
    });
  });
}

export async function supprimerLigneFourniture(ligneId: number, auteur: Auteur) {
  return db.transaction(async (tx) => {
    const [l] = await tx.select().from(commandeFournitureLigne).where(eq(commandeFournitureLigne.id, ligneId));
    if (!l) return;
    await tx.delete(commandeFournitureLigne).where(eq(commandeFournitureLigne.id, ligneId));
    await log(tx, l.commandeId, auteur, "four", "Ligne de fourniture retirée", {
      avant: l.designation || "ligne sans désignation",
    });
  });
}

/* ── lancement ── */

export type ModeLancement = "interne" | "soustraitance";

export async function lancer(
  commandeId: number,
  mode: ModeLancement,
  auteur: Auteur,
  opts: { faconnierId?: number | null; derogation?: { motif: string; manques: string[] } } = {},
) {
  return db.transaction(async (tx) => {
    const [c] = await tx.select().from(commande).where(eq(commande.id, commandeId));
    if (!c) throw new Error("Commande introuvable");

    // Le mode d'assignation est exclusif : sous-traitance efface la chaîne
    // interne, coupe interne efface le façonnier.
    const patch =
      mode === "soustraitance"
        ? { faconnierId: opts.faconnierId ?? c.faconnierId, chaineId: null }
        : { faconnierId: null };
    await tx.update(commande).set({ ...patch, updatedAt: new Date() }).where(eq(commande.id, commandeId));

    const d = opts.derogation;
    await tx
      .insert(commandeLancement)
      .values({
        commandeId,
        date: biz.todayISO(),
        mode,
        par: auteur.name,
        derogationMotif: d?.motif ?? null,
        derogationPar: d ? auteur.name : null,
        derogationDate: d ? biz.todayISO() : null,
        derogationManques: d?.manques ?? [],
      })
      .onConflictDoNothing({ target: commandeLancement.commandeId });

    const modeLbl = mode === "soustraitance" ? "sous-traitance" : "coupe interne";
    await log(tx, commandeId, auteur, "lancement", d ? "⚠ Lancement PAR DÉROGATION" : "Lancement en production", {
      detail: modeLbl,
      avant: "non lancée",
      apres: modeLbl + (d ? ` — dérogation : ${d.motif}` : ""),
    });
  });
}

export async function annulerLancement(commandeId: number, auteur: Auteur) {
  return db.transaction(async (tx) => {
    const [l] = await tx.select().from(commandeLancement).where(eq(commandeLancement.commandeId, commandeId));
    if (!l) return;
    await tx.delete(commandeLancement).where(eq(commandeLancement.commandeId, commandeId));
    await log(tx, commandeId, auteur, "lancement", "Lancement annulé", {
      avant: `${l.mode === "soustraitance" ? "sous-traitance" : "coupe interne"} le ${l.date}`,
      apres: "non lancée",
    });
  });
}

/** Contexte d'une seule commande — sert aux actions qui doivent revérifier la
 * règle de lancement côté serveur avant d'écrire. */
export async function contexteDe(commandeId: number): Promise<fx.ContextePrepa | null> {
  const rows = await listPreparation();
  const r = rows.find((x) => x.id === commandeId);
  if (!r) return null;
  const [c] = await db.select().from(commande).where(eq(commande.id, commandeId));
  return {
    commande: { ...c, statutGlobalFournitures: c.fournituresStatut },
    tds: r.tds,
    etapes: r.etapes,
    fournitures: r.fournitures,
    lancement: r.lancement,
    chuteDefaut: await getChuteDefaut(),
  };
}
