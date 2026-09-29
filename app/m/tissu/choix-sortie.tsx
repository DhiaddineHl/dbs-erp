"use client";

import { useState } from "react";
import { DESTINATIONS } from "@/lib/domain/rouleau";

/* Choix commun à la sortie d'un rouleau et à la sortie groupée :
 *   1. le modèle / la commande qui portera ce tissu ;
 *   2. où il part : coupe interne, SOUS-TRAITANT (lequel), atelier, autre.
 * Choisir une commande sous-traitée propose d'office son façonnier ; une
 * commande sur chaîne interne propose « Coupe interne ». Modifiable. */

export type CmdSortie = { id: number; label: string; reservee: boolean; faconnierId: number | null; faconnierNom: string };
export type SousTraitant = { id: number; nom: string };
export type Lieu = { commandeId: number | null; destination: string; faconnierId: number | null };

export function lieuInitial(commandes: CmdSortie[]): Lieu {
  const reservees = commandes.filter((c) => c.reservee);
  const c = reservees.length === 1 ? reservees[0] : null;
  return { commandeId: c?.id ?? null, destination: c?.faconnierId ? "soustraitant" : "coupe", faconnierId: c?.faconnierId ?? null };
}

export const lieuComplet = (l: Lieu, motif: string) =>
  (l.commandeId != null || (l.destination === "autre" && motif.trim() !== "")) && (l.destination !== "soustraitant" || l.faconnierId != null);

export function ChoixSortie({
  commandes,
  sousTraitants,
  valeur: l,
  onChange,
}: {
  commandes: CmdSortie[];
  sousTraitants: SousTraitant[];
  valeur: Lieu;
  onChange: (l: Lieu) => void;
}) {
  const reservees = commandes.filter((c) => c.reservee);
  const [toutes, setToutes] = useState(reservees.length === 0);
  const [filtre, setFiltre] = useState("");
  const f = filtre.trim().toLowerCase();
  const liste = (toutes ? commandes : reservees).filter((c) => !f || c.label.toLowerCase().includes(f));
  const choisir = (c: CmdSortie) =>
    onChange({
      commandeId: c.id,
      destination: c.faconnierId ? "soustraitant" : l.destination === "soustraitant" ? "coupe" : l.destination,
      faconnierId: c.faconnierId ?? null,
    });
  return (
    <>
      <div className="text-sm font-bold text-slate-700">1 · Modèle / commande (OF)</div>
      {toutes && (
        <input value={filtre} onChange={(e) => setFiltre(e.target.value)} placeholder="Chercher un OF, un modèle…" className="w-full rounded-xl border border-slate-300 px-3 py-2.5" />
      )}
      <div className="max-h-56 space-y-1.5 overflow-y-auto">
        {liste.slice(0, 60).map((c) => (
          <button
            key={c.id}
            onClick={() => choisir(c)}
            className={`flex w-full items-center justify-between gap-2 rounded-xl border-2 px-3 py-2.5 text-left text-sm ${l.commandeId === c.id ? "border-slate-900 bg-slate-50" : "border-slate-200"}`}
          >
            <span className="font-bold">{c.label}</span>
            <span className="shrink-0 text-right text-[10px] font-bold uppercase">
              {c.reservee && <span className="block text-emerald-700">réservé</span>}
              <span className="block text-slate-500">{c.faconnierNom ? `sous-traité · ${c.faconnierNom}` : "interne"}</span>
            </span>
          </button>
        ))}
        {liste.length === 0 && <div className="text-sm text-slate-500">{toutes ? "Aucune commande trouvée." : "Aucune commande réservée sur ce lot."}</div>}
      </div>
      {!toutes && (
        <button onClick={() => setToutes(true)} className="text-sm font-semibold text-slate-600 underline">
          Voir toutes les commandes
        </button>
      )}

      <div className="text-sm font-bold text-slate-700">2 · Où part le tissu ?</div>
      <div className="grid grid-cols-2 gap-1.5">
        {DESTINATIONS.map((d) => (
          <button
            key={d.value}
            onClick={() => onChange({ ...l, destination: d.value, faconnierId: d.value === "soustraitant" ? l.faconnierId : null })}
            className={`rounded-xl border-2 py-3 text-sm font-bold ${l.destination === d.value ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200"}`}
          >
            {d.value === "soustraitant" ? "🚚 " : d.value === "coupe" ? "✂ " : ""}
            {d.label}
          </button>
        ))}
      </div>
      {l.destination === "soustraitant" && (
        <div className="space-y-1.5 rounded-xl bg-amber-50 p-2">
          <div className="text-sm font-bold text-amber-900">Chez quel sous-traitant ?</div>
          {sousTraitants.length === 0 && <div className="text-sm text-amber-900">Aucun sous-traitant : créez-le dans Façonniers.</div>}
          <div className="grid grid-cols-2 gap-1.5">
            {sousTraitants.map((s) => (
              <button
                key={s.id}
                onClick={() => onChange({ ...l, faconnierId: s.id })}
                className={`rounded-xl border-2 px-2 py-3 text-sm font-bold ${l.faconnierId === s.id ? "border-amber-600 bg-amber-600 text-white" : "border-amber-200 bg-white"}`}
              >
                {s.nom}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
