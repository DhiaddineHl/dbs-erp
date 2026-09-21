"use client";

import { useState } from "react";
import type { Journee, Ouvriere, Arret } from "./store";

/** Motifs proposés (doivent rester alignés avec MOTIFS_ARRET de gpao-app). */
const MOTIFS = [
  "Panne machine",
  "Attente pièces / alimentation",
  "Manque de fil",
  "Manque fourniture",
  "Changement de poste",
  "Réglage machine",
  "Problème qualité / retouche",
  "Coupure électricité",
  "Formation",
  "Absence pièce coupée",
  "Autre",
];

const fmt = (sec: number) => {
  if (sec < 60) return `${sec} s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s ? `${m} min ${s} s` : `${m} min`;
};

/* Arrêts & temps non productifs d'une ouvrière, saisis au fil du relevé de
 * production pour justifier une baisse : on choisit un MOTIF dans la liste et
 * on saisit la DURÉE en secondes. Plusieurs arrêts possibles dans la journée. */
export function ArretsModal({
  journee: j,
  roster,
  ouvId,
  onClose,
  onSave,
}: {
  journee: Journee;
  roster: Ouvriere[];
  ouvId: number;
  onClose: () => void;
  onSave: (liste: Arret[]) => void;
}) {
  const ouv = roster.find((o) => o.id === ouvId);
  const [liste, setListe] = useState<Arret[]>(() => (j.arrets?.[ouvId] ?? []).map((a) => ({ ...a })));
  const [motif, setMotif] = useState(MOTIFS[0]);
  const [secondes, setSecondes] = useState("");

  const ajouter = () => {
    const s = Math.max(0, Math.trunc(Number(secondes) || 0));
    if (s <= 0) return;
    setListe((l) => [...l, { motif, secondes: s }]);
    setSecondes("");
  };

  const total = liste.reduce((s, a) => s + a.secondes, 0);

  return (
    <div className="gp-ovl" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="gp-mdl">
        <h2>⏱ Arrêts — {ouv?.nom ?? "ouvrière"}</h2>
        <div style={{ fontSize: 12, color: "#8fa3c8", marginBottom: 10 }}>
          Temps non productifs de la journée. Choisir un motif et saisir la durée en secondes.
        </div>

        {/* Liste des arrêts déjà saisis */}
        {liste.length > 0 ? (
          <div style={{ marginBottom: 12 }}>
            {liste.map((a, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "4px 0",
                  borderBottom: "1px solid #eee",
                  fontSize: 13,
                }}
              >
                <span style={{ flex: 1 }}>{a.motif}</span>
                <b>{fmt(a.secondes)}</b>
                <button
                  className="btn"
                  style={{ padding: "1px 8px" }}
                  onClick={() => setListe((l) => l.filter((_, k) => k !== i))}
                  title="Retirer"
                >
                  ✕
                </button>
              </div>
            ))}
            <div style={{ textAlign: "right", marginTop: 6, fontWeight: 800 }}>Total : {fmt(total)}</div>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: "#999", marginBottom: 12 }}>Aucun arrêt saisi.</div>
        )}

        {/* Ajout d'un arrêt */}
        <div className="r2" style={{ alignItems: "end" }}>
          <div className="fld" style={{ flex: 2 }}>
            <label>Motif d&apos;arrêt</label>
            <select value={motif} onChange={(e) => setMotif(e.target.value)}>
              {MOTIFS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div className="fld">
            <label>Durée (secondes)</label>
            <input
              type="number"
              min={0}
              value={secondes}
              placeholder="ex: 300"
              onChange={(e) => setSecondes(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && ajouter()}
            />
          </div>
          <div className="fld">
            <button className="btn" onClick={ajouter} disabled={!(Number(secondes) > 0)}>
              ＋ Ajouter
            </button>
          </div>
        </div>

        <div className="macts">
          <button className="btn" onClick={onClose}>
            Annuler
          </button>
          <button className="btn primary" onClick={() => onSave(liste)}>
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}
