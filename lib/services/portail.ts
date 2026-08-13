import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { chaine, journee, modele, ouvriere, personnel } from "@/lib/db/schema";
import * as rd from "@/lib/domain/rendement";

/* Lectures du portail public. Pas de session : l'accès tient à la clé opaque
 * portée par le QR, et rien d'autre n'est exposé — ni prix, ni commande, ni
 * liste du personnel. */

type JourneeLigne = typeof journee.$inferSelect;

function versBrute(j: JourneeLigne): rd.JourneeBrute {
  return {
    date: j.date,
    cols: j.cols ?? [],
    ops: (j.ops ?? {}) as rd.JourneeBrute["ops"],
    opsSam: (j.opsSam ?? {}) as rd.JourneeBrute["opsSam"],
    opsDetail: (j.opsDetail ?? {}) as rd.JourneeBrute["opsDetail"],
    ret: (j.ret ?? {}) as rd.JourneeBrute["ret"],
  };
}

/** Rendement d'une personne à partir de la clé de son QR.
 * Renvoie null si la clé est inconnue — jamais d'indice sur ce qui existe. */
export async function rendementParCle(cle: string): Promise<rd.Rendement | null> {
  if (!cle || cle.length > 64) return null;

  const [personne] = await db.select().from(personnel).where(eq(personnel.portailCle, cle));
  if (!personne) return null;

  // Toutes les lignes ouvrière rattachées à cette personne, toutes chaînes.
  const lignes = await db.select().from(ouvriere).where(eq(ouvriere.personnelId, personne.id));
  const identite = { nom: personne.nom, matricule: personne.matricule, poste: personne.fonction };
  if (!lignes.length) return rd.rendementOuvriere(identite, []);

  const parId = new Map(lignes.map((l) => [l.id, l]));
  const journees = await db.select().from(journee).orderBy(asc(journee.date));

  const paires: { journee: rd.JourneeBrute; ouvriere: rd.OuvriereBrute }[] = [];
  for (const j of journees) {
    const brute = versBrute(j);
    // La journée concerne la personne si une de ses lignes y a une saisie.
    for (const l of lignes) {
      const aSaisie =
        brute.cols.some((c) => rd.heureTravaillee(brute, l.id, c)) || Number(brute.ret[l.id] ?? 0) > 0;
      if (!aSaisie) continue;
      paires.push({
        journee: brute,
        ouvriere: { id: l.id, nom: l.nom, poste: l.poste, sam: l.sam },
      });
      break;
    }
  }

  const r = rd.rendementOuvriere(identite, paires);
  // À défaut de fonction au registre, montrer le poste tenu sur la chaîne.
  if (!r.poste) {
    const derniere = paires.at(-1)?.ouvriere ?? parId.values().next().value;
    if (derniere) r.poste = derniere.poste;
  }
  return r;
}

/* ─────────── vue direction ─────────── */

export type VueDirection = {
  date: string;
  global: number | null;
  chaines: rd.LigneChaine[];
  totalPieces: number;
};

/** Dernière journée de chaque chaîne, agrégée. Le QR direction n'est pas
 * nominatif : il montre des chaînes, pas des personnes. */
export async function vueDirection(): Promise<VueDirection> {
  const [journees, chaines, modeles] = await Promise.all([
    db.select().from(journee).orderBy(asc(journee.date)),
    db.select().from(chaine),
    db.select().from(modele),
  ]);

  const nomChaine = new Map(chaines.map((c) => [c.id, c.nom]));
  const parModele = new Map(modeles.map((m) => [m.id, m]));

  const derniere = new Map<number, (typeof journees)[number]>();
  for (const j of journees) {
    const prec = derniere.get(j.chaineId);
    if (!prec || j.date > prec.date) derniere.set(j.chaineId, j);
  }

  const lignes: rd.LigneChaine[] = [];
  let totalPieces = 0;

  for (const j of derniere.values()) {
    const m = parModele.get(j.modeleId);
    const sortie = j.sortie ?? {};
    const cols = j.cols ?? [];
    const total = cols.reduce((s, c) => s + (typeof sortie[c] === "number" ? sortie[c] : 0), 0);
    const obj = rd.objectifHeure(j.effectif, m?.sam ?? 0, j.objManuel);

    lignes.push({
      chaine: nomChaine.get(j.chaineId) ?? "—",
      modele: m?.nom ?? "—",
      date: j.date,
      effectif: j.effectif,
      objectifHeure: obj,
      sortie: total,
      rendement: rd.rendementChaine({
        sortieTotale: total,
        samModele: m?.sam ?? 0,
        effectif: j.effectif,
        nbHeures: j.nbHeures,
      }),
      parHeure: cols.map((c) => ({
        col: c,
        qte: typeof sortie[c] === "number" ? sortie[c] : 0,
        objectif: obj,
      })),
    });
    totalPieces += total;
  }

  lignes.sort((a, b) => a.chaine.localeCompare(b.chaine, "fr"));
  const notes = lignes.map((l) => l.rendement).filter((r) => r > 0);

  return {
    date: lignes[0]?.date ?? "",
    global: notes.length ? Math.round(notes.reduce((s, r) => s + r, 0) / notes.length) : null,
    chaines: lignes,
    totalPieces,
  };
}

/* ─────────── QR ─────────── */

export type CarteQr = {
  personnelId: number;
  nom: string;
  matricule: string;
  poste: string;
  cle: string;
  chaines: string[];
  general: number | null;
};

/** Une carte par personne effectivement affectée à une chaîne : imprimer un QR
 * pour quelqu'un qui ne produit pas ne sert à rien. */
export async function cartesQr(): Promise<CarteQr[]> {
  const rows = await db
    .select({ p: personnel, chaineNom: chaine.nom })
    .from(ouvriere)
    .innerJoin(personnel, eq(ouvriere.personnelId, personnel.id))
    .innerJoin(chaine, eq(ouvriere.chaineId, chaine.id))
    .orderBy(asc(personnel.nom));

  const par = new Map<number, CarteQr>();
  for (const { p, chaineNom } of rows) {
    const c = par.get(p.id);
    if (c) {
      if (!c.chaines.includes(chaineNom)) c.chaines.push(chaineNom);
      continue;
    }
    par.set(p.id, {
      personnelId: p.id, nom: p.nom, matricule: p.matricule, poste: p.fonction,
      cle: p.portailCle, chaines: [chaineNom], general: null,
    });
  }

  const cartes = [...par.values()];
  // Le rendement affiché sur la carte aide à repérer qui est en difficulté.
  await Promise.all(
    cartes.map(async (c) => {
      const r = await rendementParCle(c.cle);
      c.general = r?.general ?? null;
    }),
  );
  return cartes;
}
