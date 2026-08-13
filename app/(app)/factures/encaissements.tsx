"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CLIENT_NAMES, fdate, nb } from "@/lib/facturation/store";
import { MODES_PAIEMENT, STATUT_PAIEMENT, balanceAgee } from "@/lib/domain/finance";
import type { EncaissementRow } from "@/lib/services/finance";
import * as A from "@/lib/actions/finance";

type Compte = { id: number; libelle: string };

const auj = () => new Date().toISOString().slice(0, 10);

const CLASSE_STATUT: Record<string, string> = {
  paye: "tag-green",
  partiel: "tag-gold",
  retard: "tag-red",
  attente: "tag-slate",
};

/* Encaissements — vue transversale de ce qui est réglé et de ce qui reste dû,
 * avec la balance âgée que réclame le suivi de trésorerie. */
export function Encaissements({
  lignes,
  comptes,
  toast,
}: {
  lignes: EncaissementRow[];
  comptes: Compte[];
  toast: (m: string) => void;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [statut, setStatut] = useState("");
  const [ouverte, setOuverte] = useState<number | null>(null);
  const [gererComptes, setGererComptes] = useState(false);

  const filtrees = useMemo(() => {
    const n = q.trim().toLowerCase();
    return lignes.filter((l) => {
      if (statut && l.statut !== statut) return false;
      if (!n) return true;
      return `${l.num} ${l.marque} ${CLIENT_NAMES[l.clientKey] ?? l.clientKey}`.toLowerCase().includes(n);
    });
  }, [lignes, q, statut]);

  const totaux = useMemo(() => {
    const t = { ht: 0, encaisse: 0, reste: 0 };
    for (const l of filtrees) {
      t.ht += l.total;
      t.encaisse += l.regle;
      t.reste += Math.max(0, l.reste);
    }
    return t;
  }, [filtrees]);

  const ba = useMemo(
    () =>
      balanceAgee(
        filtrees.map((l) => ({
          facture: { type: l.type, date: l.date, total: l.total, paiement: l.paiement },
          reste: l.reste,
        })),
      ),
    [filtrees],
  );

  return (
    <div className="page">
      <div className="kpi-grid">
        <Kpi label="Total HT facturé" valeur={`${nb(totaux.ht)} €`} />
        <Kpi label="Encaissé" valeur={`${nb(totaux.encaisse)} €`} classe="green" />
        <Kpi label="Reste à encaisser" valeur={`${nb(totaux.reste)} €`} classe="gold" />
        <Kpi
          label="Dont échu"
          valeur={`${nb(ba.total - ba.nonEchu)} €`}
          classe={ba.total - ba.nonEchu > 0 ? "red" : "green"}
          sub={`${nb(ba.plus90)} € à plus de 90 jours`}
        />
      </div>

      <div className="table-wrap" style={{ marginBottom: 18 }}>
        <div className="table-header">
          <div className="table-title">Balance âgée du reste à encaisser</div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Non échu</th>
              <th>0 – 30 j</th>
              <th>31 – 60 j</th>
              <th>61 – 90 j</th>
              <th>+ 90 j</th>
              <th style={{ textAlign: "right" }}>Total dû</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{nb(ba.nonEchu)} €</td>
              <td>{nb(ba.j0_30)} €</td>
              <td>{nb(ba.j31_60)} €</td>
              <td>{nb(ba.j61_90)} €</td>
              <td className={ba.plus90 > 0 ? "neg" : undefined}>{nb(ba.plus90)} €</td>
              <td style={{ textAlign: "right", fontWeight: 700 }}>{nb(ba.total)} €</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="search-bar">
        <input placeholder="Rechercher par N° ou client…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={statut} onChange={(e) => setStatut(e.target.value)}>
          <option value="">Tous les statuts</option>
          {Object.entries(STATUT_PAIEMENT).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
        <button className="btn btn-outline btn-sm" onClick={() => setGererComptes((v) => !v)}>
          🏦 Comptes bancaires
        </button>
      </div>

      {gererComptes && <GestionComptes comptes={comptes} toast={toast} />}

      <div className="table-wrap">
        <div className="table-header">
          <div className="table-title">
            {filtrees.length} facture(s) — reste {nb(totaux.reste)} €
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>N°</th>
              <th>Date</th>
              <th>Échéance</th>
              <th>Client</th>
              <th style={{ textAlign: "right" }}>Montant HT</th>
              <th style={{ textAlign: "right" }}>Encaissé</th>
              <th style={{ textAlign: "right" }}>Reste</th>
              <th style={{ textAlign: "center" }}>Statut</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtrees.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ textAlign: "center", padding: 24 }}>
                  Aucune facture.
                </td>
              </tr>
            ) : (
              filtrees.map((l) => {
                const st = STATUT_PAIEMENT[l.statut];
                return (
                  <tr key={l.factureId}>
                    <td>
                      <b>{l.num}</b>
                    </td>
                    <td>{fdate(l.date)}</td>
                    <td>
                      {l.echeance ? fdate(l.echeance) : "—"}
                      {l.joursRetard !== null && l.joursRetard > 0 && l.reste > 0.005 && (
                        <div style={{ fontSize: 10, color: "var(--red)" }}>+{l.joursRetard} j</div>
                      )}
                    </td>
                    <td>{CLIENT_NAMES[l.clientKey] || l.marque || l.clientKey}</td>
                    <td style={{ textAlign: "right" }}>{nb(l.total)}</td>
                    <td style={{ textAlign: "right" }} className={l.regle > 0 ? "pos" : undefined}>
                      {nb(l.regle)}
                    </td>
                    <td style={{ textAlign: "right", fontWeight: 700 }} className={l.reste > 0.005 ? "neg" : undefined}>
                      {nb(Math.max(0, l.reste))}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <span className={`tag ${CLASSE_STATUT[l.statut]}`}>{st.label}</span>
                    </td>
                    <td>
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={() => setOuverte(ouverte === l.factureId ? null : l.factureId)}
                      >
                        {l.reglements.length ? `${l.reglements.length} règlement(s)` : "Encaisser"}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {ouverte !== null && (
        <ModalReglements
          ligne={filtrees.find((l) => l.factureId === ouverte)!}
          comptes={comptes}
          onFermer={() => setOuverte(null)}
          onFait={(m) => {
            toast(m);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function Kpi({ label, valeur, classe, sub }: { label: string; valeur: string; classe?: string; sub?: string }) {
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className={`kpi-value${classe ? ` ${classe}` : ""}`}>{valeur}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

/* ─────────── règlements d'une facture ─────────── */

function ModalReglements({
  ligne,
  comptes,
  onFermer,
  onFait,
}: {
  ligne: EncaissementRow;
  comptes: Compte[];
  onFermer: () => void;
  onFait: (m: string) => void;
}) {
  const [date, setDate] = useState(auj());
  const [montant, setMontant] = useState(Math.max(0, ligne.reste).toFixed(2));
  const [mode, setMode] = useState<string>(MODES_PAIEMENT[0]);
  const [compteId, setCompteId] = useState<string>(comptes[0] ? String(comptes[0].id) : "");
  const [ref, setRef] = useState("");
  const [pending, start] = useTransition();

  const enregistrer = () =>
    start(async () => {
      const r = await A.ajouterReglement({
        factureId: ligne.factureId,
        date,
        montant,
        mode,
        compteId: compteId ? Number(compteId) : null,
        ref,
      });
      if (!r.ok) {
        onFait(r.error);
        return;
      }
      setRef("");
      onFait("Règlement enregistré");
    });

  return (
    <>
      <div className="fac-ovl" onClick={onFermer} />
      <div className="fac-modal" role="dialog" aria-label="Règlements de la facture">
        <h3 style={{ margin: "0 0 4px" }}>Règlements — facture {ligne.num}</h3>
        <div className="muted-note" style={{ marginBottom: 14 }}>
          Montant {nb(ligne.total)} € · encaissé {nb(ligne.regle)} € · reste{" "}
          <b>{nb(Math.max(0, ligne.reste))} €</b>
          {ligne.echeance && ` · échéance ${fdate(ligne.echeance)}`}
        </div>

        {ligne.reglements.length > 0 && (
          <table style={{ marginBottom: 14 }}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Mode</th>
                <th>Compte</th>
                <th>Référence</th>
                <th style={{ textAlign: "right" }}>Montant</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {ligne.reglements.map((r) => (
                <tr key={r.id}>
                  <td>{fdate(r.date)}</td>
                  <td>{r.mode}</td>
                  <td>{r.compte || "—"}</td>
                  <td>{r.ref || "—"}</td>
                  <td style={{ textAlign: "right", fontWeight: 700 }}>{nb(r.montant)} €</td>
                  <td>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={async () => {
                        if (!confirm("Supprimer ce règlement ?")) return;
                        const res = await A.supprimerReglement(r.id);
                        onFait(res.ok ? "Règlement supprimé" : res.error);
                      }}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {ligne.reste > 0.005 ? (
          <div className="form-grid">
            <div className="form-group">
              <label>Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Montant (€)</label>
              <input type="number" step="0.01" value={montant} onChange={(e) => setMontant(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Mode</label>
              <select value={mode} onChange={(e) => setMode(e.target.value)}>
                {MODES_PAIEMENT.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Compte encaisseur</label>
              <select value={compteId} onChange={(e) => setCompteId(e.target.value)}>
                <option value="">—</option>
                {comptes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.libelle}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group full">
              <label>Référence bancaire</label>
              <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="N° de virement, de traite…" />
            </div>
          </div>
        ) : (
          <div className="info-box">Cette facture est intégralement encaissée.</div>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <button className="btn btn-outline" onClick={onFermer}>
            Fermer
          </button>
          {ligne.reste > 0.005 && (
            <button className="btn btn-primary" disabled={pending} onClick={enregistrer}>
              {pending ? "Enregistrement…" : "Enregistrer le règlement"}
            </button>
          )}
        </div>
      </div>
    </>
  );
}

/* ─────────── comptes bancaires ─────────── */

function GestionComptes({ comptes, toast }: { comptes: Compte[]; toast: (m: string) => void }) {
  const router = useRouter();
  const [nouveau, setNouveau] = useState("");
  const [pending, start] = useTransition();

  const faire = (run: () => Promise<A.Result>, succes: string) =>
    start(async () => {
      const r = await run();
      toast(r.ok ? succes : r.error);
      if (r.ok) router.refresh();
    });

  return (
    <div className="table-wrap" style={{ marginBottom: 18 }}>
      <div className="table-header">
        <div className="table-title">Comptes bancaires d&apos;encaissement</div>
      </div>
      <table>
        <tbody>
          {comptes.map((c) => (
            <tr key={c.id}>
              <td>{c.libelle}</td>
              <td style={{ width: 60 }}>
                <button
                  className="btn btn-danger btn-sm"
                  disabled={pending}
                  onClick={() => {
                    if (!confirm(`Supprimer le compte « ${c.libelle} » ?`)) return;
                    faire(() => A.supprimerCompteBancaire(c.id), "Compte supprimé");
                  }}
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
          <tr>
            <td>
              <input
                value={nouveau}
                onChange={(e) => setNouveau(e.target.value)}
                placeholder="Nouveau compte (ex. BIAT - EUR)…"
              />
            </td>
            <td>
              <button
                className="btn btn-primary btn-sm"
                disabled={pending || !nouveau.trim()}
                onClick={() =>
                  faire(async () => {
                    const r = await A.ajouterCompteBancaire(nouveau);
                    if (r.ok) setNouveau("");
                    return r;
                  }, "Compte ajouté")
                }
              >
                +
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
