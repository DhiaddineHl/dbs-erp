"use client";

import { useState } from "react";
import { type Chaine, type Journee, type OpDetail } from "./store";

type Row = { hour: string; poste: string; sam: string; qte: string };

export type PosteHeureResult = {
  ops: Record<string, number | null>;
  sm: Record<string, number>;
  pm: Record<string, string>;
  dt: Record<string, OpDetail[]>;
};

/** Editor: one row = one operation done during one hour. Two rows on the same
 * hour = the worker did two operations that hour (e.g. helped a colleague). */
export function PostesHeureModal({
  journee: j,
  chaine: c,
  ouvId,
  onClose,
  onSave,
  onReset,
}: {
  journee: Journee;
  chaine: Chaine | null;
  ouvId: number;
  onClose: () => void;
  onSave: (ouvId: number, result: PosteHeureResult) => void;
  onReset: (ouvId: number) => void;
}) {
  const o = c?.ouvrieres.find((x) => x.id === ouvId);

  const initialRows = (): Row[] => {
    if (!o) return [];
    const rows: Row[] = [];
    for (const col of j.cols) {
      const det = j.opsDetail?.[ouvId]?.[col];
      if (det && det.length) {
        for (const d of det) rows.push({ hour: col, poste: d.poste, sam: String(d.sam), qte: String(d.qte) });
      } else {
        const v = (j.ops[ouvId] || {})[col];
        if (typeof v === "number") {
          const ps = j.opsPoste?.[ouvId]?.[col] || o.poste;
          const sm = j.opsSam?.[ouvId]?.[col] || o.sam;
          rows.push({ hour: col, poste: ps, sam: String(sm), qte: String(v) });
        }
      }
    }
    if (!rows.length) rows.push({ hour: j.cols[0], poste: o.poste, sam: String(o.sam), qte: "" });
    return rows;
  };

  const [rows, setRows] = useState<Row[]>(initialRows);

  if (!o) return null;

  const setRow = (i: number, field: keyof Row, val: string) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [field]: val } : r)));
  const addRow = () => setRows((prev) => [...prev, { hour: j.cols[0], poste: o.poste, sam: String(o.sam), qte: "" }]);
  const removeRow = (i: number) => setRows((prev) => prev.filter((_, idx) => idx !== i));
  const onPostePick = (i: number, val: string) => {
    setRow(i, "poste", val);
    const match = c?.ouvrieres.find((x) => x.poste === val);
    if (match && !rows[i].sam) setRow(i, "sam", String(match.sam));
  };

  const handleSave = () => {
    // hours that currently hold data (to clear those that get emptied)
    const before = new Set<string>();
    for (const col of j.cols) {
      const v = (j.ops[ouvId] || {})[col];
      if (typeof v === "number") before.add(col);
      if (j.opsDetail?.[ouvId]?.[col]) before.add(col);
    }
    const groups: Record<string, OpDetail[]> = {};
    for (const row of rows) {
      const qte = parseFloat(String(row.qte).replace(",", "."));
      if (isNaN(qte)) continue;
      let sam = parseFloat(String(row.sam).replace(",", "."));
      if (isNaN(sam) || sam <= 0) sam = o.sam;
      (groups[row.hour] = groups[row.hour] || []).push({ poste: row.poste.trim() || o.poste, sam, qte });
    }
    const result: PosteHeureResult = { ops: {}, sm: {}, pm: {}, dt: {} };
    for (const hour of Object.keys(groups)) {
      const arr = groups[hour];
      if (arr.length >= 2) {
        result.dt[hour] = arr;
        result.ops[hour] = arr.reduce((t, x) => t + x.qte, 0);
      } else {
        const r = arr[0];
        result.ops[hour] = r.qte;
        if (r.sam !== o.sam) result.sm[hour] = r.sam;
        if (r.poste && r.poste !== o.poste) result.pm[hour] = r.poste;
      }
    }
    for (const hour of before) if (!groups[hour]) result.ops[hour] = null;
    onSave(ouvId, result);
  };

  const inp = {
    padding: 5,
    border: "1px solid #ccd",
    borderRadius: 6,
  } as const;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,.55)",
        zIndex: 99999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <datalist id="ph-postes">
        {c?.ouvrieres.map((x) => (
          <option key={x.id} value={x.poste} />
        ))}
      </datalist>
      <div
        style={{
          background: "#fff",
          borderRadius: 14,
          maxWidth: 640,
          width: "100%",
          maxHeight: "88vh",
          overflow: "auto",
          padding: 22,
          fontFamily: "system-ui",
          color: "#1c2840",
        }}
      >
        <h3 style={{ margin: "0 0 4px" }}>⚙ Opérations par heure — {o.nom}</h3>
        <div style={{ fontSize: 12, color: "#667", marginBottom: 14, lineHeight: 1.5 }}>
          Une ligne = une opération pendant une heure. Si elle fait <b>2 opérations dans la même heure</b> (ex. elle aide
          une collègue), mettez <b>2 lignes sur la même heure</b> avec les pièces de chacune. Poste habituel :{" "}
          <b>{o.poste}</b> (SAM {o.sam}s). Rendement = temps standard gagné ÷ temps travaillé.
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#889" }}>
              <th style={{ padding: 3 }}>Heure</th>
              <th style={{ padding: 3 }}>Poste / opération</th>
              <th style={{ padding: 3 }}>SAM (s)</th>
              <th style={{ padding: 3 }}>Pièces</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                <td style={{ padding: 3 }}>
                  <select style={inp} value={row.hour} onChange={(e) => setRow(i, "hour", e.target.value)}>
                    {j.cols.map((cl) => (
                      <option key={cl} value={cl}>
                        {cl}
                      </option>
                    ))}
                  </select>
                </td>
                <td style={{ padding: 3 }}>
                  <input
                    list="ph-postes"
                    style={{ ...inp, width: 150 }}
                    value={row.poste}
                    onChange={(e) => onPostePick(i, e.target.value)}
                  />
                </td>
                <td style={{ padding: 3 }}>
                  <input
                    type="number"
                    style={{ ...inp, width: 72 }}
                    value={row.sam}
                    onChange={(e) => setRow(i, "sam", e.target.value)}
                  />
                </td>
                <td style={{ padding: 3 }}>
                  <input
                    type="number"
                    style={{ ...inp, width: 72 }}
                    value={row.qte}
                    onChange={(e) => setRow(i, "qte", e.target.value)}
                  />
                </td>
                <td style={{ padding: 3 }}>
                  <button
                    onClick={() => removeRow(i)}
                    style={{ border: "none", background: "#fee", color: "#c33", borderRadius: 6, padding: "5px 9px", cursor: "pointer" }}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button
          onClick={addRow}
          style={{
            marginTop: 10,
            border: "1px dashed #9ab",
            background: "#f0f5ff",
            color: "#1d4ed8",
            borderRadius: 8,
            padding: "7px 12px",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          ＋ Ajouter une opération
        </button>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
          <button
            onClick={() => onReset(ouvId)}
            style={{ padding: "8px 14px", border: "1px solid #ccd", background: "#f3f4f6", borderRadius: 8, cursor: "pointer" }}
          >
            Tout réinitialiser
          </button>
          <button
            onClick={onClose}
            style={{ padding: "8px 14px", border: "1px solid #ccd", background: "#fff", borderRadius: 8, cursor: "pointer" }}
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            style={{ padding: "8px 16px", border: "none", background: "#1d4ed8", color: "#fff", borderRadius: 8, cursor: "pointer", fontWeight: 700 }}
          >
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}
