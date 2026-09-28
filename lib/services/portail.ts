import "server-only";
import { headers } from "next/headers";
import { getSetting } from "@/lib/services/permissions";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { chaine, journee, modele, ouvriere, personnel } from "@/lib/db/schema";
import * as rd from "@/lib/domain/rendement";
import * as rp from "@/lib/domain/rendement-personne";

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

/** Toutes les personnes, jour par jour, avec la règle unique d'identité
 * (lib/domain/rendement-personne) — exactement celle de l'écran GPAO. */
async function joursParPersonne() {
  const [journees, lignes, registre] = await Promise.all([
    db.select().from(journee).orderBy(asc(journee.date)),
    db.select().from(ouvriere),
    db.select({ id: personnel.id, nom: personnel.nom }).from(personnel),
  ]);
  const parChaine = new Map<number, rp.LigneEffectif[]>();
  for (const l of [...lignes].sort((a, b) => a.id - b.id)) {
    const e = { id: l.id, nom: l.nom, poste: l.poste, sam: l.sam, personnelId: l.personnelId };
    const g = parChaine.get(l.chaineId);
    if (g) g.push(e);
    else parChaine.set(l.chaineId, [e]);
  }
  const cleDe = rp.resolveurIdentite(registre, lignes);
  // Effectif du jour : celui qu'elle a figé, sinon celui de sa chaîne (comme l'écran).
  return rp.regrouperParPersonne(
    journees.map((j) => ({
      journee: versBrute(j),
      lignes: (j.ouvrieres ?? []).length ? (j.ouvrieres as rp.LigneEffectif[]) : (parChaine.get(j.chaineId) ?? []),
      meta: null,
    })),
    cleDe,
  );
}

function versRendement(
  identite: { nom: string; matricule: string; poste: string },
  jours: rp.JourPersonne<null>[],
): rd.Rendement {
  const periode = rp.periodeGenerale();
  const general = rp.synthese(jours, periode);
  const mois = rp.synthese(jours, rp.periodeMois());
  const liste: rd.JourRendement[] = jours.map((j) => ({
    date: j.date,
    rendement: j.rendement,
    pieces: j.pieces,
    retouches: j.retouches,
    barres: j.barres,
  }));
  return {
    ...identite,
    trouve: liste.length > 0,
    general: general.rendement,
    periode: { ...periode, jours: general.jours },
    mois: { rendement: mois.rendement, jours: mois.jours },
    jours: liste,
    dernier: liste.at(-1) ?? null,
    piecesTotal: general.pieces,
    retouchesTotal: general.retouches,
  };
}

/** Rendement d'une personne à partir de la clé de son QR.
 * Renvoie null si la clé est inconnue — jamais d'indice sur ce qui existe.
 *
 * Même identité et même calcul que l'écran GPAO : chaque jour est le chiffre
 * de l'écran TV, le « général » est la moyenne pondérée des 30 derniers jours —
 * la période par défaut de l'historique. */
export async function rendementParCle(cle: string): Promise<rd.Rendement | null> {
  if (!cle || cle.length > 64) return null;
  const [personne] = await db.select().from(personnel).where(eq(personnel.portailCle, cle));
  if (!personne) return null;
  const parPersonne = await joursParPersonne();
  const jours = parPersonne.get(`P:${personne.id}`) ?? [];
  const r = versRendement({ nom: personne.nom, matricule: personne.matricule, poste: personne.fonction }, jours);
  // À défaut de fonction au registre, montrer le dernier poste réellement tenu.
  if (!r.poste) r.poste = jours.at(-1)?.lignes[0]?.poste ?? "";
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
  // Le rendement affiché sur la carte = celui du portail (30 derniers jours).
  const parPersonne = await joursParPersonne();
  const periode = rp.periodeGenerale();
  for (const c of cartes) c.general = rp.synthese(parPersonne.get(`P:${c.personnelId}`) ?? [], periode).rendement;
  return cartes;
}

/** Adresse de base des QR : celle configurée par l'administrateur (écran QR
 * rendement), sinon l'origine de la requête en cours — qui suffit tant qu'on
 * reste sur le même réseau, et qui donne au moins un QR testable tout de suite. */
export async function basePortail(): Promise<string> {
  const reglee = await getSetting<string>("basePortail", "");
  if (reglee) return reglee;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return host ? `${proto}://${host}` : "";
}
