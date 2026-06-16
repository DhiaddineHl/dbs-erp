"use client";

import {
  CLIENT_NAMES,
  FACONNIERS,
  type Couts,
  type CostLine,
  type Facture,
  caNet,
  factureMarge,
  fdate,
  getLine,
  nb,
} from "@/lib/facturation/store";

export function DetailModal({
  facture: f,
  couts,
  setLine,
  onClose,
  toast,
}: {
  facture: Facture;
  couts: Couts;
  setLine: (f: Facture, i: number, field: keyof CostLine, val: string) => void;
  onClose: () => void;
  toast: (m: string) => void;
}) {
  const m = factureMarge(couts, f);
  const ca = caNet(f);

  const onLieu = (i: number, v: string) => {
    setLine(f, i, "lieu", v);
    if (v === "interne") {
      setLine(f, i, "fac", "");
      setLine(f, i, "cout", String(f.lignes[i].pu));
    }
  };
  const applyFirstToAll = () => {
    const c0 = getLine(couts, f, 0);
    if (!c0.lieu && c0.cout === "") return toast("Renseignez d'abord la 1ère ligne");
    f.lignes.forEach((l, i) => {
      if (i === 0) return;
      setLine(f, i, "lieu", c0.lieu);
      setLine(f, i, "fac", c0.fac);
      setLine(f, i, "cout", c0.lieu === "interne" ? String(l.pu) : c0.cout);
    });
    toast("Appliqué à toutes les lignes");
  };

  return (
    <div className="fac-ovl" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="fac-modal">
        <div className="detail-head">
          <div>
            <div className="dh-title">
              {f.type === "avoir" ? "AVOIR " : "FACTURE "}N°{f.id}
            </div>
            <div className="dh-sub">
              {(CLIENT_NAMES[f.client] || f.client) + " — " + fdate(f.date) + " — " + f.lignes.length + " article(s)"}
            </div>
          </div>
          <button className="detail-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="detail-body">
          <div className="detail-kpis">
            <div className="dk">
              <div className="dk-label">CA facturé</div>
              <div className="dk-val">{nb(ca)} €</div>
            </div>
            <div className="dk">
              <div className="dk-label">Fournitures</div>
              <div className="dk-val" style={{ color: "var(--gold)" }}>
                {nb(f.fournitures || 0)} €
              </div>
            </div>
            <div className="dk">
              <div className="dk-label">Coût production saisi</div>
              <div className="dk-val">{m.cout !== null ? nb(m.cout) + " €" : "—"}</div>
            </div>
            <div className="dk">
              <div className="dk-label">Marge facture</div>
              <div className="dk-val" style={{ color: m.marge !== null && m.marge < 0 ? "var(--red)" : "var(--green)" }}>
                {m.marge !== null ? `${nb(m.marge)} € (${m.pct!.toFixed(1)}%)` : "—"}
              </div>
            </div>
          </div>

          <table className="detail-table">
            <thead>
              <tr>
                <th style={{ width: 150 }}>Modèle</th>
                <th style={{ width: 75 }}>Désig.</th>
                <th style={{ width: 100 }}>Référence</th>
                <th style={{ width: 55 }}>Qté</th>
                <th style={{ width: 65 }}>P.U. €</th>
                <th style={{ width: 85 }}>Montant</th>
                <th className="intern" style={{ width: 120 }}>
                  Fabriqué chez
                </th>
                <th className="intern" style={{ width: 130 }}>
                  Façonnier
                </th>
                <th className="intern" style={{ width: 95 }}>
                  Coût/pc €
                </th>
                <th style={{ width: 95 }}>Coût total</th>
                <th style={{ width: 95 }}>Marge ligne</th>
              </tr>
            </thead>
            <tbody>
              {f.lignes.map((l, i) => {
                const c = getLine(couts, f, i);
                const cp = c.lieu === "interne" ? l.pu : c.cout !== "" ? parseFloat(c.cout) : NaN;
                const coutT = !isNaN(cp) ? l.qte * cp : null;
                const margeL = coutT !== null ? l.mt - coutT : null;
                return (
                  <tr key={i}>
                    <td>
                      <strong>{l.modele}</strong>
                      <br />
                      <span style={{ fontSize: 10, color: "var(--slate)" }}>{l.couleur || ""}</span>
                    </td>
                    <td>{l.desig || ""}</td>
                    <td className="mono">{l.ref || ""}</td>
                    <td className="lm">{l.qte}</td>
                    <td className="lm">{nb(l.pu)}</td>
                    <td className="lm">
                      <strong>{nb(l.mt)}</strong>
                    </td>
                    <td className="intern">
                      <select value={c.lieu} onChange={(e) => onLieu(i, e.target.value)}>
                        <option value="">— choisir —</option>
                        <option value="interne">🏭 Interne DBS</option>
                        <option value="faconnier">🤝 Façonnier</option>
                      </select>
                    </td>
                    <td className="intern">
                      <select
                        value={c.fac}
                        disabled={c.lieu !== "faconnier"}
                        onChange={(e) => setLine(f, i, "fac", e.target.value)}
                      >
                        <option value="">—</option>
                        {FACONNIERS.map((x) => (
                          <option key={x} value={x}>
                            {x}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="intern">
                      <input
                        type="number"
                        className="cout-input"
                        step="0.01"
                        value={c.lieu === "interne" ? l.pu : c.cout}
                        placeholder="0.00"
                        disabled={c.lieu === "interne"}
                        style={c.lieu === "interne" ? { background: "#F0EEE8", color: "var(--slate)" } : undefined}
                        title={c.lieu === "interne" ? "Interne : coût = prix facturé (marge nulle)" : undefined}
                        onChange={(e) => setLine(f, i, "cout", e.target.value)}
                      />
                    </td>
                    <td className="lm">{coutT !== null ? nb(coutT) + " €" : "—"}</td>
                    <td className="lm">
                      {margeL !== null ? (
                        <span className={margeL >= 0 ? "pos" : "neg"}>{nb(margeL)} €</span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ marginTop: 10 }}>
            <button className="apply-all" onClick={applyFirstToAll}>
              ⤵ Appliquer la 1ère ligne à toutes les autres
            </button>
          </div>
        </div>

        <div className="detail-foot">
          <div style={{ fontSize: 12, color: "var(--slate)" }}>
            {m.nRens} / {m.nL} articles renseignés
            {f.fournitures ? " — fournitures déduites automatiquement" : ""}
          </div>
          <div className="df-marge">
            {m.marge !== null ? (
              <>
                Marge : <span className={m.marge >= 0 ? "pos" : "neg"}>{nb(m.marge)} €</span>
              </>
            ) : (
              "Renseignez les coûts pour voir la marge"
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
