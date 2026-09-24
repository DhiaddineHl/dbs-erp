"use client";

import { useMemo } from "react";
import { type GpaoState, type Journee, dayOuvrieres, ouvProd, ouvWorked } from "./store";
import { equilibrage, type OuvrierePoste } from "@/lib/domain/equilibrage";

const r1 = (n: number) => Math.round(n * 10) / 10;

/* Panneau Équilibrage (points 1+2+3) sur une journée : goulot, indice
 * d'équilibrage, débits par poste (barres), et suggestions de rééquilibrage.
 * Tout est dérivé de la saisie du jour (poste + SAM + pièces par ouvrière). */
export function EquilibragePanel({ state, journee: j }: { state: GpaoState; journee: Journee }) {
  const eq = useMemo(() => {
    const roster = dayOuvrieres(state, j);
    const lignes: OuvrierePoste[] = roster.map((o) => {
      const heures = ouvWorked(j, o.id);
      const prod = ouvProd(j, o.id);
      // Poste dominant de la journée : celui saisi le plus souvent à l'heure,
      // sinon le poste de la fiche ouvrière.
      const poste = posteDominant(j, o.id) || o.poste;
      return { id: o.id, nom: o.nom, poste, debit: heures > 0 ? r1(prod / heures) : 0, heures };
    });
    return equilibrage(lignes);
  }, [state, j]);

  if (!eq.goulot) {
    return (
      <div className="gp-card" style={{ padding: 12, marginTop: 12 }}>
        <b>⚖️ Équilibrage</b>
        <div style={{ fontSize: 12, color: "#8fa3c8", marginTop: 4 }}>
          Pas encore assez de production saisie pour analyser l&apos;équilibrage de la chaîne.
        </div>
      </div>
    );
  }

  const debitMax = Math.max(...eq.postes.map((p) => p.debit));
  const tauxTone = eq.tauxEquilibrage == null ? "#8fa3c8" : eq.tauxEquilibrage >= 85 ? "#067647" : eq.tauxEquilibrage >= 70 ? "#b45309" : "#b42318";

  return (
    <div className="gp-card" style={{ padding: 12, marginTop: 12 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16, marginBottom: 10 }}>
        <b style={{ fontSize: 15 }}>⚖️ Équilibrage de chaîne</b>
        <span style={{ fontSize: 13 }}>
          Goulot : <b style={{ color: "#b42318" }}>{eq.goulot.poste}</b> ({eq.debitChaine}/h)
        </span>
        <span style={{ fontSize: 13 }}>
          Débit de chaîne : <b>{eq.debitChaine} pièces/h</b>
        </span>
        <span style={{ fontSize: 13 }}>
          Indice d&apos;équilibrage : <b style={{ color: tauxTone }}>{eq.tauxEquilibrage ?? "—"}%</b>
        </span>
      </div>

      {/* Barres de débit par poste : le goulot en rouge. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {eq.postes.map((p) => {
          const w = debitMax > 0 ? Math.max(4, (p.debit / debitMax) * 100) : 0;
          const couleur = p.goulot ? "#e11d48" : p.ecartGoulotPct != null && p.ecartGoulotPct >= 30 ? "#0ea5e9" : "#64748b";
          return (
            <div key={p.poste} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
              <div style={{ width: 160, textAlign: "right", fontWeight: p.goulot ? 800 : 500 }}>
                {p.goulot ? "🔴 " : ""}
                {p.poste}
                {p.effectif > 1 ? ` ×${p.effectif}` : ""}
              </div>
              <div style={{ flex: 1, background: "#eef2f7", borderRadius: 6, height: 18, position: "relative" }}>
                <div style={{ position: "absolute", inset: 0, width: `${w}%`, background: couleur, borderRadius: 6 }} />
              </div>
              <div style={{ width: 120, fontWeight: 700, whiteSpace: "nowrap" }}>
                {p.debit}/h
                {p.ecartGoulotPct != null && p.ecartGoulotPct !== 0 && (
                  <span style={{ color: p.ecartGoulotPct > 0 ? "#067647" : "#b42318", fontWeight: 500 }}>
                    {" "}
                    ({p.ecartGoulotPct > 0 ? "+" : ""}
                    {p.ecartGoulotPct}%)
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Suggestions de rééquilibrage. */}
      {eq.suggestions.length > 0 && (
        <div style={{ marginTop: 10, borderTop: "1px solid #e5e7eb", paddingTop: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "#8fa3c8", marginBottom: 4 }}>
            💡 Pistes de rééquilibrage
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.5 }}>
            {eq.suggestions.map((s, i) => (
              <li key={i}>{s.message}</li>
            ))}
          </ul>
          <div style={{ fontSize: 11, color: "#8fa3c8", marginTop: 4 }}>
            Aide à la décision — le chef de chaîne garde la main (polyvalence, machines…).
          </div>
        </div>
      )}
    </div>
  );
}

/** Poste tenu le plus souvent dans la journée (parmi les heures saisies). */
function posteDominant(j: Journee, ouvId: number): string {
  const compte = new Map<string, number>();
  for (const col of j.cols) {
    const p = j.opsPoste?.[ouvId]?.[col];
    if (p) compte.set(p, (compte.get(p) ?? 0) + 1);
    const dt = j.opsDetail?.[ouvId]?.[col];
    if (dt) for (const d of dt) if (d.poste) compte.set(d.poste, (compte.get(d.poste) ?? 0) + 1);
  }
  let best = "";
  let max = 0;
  for (const [p, n] of compte) {
    if (n > max) {
      max = n;
      best = p;
    }
  }
  return best;
}
