"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Ventilation } from "@/lib/services/referentiel";
import * as R from "@/lib/actions/referentiel";

const nb = new Intl.NumberFormat("fr-FR");
const eur = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

/** B12 · rattache à leur société les factures rangées en « AUTRE ».
 *
 * Ces factures comptent dans le CA global mais dans le chiffre d'aucun client,
 * si bien que la somme des clients ne retombe jamais sur le total. La société
 * est déduite des modèles et références de chaque facture, confrontés aux
 * commandes — le modèle vaut preuve forte, la référence preuve faible.
 *
 * La déduction ne fait que proposer : chaque ligne reste sur « ne pas
 * modifier » tant que personne n'a tranché. */
export function BoutonVentiler({ toast }: { toast: (m: string) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [donnees, setDonnees] = useState<Ventilation | null>(null);
  const [choix, setChoix] = useState<Record<number, string>>({});

  const ouvrir = () =>
    start(async () => {
      const r = await R.facturesAVentiler();
      if (!r.ok) {
        toast(r.error);
        return;
      }
      if (!r.data.factures.length) {
        toast("Toutes les factures sont déjà ventilées par société");
        return;
      }
      setDonnees(r.data);
      // Les propositions sûres sont pré-remplies ; les cas indécis restent vides.
      setChoix(Object.fromEntries(r.data.factures.map((f) => [f.id, f.propose])));
    });

  const appliquer = () =>
    start(async () => {
      const r = await R.ventiler(
        Object.entries(choix).map(([id, clientNom]) => ({ factureId: Number(id), clientNom })),
      );
      if (!r.ok) {
        toast(r.error);
        return;
      }
      toast(`${r.data} facture(s) ventilée(s) par société`);
      setDonnees(null);
      router.refresh();
    });

  const retenues = Object.values(choix).filter((v) => v.trim()).length;

  return (
    <>
      <button
        className="btn btn-outline btn-sm"
        disabled={pending}
        title="Réaffecter à leur vraie société les factures rangées en « AUTRE »"
        onClick={ouvrir}
      >
        🏷 Ventiler factures
      </button>

      {donnees && (
        <div className="fac-ovl" onClick={(e) => e.target === e.currentTarget && setDonnees(null)}>
          <div className="fac-modal">
            <div className="detail-head">
              <div>
                <div className="dh-title">🏷 VENTILER LES FACTURES « AUTRE »</div>
                <div className="dh-sub">{donnees.factures.length} document(s) sans société rattachée</div>
              </div>
              <button className="detail-close" onClick={() => setDonnees(null)}>
                ×
              </button>
            </div>

            <div className="detail-body">
              <p style={{ fontSize: 12, color: "var(--ink-2)", marginBottom: 10 }}>
                La société est déduite des modèles et références de chaque facture, confrontés à vos commandes.
                Un modèle identique compte pour trois points, une référence pour deux. Vérifiez et corrigez —
                les factures laissées sur «&nbsp;ne pas modifier&nbsp;» ne seront pas touchées.
              </p>

              {donnees.factures.map((f) => (
                <div
                  key={f.id}
                  style={{
                    border: "1px solid var(--line)",
                    borderRadius: 9,
                    padding: "10px 12px",
                    marginBottom: 8,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <b>
                      {f.type === "avoir" ? "Avoir" : "Facture"} {f.num}
                    </b>
                    <span style={{ color: "var(--ink-3)", fontSize: 12 }}>
                      {f.date} · {nb.format(f.pieces)} pcs · {eur.format(Math.round(f.total))} €
                      {f.clientRaw && ` · saisi « ${f.clientRaw} »`}
                    </span>
                    <span className={`tag ${f.propose ? "tag-green" : "tag-gold"}`}>
                      {f.propose
                        ? `détecté : ${f.propose}`
                        : f.indecis
                          ? "égalité — à choisir"
                          : "aucun indice"}
                    </span>
                  </div>

                  <div style={{ fontSize: 11.5, color: "var(--ink-2)", margin: "6px 0" }}>
                    {f.lignes.slice(0, 5).map((l, i) => (
                      <span key={i}>
                        {i > 0 && " · "}
                        {l.modele || "—"}
                        {l.ref && <small style={{ color: "var(--ink-3)" }}> réf {l.ref}</small>}
                      </span>
                    ))}
                    {f.lignes.length > 5 && ` … +${f.lignes.length - 5}`}
                  </div>

                  {f.suffrages.length > 1 && (
                    <div style={{ fontSize: 11, color: "var(--ink-3)", marginBottom: 4 }}>
                      Autres pistes : {f.suffrages.slice(1, 4).map((s) => `${s.client} (${s.points})`).join(" · ")}
                    </div>
                  )}

                  <label style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-2)" }}>Société à facturer</label>
                  <select
                    value={choix[f.id] ?? ""}
                    onChange={(e) => setChoix((p) => ({ ...p, [f.id]: e.target.value }))}
                    style={{ width: "100%", padding: 7, border: "1px solid var(--line)", borderRadius: 7, marginTop: 3 }}
                  >
                    <option value="">— ne pas modifier —</option>
                    {donnees.clients.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              ))}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
                <button className="btn btn-outline" onClick={() => setDonnees(null)}>
                  Annuler
                </button>
                <button className="btn btn-primary" disabled={pending || !retenues} onClick={appliquer}>
                  Appliquer la ventilation ({retenues})
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
