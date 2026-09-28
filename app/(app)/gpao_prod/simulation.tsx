"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import type { SimulationData } from "@/lib/services/gpao";
import {
  bilanCoutUsine,
  heuresMensuellesUsine,
  paramsComplets,
  PARAMS_USINE_VIDES,
  type BilanCoutUsine,
  type ParamsUsine,
} from "@/lib/domain/cout-usine";
import {
  commandesPourLien,
  enregistrerParamsUsine,
  lierModele,
  lireParamsUsine,
  majPrixManuel,
  rapprocherModelesCommandes,
  simuler,
} from "./actions";

type CmdLien = { id: number; of: string; modele: string; ref: string; client: string; archived?: boolean };

const nb = new Intl.NumberFormat("fr-FR");
const eur = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const eur2 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const eur4 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const dateFr = (iso: string) => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10).split("-").reverse().join("/") : iso);

/* Simulation (nouvelle fonctionnalité) : à partir des journées GPAO, voir les
 * pièces produites + références, et le CA produit = pièces × prix de vente de
 * la commande liée — par jour et sur une période. Aucune écriture : c'est une
 * lecture/analyse. Un modèle non relié à une commande compte ses pièces mais
 * pas de CA (signalé). */
export function SimulationView() {
  const [pending, start] = useTransition();
  const moisDefaut = new Date().toISOString().slice(0, 7);
  const [from, setFrom] = useState(`${moisDefaut}-01`);
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<SimulationData | null>(null);
  const [groupe, setGroupe] = useState<"jour" | "modele">("jour");
  const [usine, setUsine] = useState<ParamsUsine>(PARAMS_USINE_VIDES);
  const [usineModifiable, setUsineModifiable] = useState(false);

  // Paramètres de coût usine partagés (charges, effectif direct, heures/mois).
  useEffect(() => {
    lireParamsUsine().then((r) => {
      if (!r.ok) return;
      setUsine(r.params);
      setUsineModifiable(r.modifiable);
    });
  }, []);
  const [cmds, setCmds] = useState<CmdLien[] | null>(null);

  const rafraichir = () =>
    start(async () => {
      const s = await simuler(from, to);
      if (s.ok) setData(s.data);
    });

  const chargerCmds = () =>
    start(async () => {
      if (cmds) return;
      const r = await commandesPourLien();
      if (r.ok) setCmds(r.data);
    });

  const lancer = () =>
    start(async () => {
      const r = await simuler(from, to);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setData(r.data);
    });

  const rapprocher = () =>
    start(async () => {
      const r = await rapprocherModelesCommandes();
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(
        `${r.lies} modèle(s) relié(s)` +
          (r.ambigus ? ` · ${r.ambigus} ambigu(s) à relier à la main` : "") +
          (r.sansMatch ? ` · ${r.sansMatch} sans commande correspondante` : ""),
      );
      // Recalcule la simulation pour refléter le CA nouvellement valorisé.
      const s = await simuler(from, to);
      if (s.ok) setData(s.data);
    });

  // Regroupement par jour ou par modèle/référence.
  const groupes = data ? regrouper(data, groupe) : [];

  // Modèles sans prix (à valoriser) : distincts, avec pièces cumulées.
  const modelesSansPrix = (() => {
    if (!data) return [];
    const m = new Map<number, { modeleId: number; modele: string; ref: string; pieces: number }>();
    for (const l of data.lignes) {
      if (l.prixVente != null) continue;
      const e = m.get(l.modeleId) ?? { modeleId: l.modeleId, modele: l.modele, ref: l.ref, pieces: 0 };
      e.pieces += l.pieces;
      m.set(l.modeleId, e);
    }
    return [...m.values()].sort((a, b) => b.pieces - a.pieces);
  })();

  return (
    <div className="page">
      <h2 className="sec">🧮 Simulation — pièces &amp; CA produits (journées GPAO)</h2>

      <div className="daybar" style={{ background: "#fff", color: "var(--txt)", border: "1px solid var(--border)", flexWrap: "wrap" }}>
        <div className="fld" style={{ margin: 0 }}>
          <label style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700 }}>Du</label>
          <br />
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ padding: 7, border: "1px solid var(--border)", borderRadius: 8 }} />
        </div>
        <div className="fld" style={{ margin: 0 }}>
          <label style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700 }}>Au</label>
          <br />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ padding: 7, border: "1px solid var(--border)", borderRadius: 8 }} />
        </div>
        <div className="fld" style={{ margin: 0 }}>
          <label style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700 }}>Grouper par</label>
          <br />
          <select value={groupe} onChange={(e) => setGroupe(e.target.value as "jour" | "modele")} style={{ padding: 7, border: "1px solid var(--border)", borderRadius: 8 }}>
            <option value="jour">Jour</option>
            <option value="modele">Modèle / référence</option>
          </select>
        </div>
        <div className="dright">
          <button className="btn primary sm" disabled={pending} onClick={lancer}>
            {pending ? "Calcul…" : "Calculer"}
          </button>
          <button
            className="btn sm"
            disabled={pending}
            title="Relie automatiquement les modèles GPAO à leur commande DBS (par référence, puis par nom) pour valoriser le CA de l'historique"
            onClick={rapprocher}
          >
            🔗 Relier modèles ↔ commandes
          </button>
          <button className="btn amber sm" disabled={!data || !data.lignes.length} onClick={() => data && printSimulation(data, groupe, usine)}>
            🖨 Imprimer
          </button>
        </div>
      </div>

      {!data ? (
        <div className="empty">Choisissez une période puis « Calculer » pour voir les pièces produites et le CA.</div>
      ) : !data.lignes.length ? (
        <div className="empty">Aucune production enregistrée sur cette période.</div>
      ) : (
        <>
          <div className="cards" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, marginTop: 12 }}>
            <Kpi label="Pièces produites" val={nb.format(data.totalPieces)} />
            <Kpi label="CA produit" val={`${eur.format(data.totalCa)} €`} accent />
            <Kpi label="Jours de production" val={String(new Set(data.lignes.map((l) => l.date)).size)} />
            {data.piecesSansPrix > 0 && (
              <Kpi label="Pièces sans prix (hors CA)" val={nb.format(data.piecesSansPrix)} warn />
            )}
          </div>

          {/* Bilan coût : charges usine réparties sur la période ÷ heures GPAO saisies. */}
          <BilanCoutPanel
            key={`${usine.chargesMensuelles}|${usine.effectifDirect}|${usine.heuresMois}`}
            data={data}
            params={usine}
            modifiable={usineModifiable}
            onEnregistrer={(p) =>
              start(async () => {
                const r = await enregistrerParamsUsine(p);
                if (!r.ok) return void toast.error(r.error);
                setUsine(r.params);
                toast.success("Paramètres de coût usine enregistrés");
              })
            }
          />

          <table className="tbl" style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>{groupe === "jour" ? "Jour" : "Modèle / réf."}</th>
                {groupe === "jour" ? <th style={{ textAlign: "left" }}>Modèles produits</th> : <th style={{ textAlign: "left" }}>Client</th>}
                <th>Pièces</th>
                <th>Prix vente</th>
                <th>CA produit</th>
              </tr>
            </thead>
            <tbody>
              {groupes.map((g) => (
                <tr key={g.cle}>
                  <td style={{ textAlign: "left", fontWeight: 700 }}>{g.libelle}</td>
                  <td style={{ textAlign: "left", color: "var(--muted)", fontSize: 12 }}>{g.detail}</td>
                  <td>{nb.format(g.pieces)}</td>
                  <td>{g.prix == null ? "—" : `${eur2.format(g.prix)} €`}</td>
                  <td style={{ fontWeight: 800 }}>{g.ca > 0 ? `${eur.format(g.ca)} €` : "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 800, borderTop: "2px solid var(--border)" }}>
                <td style={{ textAlign: "left" }} colSpan={2}>
                  TOTAL
                </td>
                <td>{nb.format(data.totalPieces)}</td>
                <td>—</td>
                <td>{eur.format(data.totalCa)} €</td>
              </tr>
            </tfoot>
          </table>

          {data.piecesSansPrix > 0 && (
            <div style={{ border: "1px solid var(--gold, #C9A227)", borderRadius: 12, padding: 12, background: "#FBF7EA", marginTop: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                ⚠ Modèles à valoriser ({modelesSansPrix.length}) — pièces comptées mais hors CA
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>
                Pour chacun : relie-le à sa commande (archivées incluses), ou saisis un prix à la main.
              </div>
              {modelesSansPrix.map((m) => (
                <div key={m.modeleId} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, padding: "6px 0", borderTop: "1px solid #eadfbf" }}>
                  <div style={{ flex: 1, minWidth: 180, fontWeight: 600 }}>
                    {m.modele}
                    {m.ref ? <span style={{ color: "var(--muted)", fontWeight: 400 }}> · {m.ref}</span> : null}
                    <span style={{ color: "var(--muted)", fontWeight: 400 }}> · {nb.format(m.pieces)} pcs</span>
                  </div>
                  {/* Prix manuel */}
                  <input
                    type="number"
                    step="0.01"
                    placeholder="prix €/pc"
                    defaultValue=""
                    style={{ width: 100, padding: 6, border: "1px solid var(--border)", borderRadius: 8 }}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      const v = Number((e.target as HTMLInputElement).value.replace(",", ".")) || 0;
                      start(async () => {
                        const r = await majPrixManuel(m.modeleId, v > 0 ? v : null);
                        if (!r.ok) return void toast.error(r.error);
                        toast.success("Prix enregistré");
                        rafraichir();
                      });
                    }}
                  />
                  <span style={{ fontSize: 11, color: "var(--muted)" }}>Entrée pour valider</span>
                  {/* Rattachement commande (archivées incluses) */}
                  <select
                    defaultValue=""
                    onFocus={chargerCmds}
                    onChange={(e) => {
                      const id = e.target.value ? Number(e.target.value) : null;
                      if (id == null) return;
                      start(async () => {
                        const r = await lierModele(m.modeleId, id);
                        if (!r.ok) return void toast.error(r.error);
                        toast.success("Modèle relié");
                        rafraichir();
                      });
                    }}
                    style={{ padding: 6, border: "1px solid var(--border)", borderRadius: 8, maxWidth: 260 }}
                  >
                    <option value="">— relier à une commande —</option>
                    {(cmds ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.modele}
                        {c.ref ? ` — ${c.ref}` : ""}
                        {c.client ? ` · ${c.client}` : ""}
                        {c.archived ? " (archivée)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Bornes réelles de la période : si « Du » ou « Au » est laissé vide, on prend
 * la première journée produite, et aujourd'hui (ou la dernière journée). */
function periodeEffective(data: SimulationData): { from: string; to: string } {
  const dates = data.lignes.map((l) => l.date).sort();
  const from = data.from || dates[0] || "";
  const to = data.to || new Date().toISOString().slice(0, 10);
  return { from, to };
}

function calculerBilan(data: SimulationData, p: ParamsUsine): BilanCoutUsine {
  const { from, to } = periodeEffective(data);
  return bilanCoutUsine(p, { from, to, heuresSaisies: data.heuresTravaillees, ca: data.totalCa, pieces: data.totalPieces });
}

type ChampCout = "chargesMensuelles" | "effectifDirect" | "heuresMois";

const pct = (x: number | null) => (x == null ? "—" : `${Math.round(x * 100)} %`);

/* Bilan coût de la période.
 *
 * Les ouvrières directes paient toute l'usine : le coût standard d'une heure
 * est charges mensuelles ÷ (effectif direct × heures/mois). Sur la période, les
 * charges sont réparties au prorata du calendrier, puis divisées par les heures
 * RÉELLEMENT saisies en GPAO — coût horaire réel. La marge est CA − charges de
 * la période : elle reste juste même quand la saisie GPAO est incomplète. */
function BilanCoutPanel({
  data,
  params,
  modifiable,
  onEnregistrer,
}: {
  data: SimulationData;
  params: ParamsUsine;
  modifiable: boolean;
  onEnregistrer: (p: ParamsUsine) => void;
}) {
  // Champs initialisés depuis les paramètres partagés ; le parent remonte le
  // composant (clé) quand ceux-ci arrivent ou sont réenregistrés.
  const [edit, setEdit] = useState<Record<ChampCout, string>>(() => ({
    chargesMensuelles: params.chargesMensuelles ? String(params.chargesMensuelles) : "",
    effectifDirect: params.effectifDirect ? String(params.effectifDirect) : "",
    heuresMois: params.heuresMois ? String(params.heuresMois) : "",
  }));

  const num = (v: string) => {
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  // Le calcul suit la saisie en cours (aperçu avant enregistrement).
  const p: ParamsUsine = {
    ...params, // objectifs (rendement/marge cibles…) conservés : réglés dans Rentabilité
    chargesMensuelles: num(edit.chargesMensuelles),
    effectifDirect: num(edit.effectifDirect),
    heuresMois: num(edit.heuresMois),
  };
  const modifie =
    p.chargesMensuelles !== params.chargesMensuelles || p.effectifDirect !== params.effectifDirect || p.heuresMois !== params.heuresMois;
  const complet = paramsComplets(p);
  const b = complet ? calculerBilan(data, p) : null;
  const { from, to } = periodeEffective(data);

  const champ = (k: ChampCout, label: string, placeholder: string, w = 100) => (
    <label style={{ fontSize: 12, color: "var(--muted)" }}>
      {label}{" "}
      <input
        type="text"
        inputMode="decimal"
        value={edit[k]}
        disabled={!modifiable}
        onChange={(e) => setEdit((x) => ({ ...x, [k]: e.target.value }))}
        placeholder={placeholder}
        style={{ width: w, padding: 6, border: "1px solid var(--border)", borderRadius: 8 }}
      />
    </label>
  );

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 12, background: "#fff", marginTop: 12 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14 }}>
        <b style={{ fontSize: 14 }}>💶 Bilan coût de la période</b>
        {champ("chargesMensuelles", "Charges usine / mois (€)", "ex: 44000", 110)}
        {champ("effectifDirect", "Ouvrières directes", "ex: 45", 70)}
        {champ("heuresMois", "Heures / mois / ouvrière", "ex: 195", 70)}
        {modifiable ? (
          <button className="btn primary sm" disabled={!modifie || !complet} onClick={() => onEnregistrer(p)}>
            Enregistrer
          </button>
        ) : (
          <span style={{ fontSize: 11, color: "var(--muted)" }}>Modifiable par l&apos;administrateur ou le responsable prod.</span>
        )}
      </div>

      {complet && (
        <div style={{ fontSize: 12, marginTop: 8, color: "var(--txt)" }}>
          Coût standard d&apos;une heure : {eur.format(p.chargesMensuelles)} € ÷ ({nb.format(p.effectifDirect)} ×{" "}
          {nb.format(p.heuresMois)} h = {nb.format(heuresMensuellesUsine(p))} h) ={" "}
          <b>{eur2.format(b?.coutHoraireStandard ?? 0)} €/h</b> · soit {eur4.format((b?.coutHoraireStandard ?? 0) / 60)} €/min
        </div>
      )}

      {!b ? (
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 10 }}>
          Renseigne les charges mensuelles de l&apos;usine, le nombre d&apos;ouvrières directes et les heures par mois pour
          obtenir le coût horaire, les charges de la période et la marge.
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginTop: 10 }}>
            <Kpi label="CA produit" val={`${eur.format(b.ca)} €`} accent />
            <Kpi label={`Charges période (${nb.format(Math.round(b.mois * 100) / 100)} mois)`} val={`${eur.format(b.chargesPeriode)} €`} warn />
            <Kpi label="Marge (CA − charges)" val={`${eur.format(b.marge)} €`} accent={b.marge >= 0} warn={b.marge < 0} />
            <Kpi label="Taux de marge" val={pct(b.tauxMarge)} accent={(b.tauxMarge ?? 0) >= 0} warn={(b.tauxMarge ?? 0) < 0} />
            <Kpi label="Coût / pièce" val={b.coutPiece == null ? "—" : `${eur2.format(b.coutPiece)} €`} />
            <Kpi label="Heures saisies GPAO" val={`${nb.format(b.heuresSaisies)} h`} />
            <Kpi label="Heures payées (théorie)" val={`${nb.format(Math.round(b.heuresTheoriques))} h`} />
            <Kpi label="Taux de saisie GPAO" val={pct(b.tauxSaisie)} warn={(b.tauxSaisie ?? 1) < 0.9} />
            <Kpi label="Coût horaire standard" val={b.coutHoraireStandard == null ? "—" : `${eur2.format(b.coutHoraireStandard)} €`} />
            <Kpi
              label="Coût horaire réel période"
              val={b.coutHoraireReel == null ? "—" : `${eur2.format(b.coutHoraireReel)} €`}
              warn={(b.coutHoraireReel ?? 0) > (b.coutHoraireStandard ?? Infinity) * 1.05}
            />
          </div>
          {b.tauxSaisie != null && b.tauxSaisie < 0.9 && (
            <div style={{ fontSize: 12, marginTop: 8, padding: "8px 10px", borderRadius: 8, background: "#FEF3F2", color: "#b42318" }}>
              ⚠ La GPAO ne couvre que {pct(b.tauxSaisie)} des heures payées sur la période (
              {nb.format(Math.round(b.heuresTheoriques - b.heuresSaisies))} h non saisies : absences, arrêts, RI ou saisies
              manquantes). Les charges restent dues : chaque heure saisie coûte donc {eur2.format(b.coutHoraireReel ?? 0)} € au
              lieu de {eur2.format(b.coutHoraireStandard ?? 0)} €.
            </div>
          )}
          {b.tauxSaisie != null && b.tauxSaisie > 1.1 && (
            <div style={{ fontSize: 12, marginTop: 8, padding: "8px 10px", borderRadius: 8, background: "#FFFAEB", color: "#93370D" }}>
              ⚠ Plus d&apos;heures saisies que d&apos;heures payées ({pct(b.tauxSaisie)}) : vérifie l&apos;effectif direct et les
              heures/mois, ou des heures supplémentaires / renforts sur la période.
            </div>
          )}
        </>
      )}
      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>
        Période du {dateFr(from)} au {dateFr(to)}{b ? ` (${b.jours} jours)` : ""}. Charges réparties au prorata du calendrier ;
        heures GPAO = cellules horaires réellement saisies (hors RI/ABS). La marge ne dépend pas de la qualité de saisie :
        CA − charges de la période.
      </div>
    </div>
  );
}

function Kpi({ label, val, accent, warn }: { label: string; val: string; accent?: boolean; warn?: boolean }) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: "10px 14px", background: "#fff" }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--muted)" }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: warn ? "#b42318" : accent ? "#067647" : "var(--txt)" }}>{val}</div>
    </div>
  );
}

type GroupeLigne = { cle: string; libelle: string; detail: string; pieces: number; prix: number | null; ca: number };

function regrouper(data: SimulationData, mode: "jour" | "modele"): GroupeLigne[] {
  const map = new Map<string, GroupeLigne & { prixSet: Set<number> }>();
  for (const l of data.lignes) {
    const cle = mode === "jour" ? l.date : `${l.modele}|${l.ref}`;
    const e =
      map.get(cle) ??
      ({
        cle,
        libelle: mode === "jour" ? dateFr(l.date) : l.modele || "—",
        detail: "",
        pieces: 0,
        prix: null,
        ca: 0,
        prixSet: new Set<number>(),
      } as GroupeLigne & { prixSet: Set<number> });
    e.pieces += l.pieces;
    e.ca += l.ca;
    if (l.prixVente != null) e.prixSet.add(l.prixVente);
    // détail : liste des modèles/réfs du jour, ou client + réf pour un modèle.
    if (mode === "jour") {
      const tag = `${l.modele}${l.ref ? ` (${l.ref})` : ""}`;
      if (!e.detail.includes(tag)) e.detail = e.detail ? `${e.detail}, ${tag}` : tag;
    } else {
      e.detail = l.ref ? `${l.client || ""} · réf ${l.ref}` : l.client || "";
    }
    map.set(cle, e);
  }
  return [...map.values()]
    .map((e) => ({ ...e, prix: e.prixSet.size === 1 ? [...e.prixSet][0] : null }))
    .sort((a, b) => (a.cle < b.cle ? -1 : 1));
}

function printSimulation(data: SimulationData, mode: "jour" | "modele", usine: ParamsUsine) {
  const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const groupes = regrouper(data, mode);
  const rows = groupes
    .map(
      (g) =>
        `<tr><td style="text-align:left">${esc(g.libelle)}</td><td style="text-align:left">${esc(
          g.detail,
        )}</td><td>${g.pieces}</td><td>${g.prix == null ? "—" : eur2.format(g.prix) + " €"}</td><td><b>${
          g.ca > 0 ? eur.format(g.ca) + " €" : "—"
        }</b></td></tr>`,
    )
    .join("");
  const h = `<h1>SIMULATION — PIÈCES &amp; CA PRODUITS</h1>
    <div class="psub">Du ${dateFr(data.from)} au ${dateFr(data.to)} · groupé par ${mode === "jour" ? "jour" : "modèle"} · source : journées GPAO</div>
    <table><thead><tr><th style="text-align:left">${mode === "jour" ? "Jour" : "Modèle/réf."}</th><th style="text-align:left">${mode === "jour" ? "Modèles" : "Client"}</th><th>Pièces</th><th>Prix vente</th><th>CA</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><td style="text-align:left" colspan="2"><b>TOTAL</b></td><td><b>${data.totalPieces}</b></td><td>—</td><td><b>${eur.format(data.totalCa)} €</b></td></tr></tfoot></table>
    ${blocBilanImpression(data, usine)}
    <div style="text-align:right;font-size:9px;color:#666;margin-top:8px">Imprimé le ${new Date().toLocaleString("fr-FR")} — GPAO DBS Fashion</div>`;
  const w = window.open("", "_blank", "width=1000,height=800");
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Simulation</title><style>
    body{font-family:'Segoe UI',Arial,sans-serif;padding:10mm;font-size:12px;color:#000}
    h1{font-size:17px;text-align:center;margin:0 0 4px}.psub{text-align:center;font-size:11px;color:#444;margin-bottom:12px}
    table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #555;padding:4px 6px;text-align:center}th{background:#e6e6e6}
    tfoot td{background:#f4f4f4}@page{size:A4 portrait;margin:10mm}
    .bilan{margin-top:14px}.bilan h2{font-size:13px;margin:0 0 6px}.bilan td:first-child{text-align:left}.bilan .note{font-size:10px;color:#444;margin-top:4px}
  </style></head><body>${h}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 250);
}

/** Bloc « bilan coût » de l'impression — seulement si les paramètres usine sont renseignés. */
function blocBilanImpression(data: SimulationData, usine: ParamsUsine): string {
  if (!paramsComplets(usine)) return "";
  const b = calculerBilan(data, usine);
  const e = (x: number | null) => (x == null ? "—" : `${eur2.format(x)} €`);
  const l = (k: string, v: string) => `<tr><td>${k}</td><td><b>${v}</b></td></tr>`;
  return `<div class="bilan"><h2>BILAN COÛT DE LA PÉRIODE</h2><table><tbody>
    ${l("Charges usine mensuelles", `${eur.format(usine.chargesMensuelles)} €`)}
    ${l("Ouvrières directes × heures/mois", `${nb.format(usine.effectifDirect)} × ${nb.format(usine.heuresMois)} h = ${nb.format(heuresMensuellesUsine(usine))} h`)}
    ${l("Coût horaire standard", `${e(b.coutHoraireStandard)} / h`)}
    ${l(`Charges de la période (${b.jours} j, ${nb.format(Math.round(b.mois * 100) / 100)} mois)`, `${eur.format(b.chargesPeriode)} €`)}
    ${l("Heures saisies GPAO / heures payées", `${nb.format(b.heuresSaisies)} h / ${nb.format(Math.round(b.heuresTheoriques))} h (${pct(b.tauxSaisie)})`)}
    ${l("Coût horaire réel de la période", `${e(b.coutHoraireReel)} / h`)}
    ${l("CA produit", `${eur.format(b.ca)} €`)}
    ${l("Marge (CA − charges)", `${eur.format(b.marge)} € (${pct(b.tauxMarge)})`)}
    ${l("Coût / pièce", e(b.coutPiece))}
  </tbody></table>
  <div class="note">Charges réparties au prorata du calendrier. Heures GPAO = cellules horaires réellement saisies (hors RI/ABS).</div></div>`;
}
