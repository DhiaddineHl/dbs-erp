"use client";

import { useMemo, useState } from "react";
import { CLIENT_NAMES, fdate, nb } from "@/lib/facturation/store";
import { libelleEcheance } from "@/lib/domain/finance";
import type { EncaissementRow } from "@/lib/services/finance";

/* Relances — les factures impayées dont l'échéance est passée ou proche, avec
 * l'e-mail prêt à envoyer. Le seuil permet d'anticiper : à 7 jours, on prévient
 * avant l'échéance plutôt que de relancer après. */
export function Relances({
  lignes,
  comptes,
  toast,
}: {
  lignes: EncaissementRow[];
  comptes: { id: number; libelle: string }[];
  toast: (m: string) => void;
}) {
  const [seuil, setSeuil] = useState(0);
  const [ouvert, setOuvert] = useState<string | null>(null);

  /* Une facture entre dans la liste si elle n'est pas soldée et que son
   * échéance est dépassée, ou à moins de `seuil` jours. */
  const concernees = useMemo(
    () =>
      lignes.filter((l) => l.reste > 0.005 && l.echeance && l.joursRetard !== null && l.joursRetard >= -seuil),
    [lignes, seuil],
  );

  const parClient = useMemo(() => {
    const m = new Map<string, EncaissementRow[]>();
    for (const l of concernees) {
      const cle = CLIENT_NAMES[l.clientKey] || l.marque || l.clientKey || "—";
      const g = m.get(cle);
      if (g) g.push(l);
      else m.set(cle, [l]);
    }
    return [...m.entries()]
      .map(([client, factures]) => ({
        client,
        factures: factures.slice().sort((a, b) => (a.echeance || "").localeCompare(b.echeance || "")),
        total: factures.reduce((s, f) => s + f.reste, 0),
        pireRetard: Math.max(...factures.map((f) => f.joursRetard ?? 0)),
      }))
      .sort((a, b) => b.pireRetard - a.pireRetard);
  }, [concernees]);

  const totalDu = parClient.reduce((s, c) => s + c.total, 0);
  const compte = comptes[0]?.libelle ?? "(coordonnées bancaires à préciser)";

  return (
    <div className="page">
      <div className="kpi-grid">
        <Kpi label="Clients à relancer" valeur={String(parClient.length)} />
        <Kpi label="Factures concernées" valeur={String(concernees.length)} classe="gold" />
        <Kpi label="Total restant dû" valeur={`${nb(totalDu)} €`} classe="red" />
        <Kpi
          label="Retard maximum"
          valeur={parClient.length ? `${parClient[0].pireRetard} j` : "—"}
          classe={parClient.length && parClient[0].pireRetard > 30 ? "red" : "green"}
        />
      </div>

      <div className="search-bar">
        <label style={{ fontSize: 12, fontWeight: 600 }}>Anticiper les échéances à</label>
        <select value={seuil} onChange={(e) => setSeuil(Number(e.target.value))}>
          <option value={0}>Échues uniquement</option>
          <option value={7}>7 jours</option>
          <option value={15}>15 jours</option>
          <option value={30}>30 jours</option>
        </select>
        <button className="btn btn-outline btn-sm" onClick={() => window.print()}>
          🖨 Imprimer la liste
        </button>
      </div>

      {parClient.length === 0 ? (
        <div className="info-box">Aucune facture à relancer — tout est encaissé ou dans les délais.</div>
      ) : (
        parClient.map((groupe) => {
          const email = construireEmail(groupe.client, groupe.factures, compte);
          const ouvertIci = ouvert === groupe.client;
          return (
            <div className="table-wrap" key={groupe.client} style={{ marginBottom: 18 }}>
              <div className="table-header">
                <div className="table-title">
                  {groupe.client} — {nb(groupe.total)} € dus
                  {groupe.pireRetard > 0 && (
                    <span className="tag tag-red" style={{ marginLeft: 8 }}>
                      {groupe.pireRetard} j de retard
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn btn-outline btn-sm" onClick={() => setOuvert(ouvertIci ? null : groupe.client)}>
                    {ouvertIci ? "Masquer l’e-mail" : "Préparer l’e-mail"}
                  </button>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      window.location.href = `mailto:?subject=${encodeURIComponent(email.sujet)}&body=${encodeURIComponent(email.corps)}`;
                    }}
                  >
                    📧 Envoyer
                  </button>
                </div>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>N°</th>
                    <th>Date</th>
                    <th>Échéance</th>
                    <th>État</th>
                    <th style={{ textAlign: "right" }}>Montant</th>
                    <th style={{ textAlign: "right" }}>Reste dû</th>
                  </tr>
                </thead>
                <tbody>
                  {groupe.factures.map((f) => (
                    <tr key={f.factureId}>
                      <td>
                        <b>{f.num}</b>
                      </td>
                      <td>{fdate(f.date)}</td>
                      <td>{fdate(f.echeance)}</td>
                      <td className={(f.joursRetard ?? 0) > 0 ? "neg" : undefined}>
                        {libelleEcheance(f.joursRetard ?? 0)}
                      </td>
                      <td style={{ textAlign: "right" }}>{nb(f.total)} €</td>
                      <td style={{ textAlign: "right", fontWeight: 700 }}>{nb(f.reste)} €</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {ouvertIci && (
                <div style={{ padding: 14, borderTop: "1px solid var(--border)" }}>
                  <div className="muted-note" style={{ marginBottom: 6 }}>
                    Objet : <b>{email.sujet}</b>
                  </div>
                  <textarea readOnly rows={14} value={email.corps} style={{ width: "100%", fontSize: 12 }} />
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={async () => {
                        await navigator.clipboard.writeText(email.corps);
                        toast("E-mail copié dans le presse-papier");
                      }}
                    >
                      📋 Copier
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

function Kpi({ label, valeur, classe }: { label: string; valeur: string; classe?: string }) {
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className={`kpi-value${classe ? ` ${classe}` : ""}`}>{valeur}</div>
    </div>
  );
}

/** Corps de relance, repris de la formulation du client — ferme mais courtoise,
 * avec la réserve d'usage si le règlement s'est croisé avec l'envoi. */
function construireEmail(client: string, factures: EncaissementRow[], compte: string) {
  const echues = factures.some((f) => (f.joursRetard ?? 0) > 0);
  const sujet = `${echues ? "Relance — factures échues" : "Rappel d'échéance"} — DBS FASHION`;

  const lignes = factures
    .map(
      (f) =>
        `  • Facture ${f.num} du ${fdate(f.date)} — échéance ${fdate(f.echeance)} (${libelleEcheance(f.joursRetard ?? 0)}) — montant ${nb(f.total)} € — reste dû ${nb(f.reste)} €`,
    )
    .join("\n");
  const total = factures.reduce((s, f) => s + f.reste, 0);

  const corps = [
    "Bonjour,",
    "",
    echues
      ? "Sauf erreur ou règlement récent de votre part, nous constatons que les factures suivantes demeurent impayées à ce jour :"
      : "Nous nous permettons de vous rappeler les échéances prochaines des factures suivantes :",
    "",
    lignes,
    "",
    `Total restant dû : ${nb(total)} €`,
    "",
    `Nous vous remercions de bien vouloir procéder au règlement${echues ? " dans les meilleurs délais" : " à l'échéance"}, ou de nous communiquer la date de paiement prévue.`,
    `Virement à effectuer sur : ${compte}.`,
    "",
    "En cas de règlement déjà intervenu, nous vous prions de ne pas tenir compte de ce message.",
    "",
    "Cordialement,",
    "Service Comptabilité — STE DBS FASHION",
    "Diar Ben Salem, Beni Khiar, Nabeul — Tunisie",
  ].join("\n");

  return { sujet, corps, client };
}
