"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { MOIS_LONGS, aujourdhuiISO, clePeriodeLibre, lirePeriode, type Periode } from "@/lib/domain/periode";

/* SÉLECTEUR DE PÉRIODE — le même dans tous les modules.
 *
 * Un seul bouton : exercice en cours, exercice précédent, une année, un
 * trimestre, un mois, toutes les années, ou du… au…. La période choisie est
 * écrite en clair à côté, pour que personne ne compare un chiffre de 2026 à
 * un chiffre de 2027 sans le voir.
 *
 * Le dernier choix est retenu PAR ÉCRAN et par navigateur (simple confort :
 * s'il est perdu, on retombe sur l'exercice en cours). */

const PREFIXE = "pilotpro.periode.";
const EVT = "pilotpro-periode";

function lireStockage(cle: string): string {
  try {
    return window.localStorage.getItem(PREFIXE + cle) ?? "";
  } catch {
    return "";
  }
}

/** La période retenue pour un écran (`cle` = « factures », « grand-livre »…). */
export function usePeriode(cle: string, defaut = "exercice"): [Periode, (v: string) => void] {
  const brute = useSyncExternalStore(
    (rappel) => {
      const ecoute = (e: Event) => {
        if (!(e instanceof CustomEvent) || e.detail === cle) rappel();
      };
      window.addEventListener(EVT, ecoute);
      window.addEventListener("storage", rappel);
      return () => {
        window.removeEventListener(EVT, ecoute);
        window.removeEventListener("storage", rappel);
      };
    },
    () => lireStockage(cle) || defaut,
    () => defaut,
  );
  const periode = useMemo(() => lirePeriode(brute), [brute]);
  const changer = (v: string) => {
    try {
      window.localStorage.setItem(PREFIXE + cle, v);
    } catch {
      /* stockage indisponible : le choix vaut pour cette page seulement */
    }
    window.dispatchEvent(new CustomEvent(EVT, { detail: cle }));
  };
  return [periode, changer];
}

/** Liste déroulante + période en clair. `annees` : celles qui ont des données. */
export function SelecteurPeriode({
  periode,
  onChange,
  annees,
  className = "",
}: {
  periode: Periode;
  onChange: (cle: string) => void;
  annees: number[];
  className?: string;
}) {
  const auj = aujourdhuiISO();
  const an = Number(auj.slice(0, 4));
  const [libre, setLibre] = useState(periode.cle.startsWith("l:"));
  const [du, setDu] = useState(periode.du);
  const [au, setAu] = useState(periode.au);

  // L'année dont on propose les mois et trimestres : celle de la période choisie.
  const anneeVue = Number((periode.du || periode.au || auj).slice(0, 4)) || an;
  const autres = annees.filter((a) => a !== an && a !== an - 1);
  // Trimestres et mois proposés : exercice en cours, précédent, et l'année affichée.
  const anneesDetail = [...new Set([an, an - 1, anneeVue])].sort((a, b) => b - a);
  const valeur = libre ? "__libre" : periode.cle;

  return (
    <div className={`flex flex-wrap items-center gap-2 print:hidden ${className}`}>
      <select
        value={valeur}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "__libre") {
            setLibre(true);
            setDu(periode.du || `${an}-01-01`);
            setAu(periode.au || auj);
            return;
          }
          setLibre(false);
          onChange(v);
        }}
        className="h-9 rounded-md border bg-background px-2 text-sm font-semibold"
        aria-label="Période"
      >
        <option value="exercice">Exercice en cours ({an})</option>
        <option value="precedent">Exercice précédent ({an - 1})</option>
        {autres.length > 0 && (
          <optgroup label="Autres exercices">
            {autres.map((a) => (
              <option key={a} value={`a:${a}`}>
                Exercice {a}
              </option>
            ))}
          </optgroup>
        )}
        {anneesDetail.map((y) => (
          <optgroup key={`t${y}`} label={`Trimestres ${y}`}>
            {[1, 2, 3, 4].map((t) => (
              <option key={t} value={`t:${y}-${t}`}>
                {t}
                {t === 1 ? "er" : "e"} trimestre {y}
              </option>
            ))}
          </optgroup>
        ))}
        {anneesDetail.map((y) => (
          <optgroup key={`m${y}`} label={`Mois ${y}`}>
            {MOIS_LONGS.map((m, i) => (
              <option key={m} value={`m:${y}-${String(i + 1).padStart(2, "0")}`}>
                {m} {y}
              </option>
            ))}
          </optgroup>
        ))}
        <option value="tout">Toutes les années</option>
        <option value="__libre">Période libre (du… au…)</option>
        {/* La période retenue doit toujours figurer dans la liste. */}
        {!libre && !optionConnue(periode.cle, anneesDetail, autres) && <option value={periode.cle}>{periode.label}</option>}
      </select>
      {libre && (
        <span className="flex flex-wrap items-center gap-1 text-sm">
          du
          <input type="date" value={du} onChange={(e) => setDu(e.target.value)} className="h-9 rounded-md border bg-background px-2" />
          au
          <input type="date" value={au} onChange={(e) => setAu(e.target.value)} className="h-9 rounded-md border bg-background px-2" />
          <button
            type="button"
            onClick={() => onChange(clePeriodeLibre(du, au))}
            className="h-9 rounded-md bg-foreground px-3 text-xs font-bold text-background"
          >
            Appliquer
          </button>
        </span>
      )}
      <span className="rounded-full bg-muted px-3 py-1 text-xs font-bold text-foreground" title="Période appliquée aux calculs de cet écran">
        📅 {periode.label}
      </span>
    </div>
  );
}

function optionConnue(cle: string, anneesDetail: number[], autres: number[]): boolean {
  if (cle === "exercice" || cle === "precedent" || cle === "tout") return true;
  if (autres.some((a) => cle === `a:${a}`)) return true;
  return anneesDetail.some((y) => cle.startsWith(`t:${y}-`) || cle.startsWith(`m:${y}-`));
}
