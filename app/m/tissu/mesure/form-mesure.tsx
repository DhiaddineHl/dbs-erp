"use client";

import { useState, useTransition } from "react";
import { controleMesure } from "@/lib/domain/rouleau";
import { mesurerRouleau, type RouleauAMesurer } from "@/lib/actions/rouleaux";

const nb = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const lire = (s: string) => Number(String(s).replace(",", ".")) || 0;

export type MesureFaite = { code: string; metrage: number; lot: string; restants: number; total: number; mesure: number };

/* Saisie du métrage d'un rouleau « à mesurer », au scan : un grand champ
 * numérique (le chiffre écrit au stylo sur l'étiquette), la laize et un
 * défaut en option, l'emplacement si on le range tout de suite. Une seule
 * validation = entrée + mise en stock. Utilisé par l'écran de mesure en
 * rafale et par la fiche du rouleau. */
export function FormMesure({
  rouleau: r,
  emplacements,
  onFait,
  onAbandon,
}: {
  rouleau: RouleauAMesurer;
  emplacements: string[];
  onFait: (m: MesureFaite) => void;
  onAbandon?: () => void;
}) {
  const [pending, start] = useTransition();
  const [metrage, setMetrage] = useState("");
  const [laize, setLaize] = useState("");
  const [observations, setObservations] = useState("");
  const [emplacement, setEmplacement] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const u = r.lot.unite;

  const valider = () => {
    const m = lire(metrage);
    const ctl = controleMesure(m, r.annonceParRouleau);
    if (ctl.refus) return setErreur(ctl.refus);
    if (ctl.alerte && !confirm(`${ctl.alerte}\n\nValider ${nb.format(m)} ${u} quand même ?`)) return;
    start(async () => {
      const res = await mesurerRouleau({ code: r.code, metrage, laize, observations, emplacement });
      if (!res.ok) {
        navigator.vibrate?.([80, 60, 80]);
        return setErreur(res.error);
      }
      navigator.vibrate?.(60);
      onFait(res);
    });
  };

  return (
    <div className="space-y-3 rounded-2xl border-4 border-amber-400 bg-white p-4">
      <div>
        <div className="font-mono text-2xl font-black">{r.code}</div>
        <div className="text-sm text-slate-600">
          Lot <b>{r.lot.identifiant}</b> · {r.lot.tissu || "—"}
        </div>
        <div className="text-xs text-slate-500">
          {r.total - r.restants} / {r.total} rouleaux mesurés · {nb.format(r.mesure)} {u}
          {r.annonceParRouleau ? ` · BL : ~${nb.format(r.annonceParRouleau)} ${u} par rouleau` : ""}
        </div>
      </div>
      <label className="block">
        <span className="text-sm font-bold uppercase text-slate-600">Métrage mesuré ({u})</span>
        <input
          autoFocus
          value={metrage}
          onChange={(e) => {
            setErreur(null);
            setMetrage(e.target.value.replace(/[^\d.,]/g, ""));
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") valider();
          }}
          inputMode="decimal"
          placeholder="0"
          className="mt-1 w-full rounded-2xl border-4 border-slate-900 py-4 text-center text-5xl font-black tabular-nums"
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <input
          value={laize}
          onChange={(e) => setLaize(e.target.value.replace(/[^\d.,]/g, ""))}
          inputMode="decimal"
          placeholder={r.lot.laize != null ? `Laize ${r.lot.laize} cm` : "Laize (cm)"}
          className="rounded-xl border border-slate-300 px-3 py-3 text-center"
        />
        <input
          value={emplacement}
          onChange={(e) => setEmplacement(e.target.value.toUpperCase())}
          list="emplacements-mesure"
          placeholder="Emplacement"
          className="rounded-xl border border-slate-300 px-3 py-3 text-center font-mono"
        />
        <datalist id="emplacements-mesure">
          {emplacements.map((e) => (
            <option key={e} value={e} />
          ))}
        </datalist>
      </div>
      <input
        value={observations}
        onChange={(e) => setObservations(e.target.value)}
        placeholder="Défaut constaté (facultatif)"
        className="w-full rounded-xl border border-slate-300 px-3 py-3"
      />
      {erreur && <div className="rounded-xl bg-red-100 px-3 py-2 text-sm font-semibold text-red-900">{erreur}</div>}
      <button
        disabled={pending || lire(metrage) <= 0}
        onClick={valider}
        className="w-full rounded-2xl bg-emerald-600 py-4 text-xl font-extrabold text-white disabled:bg-slate-300"
      >
        {pending ? "Enregistrement…" : `✔ Valider ${lire(metrage) > 0 ? `${nb.format(lire(metrage))} ${u}` : ""} · en stock`}
      </button>
      {onAbandon && (
        <button onClick={onAbandon} className="w-full text-sm font-semibold text-slate-500 underline">
          Pas ce rouleau — scanner un autre
        </button>
      )}
    </div>
  );
}
