"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CLIENT_NAMES, fdate } from "@/lib/facturation/store";
import { MODES_PAIEMENT, STATUT_PAIEMENT, balanceAgee } from "@/lib/domain/finance";
import type { EncaissementRow } from "@/lib/services/finance";
import { DEVISES, type Devise, type Montants, LISTE_DEVISES, formatMontant, formatMontants } from "@/lib/domain/montants";
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

  /* Par devise : une facture en dinars et une en euros ne se somment pas.
   * On encaisse le TTC ; le HT n'est rappelé que pour mémoire. */
  const totaux = useMemo(() => {
    const t = { ht: {} as Montants, ttc: {} as Montants, encaisse: {} as Montants, reste: {} as Montants };
    const plus = (m: Montants, d: Devise, v: number) => (m[d] = (m[d] ?? 0) + v);
    for (const l of filtrees) {
      plus(t.ht, l.devise, l.totalHt);
      plus(t.ttc, l.devise, l.total);
      plus(t.encaisse, l.devise, l.regle);
      plus(t.reste, l.devise, Math.max(0, l.reste));
    }
    return t;
  }, [filtrees]);

  const ligneOuverte = ouverte === null ? null : (lignes.find((l) => l.factureId === ouverte) ?? null);

  const balances = useMemo(
    () =>
      LISTE_DEVISES.filter((d) => filtrees.some((l) => l.devise === d)).map((devise) => ({
        devise,
        ba: balanceAgee(
          filtrees
            .filter((l) => l.devise === devise)
            .map((l) => ({
              facture: { type: l.type, date: l.date, total: l.total, paiement: l.paiement },
              reste: l.reste,
            })),
        ),
      })),
    [filtrees],
  );
  const echu: Montants = {};
  const plus90: Montants = {};
  for (const { devise, ba } of balances) {
    echu[devise] = ba.total - ba.nonEchu;
    plus90[devise] = ba.plus90;
  }
  const aDesEchus = balances.some(({ ba }) => ba.total - ba.nonEchu > 0.005);

  return (
    <div className="page">
      <div className="kpi-grid">
        <Kpi label="Total TTC facturé" valeur={formatMontants(totaux.ttc)} sub={`HT : ${formatMontants(totaux.ht)}`} />
        <Kpi label="Encaissé" valeur={formatMontants(totaux.encaisse)} classe="green" />
        <Kpi label="Reste à encaisser" valeur={formatMontants(totaux.reste)} classe="gold" />
        <Kpi
          label="Dont échu"
          valeur={formatMontants(echu)}
          classe={aDesEchus ? "red" : "green"}
          sub={`${formatMontants(plus90)} à plus de 90 jours`}
        />
      </div>

      <div className="table-wrap" style={{ marginBottom: 18 }}>
        <div className="table-header">
          <div className="table-title">Balance âgée du reste à encaisser</div>
        </div>
        <table>
          <thead>
            <tr>
              {balances.length > 1 && <th>Devise</th>}
              <th>Non échu</th>
              <th>0 – 30 j</th>
              <th>31 – 60 j</th>
              <th>61 – 90 j</th>
              <th>+ 90 j</th>
              <th style={{ textAlign: "right" }}>Total dû</th>
            </tr>
          </thead>
          <tbody>
            {balances.map(({ devise, ba }) => (
              <tr key={devise}>
                {balances.length > 1 && <td>{devise}</td>}
                <td>{formatMontant(ba.nonEchu, devise)}</td>
                <td>{formatMontant(ba.j0_30, devise)}</td>
                <td>{formatMontant(ba.j31_60, devise)}</td>
                <td>{formatMontant(ba.j61_90, devise)}</td>
                <td className={ba.plus90 > 0 ? "neg" : undefined}>{formatMontant(ba.plus90, devise)}</td>
                <td style={{ textAlign: "right", fontWeight: 700 }}>{formatMontant(ba.total, devise)}</td>
              </tr>
            ))}
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
            {filtrees.length} facture(s) — reste {formatMontants(totaux.reste)}
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>N°</th>
              <th>Date</th>
              <th>Échéance</th>
              <th>Client</th>
              <th style={{ textAlign: "right" }}>Montant TTC</th>
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
                    <td style={{ textAlign: "right" }} title={l.tauxTva > 0 ? `HT ${formatMontant(l.totalHt, l.devise)} + TVA ${l.tauxTva} %` : "Sans TVA"}>
                      {formatMontant(l.total, l.devise)}
                    </td>
                    <td style={{ textAlign: "right" }} className={l.regle > 0 ? "pos" : undefined}>
                      {formatMontant(l.regle, l.devise)}
                    </td>
                    <td style={{ textAlign: "right", fontWeight: 700 }} className={l.reste > 0.005 ? "neg" : undefined}>
                      {formatMontant(Math.max(0, l.reste), l.devise)}
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

      {/* Recherche dans `lignes`, pas dans `filtrees` : un encaissement qui solde
        * la facture peut la faire sortir du filtre en cours pendant que la
        * modale est ouverte. */}
      {ligneOuverte && (
        <ModalReglements
          ligne={ligneOuverte}
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
  const [montant, setMontant] = useState(Math.max(0, ligne.reste).toFixed(DEVISES[ligne.devise].decimales));
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
    /* La modale vit DANS l'overlay : posée à côté, elle resterait dans le flux
     * de la page, cachée sous un voile en position:fixed. */
    <div className="fac-ovl" onClick={(e) => e.target === e.currentTarget && onFermer()}>
      <div className="fac-modal" role="dialog" aria-label="Règlements de la facture">
        <div className="detail-head">
          <div>
            <div className="dh-title">RÈGLEMENTS — FACTURE N°{ligne.num}</div>
            <div className="dh-sub">
              Montant TTC {formatMontant(ligne.total, ligne.devise)} · encaissé {formatMontant(ligne.regle, ligne.devise)}{" "}
              · reste {formatMontant(Math.max(0, ligne.reste), ligne.devise)}
              {ligne.echeance && ` · échéance ${fdate(ligne.echeance)}`}
            </div>
          </div>
          <button className="detail-close" onClick={onFermer} aria-label="Fermer">
            ✕
          </button>
        </div>

        <div className="detail-body">
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
                    <td style={{ textAlign: "right", fontWeight: 700 }}>{formatMontant(r.montant, ligne.devise)}</td>
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
                <label>Montant ({DEVISES[ligne.devise].symbole})</label>
                <input type="number" step={ligne.devise === "TND" ? "0.001" : "0.01"} value={montant} onChange={(e) => setMontant(e.target.value)} />
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
        </div>

        <div className="detail-foot" style={{ justifyContent: "flex-end", gap: 8 }}>
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
    </div>
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
