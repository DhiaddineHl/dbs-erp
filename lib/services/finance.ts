import "server-only";
import { asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  compteBancaire,
  facture,
  fournisseurCompte,
  fournisseurTransaction,
  reglement,
} from "@/lib/db/schema";
import * as fin from "@/lib/domain/finance";
import { getSetting, setSetting } from "@/lib/services/permissions";

/* ─────────── encaissements ─────────── */

export type ReglementRow = {
  id: number;
  factureId: number;
  date: string;
  montant: number;
  mode: string;
  compteId: number | null;
  compte: string;
  ref: string;
  note: string;
};

export type EncaissementRow = {
  factureId: number;
  num: string;
  type: string;
  date: string;
  clientKey: string;
  marque: string;
  total: number;
  paiement: string;
  echeance: string;
  joursRetard: number | null;
  regle: number;
  reste: number;
  statut: fin.StatutPaiement;
  reglements: ReglementRow[];
};

export const listComptesBancaires = () =>
  db.select().from(compteBancaire).orderBy(asc(compteBancaire.ordre), asc(compteBancaire.libelle));

/** Toutes les factures actives avec leur état d'encaissement. Les avoirs et
 * proformas sont exclus : ils ne s'encaissent pas. */
export async function listEncaissements(): Promise<EncaissementRow[]> {
  const [factures, reglements, comptes] = await Promise.all([
    db.select().from(facture).where(isNull(facture.deletedAt)).orderBy(desc(facture.date)),
    db.select().from(reglement).orderBy(asc(reglement.date)),
    listComptesBancaires(),
  ]);
  const nomCompte = new Map(comptes.map((c) => [c.id, c.libelle]));

  const parFacture = new Map<number, typeof reglements>();
  for (const r of reglements) {
    const g = parFacture.get(r.factureId);
    if (g) g.push(r);
    else parFacture.set(r.factureId, [r]);
  }
  const now = new Date();

  return factures
    .filter((f) => f.type === "facture")
    .map((f) => {
      const rs = parFacture.get(f.id) ?? [];
      const facts = { type: f.type, date: f.date, total: f.total, paiement: f.paiement };
      return {
        factureId: f.id,
        num: f.num,
        type: f.type,
        date: f.date,
        clientKey: f.clientKey ?? "",
        marque: f.marque,
        total: f.total,
        paiement: f.paiement,
        echeance: fin.dateEcheance(f.date, f.paiement) ?? "",
        joursRetard: fin.joursRetard(f.date, f.paiement, now),
        regle: fin.totalRegle(rs),
        reste: fin.resteDu(f.total, rs),
        statut: fin.statutPaiement(facts, rs, now),
        reglements: rs.map((r) => ({
          id: r.id, factureId: r.factureId, date: r.date, montant: r.montant, mode: r.mode,
          compteId: r.compteId, compte: r.compteId ? (nomCompte.get(r.compteId) ?? "") : "",
          ref: r.ref, note: r.note,
        })),
      };
    });
}

export async function ajouterReglement(v: {
  factureId: number;
  date: string;
  montant: number;
  mode: string;
  compteId: number | null;
  ref: string;
  note: string;
}) {
  const [row] = await db.insert(reglement).values(v).returning({ id: reglement.id });
  return row.id;
}

export async function majReglement(id: number, patch: Partial<typeof reglement.$inferInsert>) {
  await db.update(reglement).set(patch).where(eq(reglement.id, id));
}

export async function supprimerReglement(id: number) {
  await db.delete(reglement).where(eq(reglement.id, id));
}

export async function ajouterCompteBancaire(libelle: string) {
  const [row] = await db
    .insert(compteBancaire)
    .values({ libelle })
    .onConflictDoNothing({ target: compteBancaire.libelle })
    .returning({ id: compteBancaire.id });
  return row?.id ?? null;
}

export async function renommerCompteBancaire(id: number, libelle: string) {
  await db.update(compteBancaire).set({ libelle }).where(eq(compteBancaire.id, id));
}

export async function supprimerCompteBancaire(id: number) {
  await db.delete(compteBancaire).where(eq(compteBancaire.id, id));
}

/* ─────────── grand livre fournisseurs ─────────── */

export type TransactionRow = {
  id: number;
  date: string;
  libelle: string;
  debit: number;
  credit: number;
  /** Solde progressif à cette ligne, dans la devise du compte. */
  soldeCumule: number;
};

export type CompteFournisseurRow = {
  id: number;
  nom: string;
  categorie: string;
  devise: string;
  totalCredit: number;
  totalDebit: number;
  solde: number;
  soldeTND: number;
  statut: fin.StatutSolde;
  nbTransactions: number;
  transactions: TransactionRow[];
};

export const getTauxEur = () => getSetting<number>("tauxEur", 3.34);
export const setTauxEur = (taux: number) => setSetting("tauxEur", taux);

export async function listComptesFournisseurs(): Promise<CompteFournisseurRow[]> {
  const [comptes, transactions, taux] = await Promise.all([
    db.select().from(fournisseurCompte).orderBy(asc(fournisseurCompte.nom)),
    db
      .select()
      .from(fournisseurTransaction)
      .orderBy(asc(fournisseurTransaction.date), asc(fournisseurTransaction.id)),
    getTauxEur(),
  ]);

  const parCompte = new Map<number, typeof transactions>();
  for (const t of transactions) {
    const g = parCompte.get(t.compteId);
    if (g) g.push(t);
    else parCompte.set(t.compteId, [t]);
  }

  return comptes.map((c) => {
    const tx = parCompte.get(c.id) ?? [];
    const s = fin.soldeCompte(tx, c.devise, taux);
    let cumul = 0;
    return {
      id: c.id,
      nom: c.nom,
      categorie: c.categorie,
      devise: c.devise,
      ...s,
      statut: fin.statutSolde(s.soldeTND),
      nbTransactions: tx.length,
      transactions: tx.map((t) => {
        cumul = Math.round((cumul + (t.credit || 0) - (t.debit || 0)) * 1000) / 1000;
        return { id: t.id, date: t.date, libelle: t.libelle, debit: t.debit, credit: t.credit, soldeCumule: cumul };
      }),
    };
  });
}

export async function creerCompteFournisseur(v: { nom: string; categorie: string; devise: string }) {
  const [row] = await db.insert(fournisseurCompte).values(v).returning({ id: fournisseurCompte.id });
  return row.id;
}

export async function majCompteFournisseur(id: number, patch: Partial<typeof fournisseurCompte.$inferInsert>) {
  await db.update(fournisseurCompte).set(patch).where(eq(fournisseurCompte.id, id));
}

export async function supprimerCompteFournisseur(id: number) {
  await db.delete(fournisseurCompte).where(eq(fournisseurCompte.id, id));
}

export async function ajouterTransaction(v: {
  compteId: number;
  date: string;
  libelle: string;
  debit: number;
  credit: number;
}) {
  const [row] = await db.insert(fournisseurTransaction).values(v).returning({ id: fournisseurTransaction.id });
  return row.id;
}

export async function majTransaction(id: number, patch: Partial<typeof fournisseurTransaction.$inferInsert>) {
  await db.update(fournisseurTransaction).set(patch).where(eq(fournisseurTransaction.id, id));
}

export async function supprimerTransactions(ids: number[]) {
  if (ids.length) await db.delete(fournisseurTransaction).where(inArray(fournisseurTransaction.id, ids));
}
