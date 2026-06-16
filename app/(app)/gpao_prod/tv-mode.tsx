"use client";

import { useEffect, useRef, useState } from "react";
import {
  type GpaoState,
  type Journee,
  SEUIL_B,
  SEUIL_H,
  chObjH,
  chObjJour,
  chRend,
  chSortieTotal,
  findC,
  findM,
  fmtDate,
  ouvObjAjuste,
  ouvProd,
  ouvRend,
} from "./store";

const tvCol = (r: number) => (r >= SEUIL_H ? "#2fd79a" : r >= SEUIL_B ? "#f5bd55" : "#ff6b6b");

export function TvMode({ state, journee, onExit }: { state: GpaoState; journee: Journee; onExit: () => void }) {
  const [now, setNow] = useState(() => new Date());
  const listRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const scrollPos = useRef(0);

  const c = findC(state, journee.chaineId);
  const m = findM(state, journee.modeleId);
  const objH = chObjH(state, journee);
  const objJ = chObjJour(state, journee);
  const sortie = chSortieTotal(journee);
  const r = chRend(state, journee);
  const ecart = sortie - objJ;
  const col = tvCol(r);

  // live clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // fullscreen + Escape to exit
  useEffect(() => {
    document.documentElement.requestFullscreen?.().catch(() => {});
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onExit();
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    };
  }, [onExit]);

  // auto-scroll the operators list
  useEffect(() => {
    const t = setInterval(() => {
      const list = listRef.current;
      const inner = innerRef.current;
      if (!list || !inner) return;
      const visible = list.clientHeight;
      const total = inner.scrollHeight;
      if (total <= visible) {
        inner.style.top = "0px";
        return;
      }
      const nOps = c?.ouvrieres.length || 1;
      const rowH = total / Math.max(nOps, 1);
      const step = Math.floor(visible / rowH) * rowH * 0.8;
      scrollPos.current += step;
      if (scrollPos.current > total - visible + rowH) scrollPos.current = 0;
      inner.style.top = `${-scrollPos.current}px`;
    }, 4000);
    return () => clearInterval(t);
  }, [c]);

  const ops = (c?.ouvrieres ?? []).slice().sort((a, b) => (ouvRend(journee, b) || 0) - (ouvRend(journee, a) || 0));

  const circ = 2 * Math.PI * 86;
  const maxH = Math.max(objH, 1, ...journee.cols.map((cn) => journee.sortie[cn] ?? 0));

  const top3 = ops.slice(0, 3).map((o) => `${o.nom} ${ouvRend(journee, o) || 0}%`).join(" · ");
  const alerts = ops.filter((o) => {
    const x = ouvRend(journee, o);
    return x !== null && x < SEUIL_B;
  });

  return (
    <div className="gp-tv">
      <div className="tv-top">
        <div>
          <div className="tv-title">
            {(c ? c.nom.toUpperCase() : "CHAÎNE")} — {m ? m.nom.toUpperCase() : ""}
          </div>
          <div className="tv-sub">
            Réf {m ? m.ref : ""}
            {m && m.client ? ` · ${m.client}` : ""} · {fmtDate(journee.date)} · Objectif général {objH.toFixed(1)} p/h
          </div>
        </div>
        <div className="tv-clock">
          <div className="tv-time">{now.toLocaleTimeString("fr-FR")}</div>
          <div className="tv-date">
            {now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </div>
        </div>
        <button className="tv-exit" onClick={onExit}>
          ✕ Quitter
        </button>
      </div>

      <div className="tv-body">
        <div className="tv-left">
          <div className="tv-card">
            <div className="tv-lbl">Rendement chaîne (sortie réelle)</div>
            <div className="tv-gauge-wrap">
              <div className="tv-gauge">
                <svg viewBox="0 0 200 200">
                  <circle cx="100" cy="100" r="86" fill="none" stroke="#131f40" strokeWidth="17" />
                  <circle
                    cx="100"
                    cy="100"
                    r="86"
                    fill="none"
                    stroke={col}
                    strokeWidth="17"
                    strokeLinecap="round"
                    strokeDasharray={circ}
                    strokeDashoffset={circ * (1 - Math.min(r, 100) / 100)}
                  />
                </svg>
                <div className="pct">
                  <div className="pctv" style={{ color: col }}>
                    {r}%
                  </div>
                  <div className="pctl">rendement</div>
                </div>
              </div>
            </div>
            <div className="tv-cumul">
              <div className="tv-big">
                <div className="bv tvb">{sortie}</div>
                <div className="bl">Sortie</div>
              </div>
              <div className="tv-big">
                <div className="bv" style={{ color: "#aebcdd" }}>
                  {objJ}
                </div>
                <div className="bl">Objectif</div>
              </div>
              <div className="tv-big">
                <div className="bv" style={{ color: ecart >= 0 ? "#2fd79a" : "#ff6b6b" }}>
                  {ecart >= 0 ? "+" : ""}
                  {ecart}
                </div>
                <div className="bl">Écart</div>
              </div>
            </div>
          </div>

          <div className="tv-card tv-hours">
            <div className="tv-lbl">
              Sortie chaîne par heure <span style={{ color: "#4d8ce8" }}>· objectif {Math.round(objH)} p/h</span>
            </div>
            <div className="tv-bars">
              {journee.cols.map((cn) => {
                const hv = journee.sortie[cn];
                const num = typeof hv === "number" ? hv : 0;
                let bcol = "#1d2c55";
                if (hv !== undefined) {
                  const p = objH > 0 ? (num / objH) * 100 : 0;
                  bcol = p >= SEUIL_H ? "#2fd79a" : p >= SEUIL_B ? "#f5bd55" : "#ff6b6b";
                }
                const hp = Math.round((num / maxH) * 100);
                return (
                  <div className="tv-bar-col" key={cn}>
                    <div className="tv-bar-val" style={{ color: hv === undefined ? "#3a4a75" : bcol }}>
                      {hv === undefined ? "·" : num}
                    </div>
                    <div className="tv-bar" style={{ height: `${Math.max(hp, 3)}%`, background: bcol }} />
                    <div className="tv-bar-h">{cn}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="tv-right">
          <div className="tv-card tv-ops">
            <div className="tv-lbl" style={{ marginBottom: 8 }}>
              Performance ouvrières <span style={{ color: "#4d8ce8" }}>({ops.length})</span>
            </div>
            <div className="tv-ops-head">
              <div />
              <div>Ouvrière</div>
              <div>Poste</div>
              <div style={{ textAlign: "right" }}>Prod.</div>
              <div style={{ textAlign: "right" }}>Obj.</div>
              <div>Rendement</div>
            </div>
            <div className="tv-ops-list" ref={listRef}>
              <div className="tv-ops-inner" ref={innerRef} style={{ top: 0 }}>
                {ops.map((o, k) => {
                  const ro = ouvRend(journee, o);
                  const rc = ro === null ? "#7e93c4" : ro >= SEUIL_H ? "#2fd79a" : ro >= SEUIL_B ? "#f5bd55" : "#ff6b6b";
                  const rank = k === 0 ? "🥇" : k === 1 ? "🥈" : k === 2 ? "🥉" : k + 1;
                  const isAlert = ro !== null && ro < SEUIL_B;
                  const d = journee.ops[o.id] || {};
                  const hasRI = journee.cols.some((cn) => d[cn] === "RI" || d[cn] === "ABS");
                  return (
                    <div className={`tv-op${isAlert ? " alert" : ""}`} key={o.id}>
                      <div className="rank">{rank}</div>
                      <div className="n">
                        {o.nom}
                        {hasRI && <span style={{ color: "#ff6b6b", fontSize: 10 }}> ●RI</span>}
                      </div>
                      <div className="p">{o.poste}</div>
                      <div className="num" style={{ color: "#6da3f5" }}>
                        {ouvProd(journee, o.id)}
                      </div>
                      <div className="num" style={{ color: "#7e93c4" }}>
                        {Math.round(ouvObjAjuste(journee, o))}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                        <span className="rp" style={{ color: rc, minWidth: 40 }}>
                          {ro === null ? "—" : `${ro}%`}
                        </span>
                        <div className="rb" style={{ flex: 1 }}>
                          <div className="rf" style={{ width: `${ro === null ? 0 : Math.min(ro, 100)}%`, background: rc }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="tv-ticker">
        <div className="tv-ticker-inner">
          <span className="tvb">
            📊 {c ? c.nom.toUpperCase() : ""} : {sortie} pièces sorties / {objJ} objectif
          </span>
          <span style={{ color: col }}>⚡ RENDEMENT CHAÎNE {r}%</span>
          <span className={ecart >= 0 ? "tvg" : "tvr"}>
            {ecart >= 0 ? "▲ +" : "▼ "}
            {ecart} pièces vs objectif
          </span>
          <span className="tvg">🏆 TOP : {top3}</span>
          {alerts.length > 0 && (
            <span className="tvr">⚠ {alerts.map((o) => `${o.nom} ${ouvRend(journee, o) || 0}%`).join(" · ")}</span>
          )}
          <span className="tva">
            👔 {m ? `${m.nom} — Réf ${m.ref}` : ""} · SAM {m ? m.sam : 0}s
          </span>
        </div>
      </div>
    </div>
  );
}
