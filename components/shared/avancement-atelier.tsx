"use client";

import { useState } from "react";
import type { JourAvancement } from "@/lib/domain/soustraitant";

/* Avancement d'une commande chez un atelier extérieur — le même affichage
 * pour l'atelier (son portail) et pour nous (Suivi sous-traitants) :
 * des barres face à la quantité COMMANDÉE, et le journal jour par jour
 * (coupé, lancé, produit, livré). */

const nb = new Intl.NumberFormat("fr-FR");
const dateFr = (iso: string) => (/^\d{4}-\d{2}-\d{2}/.test(iso ?? "") ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

export type AvancementAffiche = {
  qte: number;
  coupe: number;
  lance: number;
  produit: number;
  emballe: number;
  recu: number;
  reste: number;
  livree: boolean;
  journal: JourAvancement[];
};

function Barre({ label, valeur, sur, ton }: { label: string; valeur: number; sur: number; ton: string }) {
  const pct = sur > 0 ? Math.min(100, Math.round((valeur / sur) * 100)) : 0;
  return (
    <div className="grid grid-cols-[88px_1fr_96px] items-center gap-2 text-xs">
      <span className="font-semibold text-slate-600">{label}</span>
      <span className="h-2.5 overflow-hidden rounded-full bg-slate-200">
        <span className={`block h-full rounded-full ${ton}`} style={{ width: `${pct}%` }} />
      </span>
      <span className="text-right tabular-nums">
        <b>{nb.format(valeur)}</b> / {nb.format(sur)} <span className="text-slate-500">({pct} %)</span>
      </span>
    </div>
  );
}

/** Barres face au commandé : coupé, lancé, produit (chaîne), emballé, livré. */
export function BarresAvancement({ a }: { a: AvancementAffiche }) {
  return (
    <div className="space-y-1">
      <Barre label="Coupé" valeur={a.coupe} sur={a.qte} ton="bg-slate-500" />
      <Barre label="Lancé" valeur={a.lance} sur={a.qte} ton="bg-sky-500" />
      <Barre label="Produit" valeur={a.produit} sur={a.qte} ton="bg-emerald-600" />
      <Barre label="Emballé" valeur={a.emballe} sur={a.qte} ton="bg-teal-500" />
      <Barre label="Livré (reçu)" valeur={a.recu} sur={a.qte} ton="bg-amber-500" />
    </div>
  );
}

/** Journal jour par jour (le plus récent en haut) ; replié au-delà de 10 jours. */
export function JournalJours({ journal }: { journal: JourAvancement[] }) {
  const [tout, setTout] = useState(false);
  if (!journal.length) return <p className="text-xs text-slate-500">Rien encore : ni coupe, ni saisie, ni livraison.</p>;
  const vus = tout ? journal : journal.slice(0, 10);
  const cell = (jour: number, cumul: number) =>
    jour === 0 && cumul === 0 ? (
      <span className="text-slate-300">—</span>
    ) : (
      <>
        <b className={jour < 0 ? "text-red-700" : ""}>{jour > 0 ? `+${nb.format(jour)}` : jour < 0 ? nb.format(jour) : "0"}</b>
        <span className="text-slate-500"> ({nb.format(cumul)})</span>
      </>
    );
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-[10px] uppercase text-slate-500">
            <th className="py-1 text-left">Jour</th>
            <th className="text-right">Coupé</th>
            <th className="text-right">Lancé</th>
            <th className="text-right">Produit</th>
            <th className="text-right">Livré</th>
          </tr>
        </thead>
        <tbody>
          {vus.map((j) => (
            <tr key={j.jour} className="border-t">
              <td className="py-1 font-semibold">{dateFr(j.jour)}</td>
              <td className="text-right tabular-nums">{cell(j.coupe, j.coupeCumul)}</td>
              <td className="text-right tabular-nums">{cell(j.lance, j.lanceCumul)}</td>
              <td className="text-right tabular-nums">{cell(j.produit, j.produitCumul)}</td>
              <td className="text-right tabular-nums">{cell(j.livre, j.livreCumul)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-1 text-[10px] text-slate-500">
        Chiffre du jour, et (entre parenthèses) le total depuis le début.
        {journal.length > 10 && (
          <button onClick={() => setTout(!tout)} className="ml-2 underline">
            {tout ? "Voir moins" : `Voir les ${journal.length} jours`}
          </button>
        )}
      </div>
    </div>
  );
}
