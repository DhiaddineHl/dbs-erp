"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { OBJECTIFS_DEFAUT, type ParamsUsine } from "@/lib/domain/cout-usine";
import { comparerSousTraitance, type AnalyseModele, type RapportRentabilite, type VerdictModele } from "@/lib/domain/rentabilite";
import { enregistrerParamsUsine, lireParamsUsine, rentabilite } from "./actions";
import type { GpaoState } from "./store";

type Rapport = RapportRentabilite & { configure: boolean };

const nb = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const nb1 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
const eur = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const eur2 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateFr = (iso: string) => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10).split("-").reverse().join("/") : iso);
const pct = (x: number | null | undefined) => (x == null ? "—" : `${Math.round(x * 100)} %`);
const e0 = (x: number | null | undefined) => (x == null ? "—" : `${eur.format(x)} €`);
const e2 = (x: number | null | undefined) => (x == null ? "—" : `${eur2.format(x)} €`);

const VERDICT: Record<VerdictModele, { label: string; cls: string }> = {
  perd: { label: "Perd de l'argent", cls: "r" },
  juste: { label: "Sous la marge cible", cls: "a" },
  gagne: { label: "Rentable", cls: "g" },
  "sans-prix": { label: "Sans prix", cls: "b" },
};

/* Bornes rapides : mois en cours / mois précédent. */
function mois(decalage: number): { from: string; to: string } {
  const d = new Date();
  const debut = new Date(d.getFullYear(), d.getMonth() + decalage, 1);
  const fin = decalage === 0 ? d : new Date(d.getFullYear(), d.getMonth() + decalage + 1, 0);
  const iso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  return { from: iso(debut), to: iso(fin) };
}

/* Rentabilité de l'atelier : marge par modèle, prix plancher, où part
 * l'argent, point mort, interne vs sous-traitance, et le tableau de bord
 * direction imprimable. Lecture seule, sauf les objectifs (admin/resp). */
export function RentabiliteView({ state }: { state: GpaoState }) {
  const [pending, start] = useTransition();
  const init = mois(0);
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);
  const [r, setR] = useState<Rapport | null>(null);
  const [params, setParams] = useState<ParamsUsine | null>(null);
  const [modifiable, setModifiable] = useState(false);

  useEffect(() => {
    lireParamsUsine().then((x) => {
      if (!x.ok) return;
      setParams(x.params);
      setModifiable(x.modifiable);
    });
  }, []);

  const calculer = (f = from, t = to) =>
    start(async () => {
      const x = await rentabilite(f, t);
      if (!x.ok) return void toast.error(x.error);
      setR(x.data);
    });

  const choisirMois = (dec: number) => {
    const m = mois(dec);
    setFrom(m.from);
    setTo(m.to);
    calculer(m.from, m.to);
  };

  return (
    <div className="page">
      <h2 className="sec">💰 Rentabilité de l&apos;atelier</h2>

      <div className="daybar" style={{ background: "#fff", color: "var(--txt)", border: "1px solid var(--border)", flexWrap: "wrap" }}>
        <Champ label="Du">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={inp} />
        </Champ>
        <Champ label="Au">
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={inp} />
        </Champ>
        <button className="btn sm" disabled={pending} onClick={() => choisirMois(0)}>
          Ce mois
        </button>
        <button className="btn sm" disabled={pending} onClick={() => choisirMois(-1)}>
          Mois dernier
        </button>
        <div className="dright">
          <button className="btn primary sm" disabled={pending} onClick={() => calculer()}>
            {pending ? "Calcul…" : "Calculer"}
          </button>
          <button className="btn amber sm" disabled={!r || !r.configure} onClick={() => r && imprimerTableauDeBord(r)}>
            🖨 Tableau de bord direction
          </button>
        </div>
      </div>

      {params && (
        <Objectifs
          key={`${params.rendementCible}|${params.margeCible}|${params.minutesRetouche}`}
          params={params}
          modifiable={modifiable}
          onSave={(o) =>
            start(async () => {
              const x = await enregistrerParamsUsine(o);
              if (!x.ok) return void toast.error(x.error);
              setParams(x.params);
              toast.success("Objectifs enregistrés");
              if (r) calculer();
            })
          }
        />
      )}

      {!r ? (
        <div className="empty">Choisis une période puis « Calculer » (ou « Ce mois » / « Mois dernier »).</div>
      ) : !r.configure ? (
        <div className="empty">
          Le coût de l&apos;usine n&apos;est pas encore réglé. Renseigne les charges mensuelles, les ouvrières directes et
          les heures/mois dans l&apos;onglet 🧮 Simulation → « Bilan coût de la période ».
        </div>
      ) : !r.modeles.length ? (
        <div className="empty">Aucune journée GPAO sur cette période.</div>
      ) : (
        <Rapport r={r} state={state} />
      )}
    </div>
  );
}

const inp: React.CSSProperties = { padding: 7, border: "1px solid var(--border)", borderRadius: 8 };

function Champ({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="fld" style={{ margin: 0 }}>
      <label style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700 }}>{label}</label>
      <br />
      {children}
    </div>
  );
}

function Kpi({ l, v, s, c }: { l: string; v: string; s?: string; c?: "g" | "a" | "r" }) {
  return (
    <div className={`kpi ${c ?? ""}`}>
      <div className="l">{l}</div>
      <div className="v" style={c === "r" ? { color: "#b32525" } : c === "g" ? { color: "#0d7a52" } : undefined}>
        {v}
      </div>
      {s && <div className="s">{s}</div>}
    </div>
  );
}

function Bloc({ titre, sous, children }: { titre: string; sous?: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 18 }}>
      <h3 style={{ fontSize: 14, fontWeight: 800, color: "var(--navy)", margin: "0 0 4px" }}>{titre}</h3>
      {sous && <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>{sous}</div>}
      {children}
    </section>
  );
}

/* ─────────── objectifs ─────────── */

type ChampObj = "rendementCible" | "margeCible" | "minutesRetouche";

function Objectifs({
  params,
  modifiable,
  onSave,
}: {
  params: ParamsUsine;
  modifiable: boolean;
  onSave: (o: Pick<ParamsUsine, ChampObj>) => void;
}) {
  const [v, setV] = useState<Record<ChampObj, string>>(() => ({
    rendementCible: String(params.rendementCible),
    margeCible: String(params.margeCible),
    minutesRetouche: String(params.minutesRetouche),
  }));
  const n = (x: string) => Number(x.replace(",", "."));
  const o = { rendementCible: n(v.rendementCible), margeCible: n(v.margeCible), minutesRetouche: n(v.minutesRetouche) };
  const valide = o.rendementCible > 0 && o.margeCible >= 0 && o.margeCible < 90 && o.minutesRetouche >= 0;
  const modifie =
    o.rendementCible !== params.rendementCible || o.margeCible !== params.margeCible || o.minutesRetouche !== params.minutesRetouche;
  const champ = (k: ChampObj, label: string, suffixe: string) => (
    <label style={{ fontSize: 12, color: "var(--muted)" }}>
      {label}{" "}
      <input
        type="text"
        inputMode="decimal"
        value={v[k]}
        disabled={!modifiable}
        onChange={(e) => setV((x) => ({ ...x, [k]: e.target.value }))}
        style={{ width: 60, padding: 6, border: "1px solid var(--border)", borderRadius: 8 }}
      />{" "}
      {suffixe}
    </label>
  );
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14, border: "1px solid var(--border)", borderRadius: 12, padding: "10px 12px", background: "#fff", marginBottom: 12 }}>
      <b style={{ fontSize: 13 }}>🎯 Objectifs</b>
      {champ("rendementCible", "Rendement cible", "%")}
      {champ("margeCible", "Marge cible", "% du prix")}
      {champ("minutesRetouche", "Temps d'une retouche", "min (0 = non chiffré)")}
      {modifiable ? (
        <button className="btn primary sm" disabled={!modifie || !valide} onClick={() => onSave(o)}>
          Enregistrer
        </button>
      ) : (
        <span style={{ fontSize: 11, color: "var(--muted)" }}>Modifiable par l&apos;administrateur ou le responsable prod.</span>
      )}
      <span style={{ fontSize: 11, color: "var(--muted)" }}>
        Par défaut : {OBJECTIFS_DEFAUT.rendementCible} % de rendement, {OBJECTIFS_DEFAUT.margeCible} % de marge.
      </span>
    </div>
  );
}

/* ─────────── rapport ─────────── */

function Rapport({ r, state }: { r: Rapport; state: GpaoState }) {
  const b = r.bilan;
  const cible = r.params.rendementCible / 100;
  const perdants = r.modeles.filter((m) => m.verdict === "perd");
  const pm = r.pointMort;
  const totalModeles = useMemo(
    () =>
      r.modeles.reduce(
        (s, m) => ({ pieces: s.pieces + m.pieces, heures: s.heures + m.heures, ca: s.ca + m.ca, cout: s.cout + m.cout, marge: s.marge + m.marge }),
        { pieces: 0, heures: 0, ca: 0, cout: 0, marge: 0 },
      ),
    [r.modeles],
  );

  return (
    <>
      <div className="kpis" style={{ marginTop: 4 }}>
        <Kpi l="CA produit" v={e0(b.ca)} s={`${nb.format(b.pieces)} pièces`} c="g" />
        <Kpi l="Charges de la période" v={e0(b.chargesPeriode)} s={`${b.joursTravailles} j travaillés / ${b.jours} j · ${nb1.format(b.mois)} mois`} c="a" />
        <Kpi l="Marge" v={e0(b.marge)} s={`${pct(b.tauxMarge)} du CA`} c={b.marge >= 0 ? "g" : "r"} />
        <Kpi
          l="Rendement global"
          v={pct(r.rendementGlobal)}
          s={`cible ${r.params.rendementCible} %`}
          c={(r.rendementGlobal ?? 0) >= cible ? "g" : "r"}
        />
        <Kpi l="Coût horaire" v={e2(b.coutHoraireReel)} s={`standard ${e2(b.coutHoraireStandard)}`} />
        <Kpi l="1 point de rendement" v={e0(r.valeurPointRendement)} s="gagné ou perdu sur la période" />
        <Kpi l="Modèles perdants" v={String(perdants.length)} s={`sur ${r.modeles.length}`} c={perdants.length ? "r" : "g"} />
      </div>

      {/* 1 · marge par modèle */}
      <Bloc
        titre="1 · Marge par modèle"
        sous="Coût = heures saisies du modèle × coût horaire réel de la période : la somme des marges des modèles égale la marge de la période. Les perdants sont en tête."
      >
        <div className="twrap">
          <table>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Modèle</th>
                <th>Pièces</th>
                <th>Heures</th>
                <th>
                  Rendement<small>cible {r.params.rendementCible} %</small>
                </th>
                <th>
                  Min / pièce<small>réel · SAM</small>
                </th>
                <th>Prix vente</th>
                <th>Coût / pièce</th>
                <th>
                  Prix plancher<small>marge {r.params.margeCible} %</small>
                </th>
                <th>Marge</th>
                <th>Taux</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {r.modeles.map((m) => (
                <LigneModele key={m.modeleId} m={m} cible={cible} />
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 800, borderTop: "2px solid var(--border)" }}>
                <td className="lft">TOTAL</td>
                <td>{nb.format(totalModeles.pieces)}</td>
                <td>{nb.format(totalModeles.heures)}</td>
                <td>{pct(r.rendementGlobal)}</td>
                <td></td>
                <td></td>
                <td>{totalModeles.pieces ? e2(totalModeles.cout / totalModeles.pieces) : "—"}</td>
                <td></td>
                <td style={{ color: totalModeles.marge < 0 ? "#b32525" : "#0d7a52" }}>{e0(totalModeles.marge)}</td>
                <td>{totalModeles.ca ? pct(totalModeles.marge / totalModeles.ca) : "—"}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>
          Prix plancher = SAM × coût standard ({e2(b.coutHoraireStandard)}/h) ÷ rendement cible, puis marge cible sur le prix
          de vente. Un prix de vente sous le plancher est surligné en rouge.
        </div>
      </Bloc>

      {/* 2 · où part l'argent */}
      <Pertes r={r} />

      {/* 3 · point mort */}
      <Bloc
        titre="3 · Point mort"
        sous={`Pour couvrir ${e0(b.chargesPeriode)} de charges sur ${pm.jours.length} jour(s) de production, chaque jour doit rapporter ${e0(pm.caJour)}${
          pm.piecesJour ? ` — soit ${nb.format(Math.ceil(pm.piecesJour))} pièces au prix moyen de la période` : ""
        }.`}
      >
        <div className="kpis">
          <Kpi l="CA à produire / jour" v={e0(pm.caJour)} />
          <Kpi l="Pièces / jour" v={pm.piecesJour ? nb.format(Math.ceil(pm.piecesJour)) : "—"} s="au prix moyen" />
          <Kpi
            l="Jours au-dessus"
            v={`${pm.joursAtteints} / ${pm.jours.length}`}
            c={pm.joursAtteints >= pm.jours.length / 2 ? "g" : "r"}
          />
          <Kpi l="Couverture des charges" v={pct(b.chargesPeriode ? b.ca / b.chargesPeriode : null)} c={b.ca >= b.chargesPeriode ? "g" : "r"} />
        </div>
        <div className="twrap">
          <table>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Jour</th>
                <th>Pièces</th>
                <th>CA du jour</th>
                <th>Point mort</th>
                <th>Écart</th>
                <th style={{ width: "30%" }}>CA / point mort</th>
                <th>Cumul CA</th>
                <th>Cumul charges</th>
              </tr>
            </thead>
            <tbody>
              {pm.jours.map((j) => {
                const ratio = pm.caJour > 0 ? Math.min(j.ca / pm.caJour, 1.5) : 0;
                return (
                  <tr key={j.date}>
                    <td className="lft" style={{ fontWeight: 700 }}>
                      {dateFr(j.date)}
                    </td>
                    <td>{nb.format(j.pieces)}</td>
                    <td style={{ fontWeight: 700 }}>{e0(j.ca)}</td>
                    <td>{e0(pm.caJour)}</td>
                    <td style={{ color: j.atteint ? "#0d7a52" : "#b32525", fontWeight: 700 }}>
                      {j.ecart >= 0 ? "+" : ""}
                      {e0(j.ecart)}
                    </td>
                    <td>
                      <div style={{ position: "relative", height: 10, background: "#eef2f8", borderRadius: 5 }}>
                        <div
                          style={{
                            position: "absolute",
                            inset: 0,
                            width: `${(ratio / 1.5) * 100}%`,
                            background: j.atteint ? "var(--green)" : "var(--red)",
                            borderRadius: 5,
                          }}
                        />
                        <div style={{ position: "absolute", top: -2, bottom: -2, left: `${100 / 1.5}%`, width: 2, background: "var(--navy)" }} />
                      </div>
                    </td>
                    <td>{e0(j.cumulCa)}</td>
                    <td style={{ color: j.cumulCa >= j.cumulCharges ? "#0d7a52" : "#b32525" }}>{e0(j.cumulCharges)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Bloc>

      {/* 4 · interne ou sous-traitance */}
      <SousTraitance r={r} state={state} />
    </>
  );
}

function LigneModele({ m, cible }: { m: AnalyseModele; cible: number }) {
  const v = VERDICT[m.verdict];
  const sousPlancher = m.prixVente != null && m.plancher != null && m.prixVente < m.plancher.prix;
  return (
    <tr>
      <td className="lft">
        <div style={{ fontWeight: 700 }}>{m.nom}</div>
        <div style={{ fontSize: 11, color: "var(--muted)" }}>
          {[m.ref && `réf ${m.ref}`, m.client, m.commande].filter(Boolean).join(" · ") || "non relié à une commande"}
        </div>
      </td>
      <td>{nb.format(m.pieces)}</td>
      <td>{nb.format(m.heures)}</td>
      <td style={{ color: m.rendement != null && m.rendement < cible ? "#b32525" : undefined, fontWeight: 700 }}>{pct(m.rendement)}</td>
      <td>
        {m.minutesReellesPiece == null ? "—" : nb1.format(m.minutesReellesPiece)}
        <span style={{ color: "var(--muted)" }}> · {nb1.format(m.samSec / 60)}</span>
      </td>
      <td style={sousPlancher ? { background: "#fdeaea", color: "#b32525", fontWeight: 800 } : undefined}>{e2(m.prixVente)}</td>
      <td>{e2(m.coutPiece)}</td>
      <td>{e2(m.plancher?.prix)}</td>
      <td style={{ fontWeight: 800, color: m.marge < 0 ? "#b32525" : "#0d7a52" }}>{m.verdict === "sans-prix" ? "—" : e0(m.marge)}</td>
      <td>{pct(m.tauxMarge)}</td>
      <td>
        <span className={`pill ${v.cls}`}>{v.label}</span>
      </td>
    </tr>
  );
}

/* ─────────── 2 · pertes ─────────── */

function Pertes({ r }: { r: Rapport }) {
  const p = r.pertes;
  const lignes = [
    {
      l: "Heures payées non saisies en GPAO",
      d: `${nb.format(p.heuresNonSaisies)} h — absences, arrêts non déclarés, cases oubliées`,
      v: p.eurosNonSaisies,
    },
    {
      l: `Rendement sous la cible (${r.params.rendementCible} %) — hors arrêts`,
      d: "organisation, équilibrage, formation, attente de travail…",
      v: p.eurosAutresCauses,
    },
    { l: "Arrêts déclarés", d: `${nb1.format(p.heuresArrets)} h saisies dans la GPAO`, v: p.eurosArrets },
  ];
  const max = Math.max(1, ...lignes.map((x) => x.v));
  return (
    <Bloc
      titre="2 · Où part l'argent"
      sous={`Heures perdues valorisées au coût standard (${e2(r.bilan.coutHoraireStandard)}/h). Chaque point de rendement gagné vaut ${e0(
        r.valeurPointRendement,
      )} sur la période.`}
    >
      <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 12, padding: 12 }}>
        {lignes.map((x) => (
          <div key={x.l} style={{ display: "grid", gridTemplateColumns: "minmax(220px,1.3fr) 2fr 110px", gap: 12, alignItems: "center", padding: "6px 0", borderBottom: "1px solid #eef2f8" }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{x.l}</div>
              <div style={{ fontSize: 11, color: "var(--muted)" }}>{x.d}</div>
            </div>
            <div style={{ height: 12, background: "#eef2f8", borderRadius: 6 }}>
              <div style={{ width: `${(x.v / max) * 100}%`, height: "100%", background: "var(--red)", borderRadius: 6 }} />
            </div>
            <div style={{ textAlign: "right", fontWeight: 800, color: "#b32525" }}>{e0(x.v)}</div>
          </div>
        ))}
        <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8, fontWeight: 800 }}>
          <span>Total des pertes chiffrées</span>
          <span style={{ color: "#b32525" }}>{e0(p.total)}</span>
        </div>
        <div style={{ fontSize: 12, marginTop: 6, color: "var(--muted)" }}>
          Retouches : {nb.format(p.retouches)} pièce(s)
          {p.eurosRetouches != null
            ? ` ≈ ${e0(p.eurosRetouches)} à ${r.params.minutesRetouche} min la retouche (déjà compris dans le rendement, non additionné).`
            : " — règle « Temps d'une retouche » dans les objectifs pour les chiffrer."}
        </div>
      </div>
    </Bloc>
  );
}

/* ─────────── 4 · interne ou sous-traitance ─────────── */

function SousTraitance({ r, state }: { r: Rapport; state: GpaoState }) {
  const avecFacon = r.modeles.filter((m) => m.ecartFacon != null);
  const modeles = state.modeles.filter((m) => !m.archive && m.sam > 0);
  const [modeleId, setModeleId] = useState<string>("");
  const [sam, setSam] = useState("");
  const [qte, setQte] = useState("1000");
  const [prixFacon, setPrixFacon] = useState("");
  const [rend, setRend] = useState(String(Math.round((r.rendementGlobal ?? r.params.rendementCible / 100) * 100)));
  const n = (x: string) => Number(x.replace(",", ".")) || 0;
  const heuresJour = 8; // journée type de l'atelier, pour exprimer la capacité en jours
  const c = comparerSousTraitance({
    samSec: n(sam),
    qte: n(qte),
    prixFacon: n(prixFacon),
    coutHoraire: r.bilan.coutHoraireStandard ?? 0,
    rendement: n(rend) / 100,
    effectifDirect: r.params.effectifDirect,
    heuresJour,
  });

  const choisirModele = (id: string) => {
    setModeleId(id);
    const m = modeles.find((x) => String(x.id) === id);
    if (!m) return;
    setSam(String(m.sam));
    const a = r.modeles.find((x) => x.modeleId === m.id);
    if (a?.rendement) setRend(String(Math.round(a.rendement * 100)));
    if (a?.prixFacon) setPrixFacon(String(a.prixFacon));
  };

  return (
    <Bloc
      titre="4 · Interne ou sous-traitance ?"
      sous="Coût interne = SAM ÷ rendement × coût horaire standard. À comparer au prix proposé par le façonnier — sans oublier la capacité que l'interne mobilise."
    >
      {avecFacon.length > 0 && (
        <div className="twrap" style={{ marginBottom: 10 }}>
          <table>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Modèle produit en interne (prix façon connu)</th>
                <th>Coût interne / pièce</th>
                <th>Prix façon</th>
                <th>Écart / pièce</th>
                <th>Sur les pièces produites<small>vs façonnier</small></th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {avecFacon.map((m) => {
                const ecart = m.ecartFacon ?? 0;
                return (
                  <tr key={m.modeleId}>
                    <td className="lft" style={{ fontWeight: 700 }}>
                      {m.nom} <span style={{ color: "var(--muted)", fontWeight: 400 }}>{m.ref && `· ${m.ref}`}</span>
                    </td>
                    <td>{e2(m.coutPiece)}</td>
                    <td>{e2(m.prixFacon)}</td>
                    <td style={{ fontWeight: 800, color: ecart <= 0 ? "#0d7a52" : "#b32525" }}>
                      {ecart > 0 ? "+" : ""}
                      {e2(ecart)}
                    </td>
                    <td style={{ color: ecart <= 0 ? "#0d7a52" : "#b32525" }}>
                      {ecart <= 0 ? "économie " : "surcoût "}
                      {e0(Math.abs(ecart * m.pieces))}
                    </td>
                    <td>
                      <span className={`pill ${ecart <= 0 ? "g" : "r"}`}>{ecart <= 0 ? "Interne gagnant" : "Façonnier moins cher"}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 12, padding: 12 }}>
        <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8 }}>🧮 Simulateur pour une nouvelle commande</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
          <Champ label="Modèle (facultatif)">
            <select value={modeleId} onChange={(e) => choisirModele(e.target.value)} style={{ ...inp, maxWidth: 240 }}>
              <option value="">— saisir le SAM à la main —</option>
              {modeles.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nom}
                  {m.ref ? ` — ${m.ref}` : ""} ({nb1.format(m.sam / 60)} min)
                </option>
              ))}
            </select>
          </Champ>
          <Champ label="SAM (secondes)">
            <input value={sam} onChange={(e) => setSam(e.target.value)} inputMode="decimal" placeholder="ex: 1800" style={{ ...inp, width: 100 }} />
          </Champ>
          <Champ label="Quantité">
            <input value={qte} onChange={(e) => setQte(e.target.value)} inputMode="decimal" style={{ ...inp, width: 90 }} />
          </Champ>
          <Champ label="Prix façonnier (€/pc)">
            <input value={prixFacon} onChange={(e) => setPrixFacon(e.target.value)} inputMode="decimal" placeholder="ex: 3,20" style={{ ...inp, width: 100 }} />
          </Champ>
          <Champ label="Rendement attendu (%)">
            <input value={rend} onChange={(e) => setRend(e.target.value)} inputMode="decimal" style={{ ...inp, width: 70 }} />
          </Champ>
        </div>
        {!c ? (
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 10 }}>
            Renseigne le SAM, la quantité, le prix du façonnier et le rendement attendu.
          </div>
        ) : (
          <>
            <div className="kpis" style={{ marginTop: 12, marginBottom: 6 }}>
              <Kpi l="Coût interne / pièce" v={e2(c.coutInternePiece)} />
              <Kpi l="Total interne" v={e0(c.totalInterne)} />
              <Kpi l="Total sous-traitance" v={e0(c.totalSousTraitance)} />
              <Kpi
                l={c.ecart < 0 ? "Économie en interne" : "Surcoût en interne"}
                v={e0(Math.abs(c.ecart))}
                c={c.choix === "interne" ? "g" : c.choix === "sous-traitance" ? "r" : "a"}
              />
              <Kpi l="Capacité mobilisée" v={`${nb.format(c.heuresNecessaires)} h`} s={`≈ ${nb1.format(c.joursUsine)} jour(s) de 8 h de toute l'usine`} />
            </div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                padding: "8px 10px",
                borderRadius: 8,
                background: c.choix === "interne" ? "#e1f6ee" : c.choix === "sous-traitance" ? "#fdeaea" : "#fdf3dd",
                color: c.choix === "interne" ? "#0d7a52" : c.choix === "sous-traitance" ? "#b32525" : "#9a6c0a",
              }}
            >
              {c.choix === "interne"
                ? `✅ Produire en interne : ${e2(-c.ecart / n(qte))} de moins par pièce que le façonnier.`
                : c.choix === "sous-traitance"
                  ? `↗ Le façonnier est moins cher de ${e2(c.ecart / n(qte))} par pièce — l'interne ne vaut que si la capacité serait sinon inoccupée.`
                  : "≈ Équivalent (moins de 2 % d'écart) : décider selon la charge des chaînes et les délais."}
            </div>
          </>
        )}
      </div>
    </Bloc>
  );
}

/* ─────────── 6 · tableau de bord direction (impression) ─────────── */

function imprimerTableauDeBord(r: Rapport) {
  const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const b = r.bilan;
  const p = r.pertes;
  const kpi = (l: string, v: string, s = "") => `<div class="k"><div class="kl">${l}</div><div class="kv">${v}</div><div class="ks">${s}</div></div>`;
  const pires = r.modeles.filter((m) => m.verdict !== "sans-prix").slice(0, 5);
  const meilleurs = [...r.modeles].filter((m) => m.verdict !== "sans-prix").sort((a, b2) => b2.marge - a.marge).slice(0, 5);
  const ligneM = (m: AnalyseModele) =>
    `<tr><td class="l">${esc(m.nom)}${m.ref ? ` <span class="m">· ${esc(m.ref)}</span>` : ""}</td><td>${nb.format(m.pieces)}</td><td>${pct(m.rendement)}</td><td>${e2(
      m.prixVente,
    )}</td><td>${e2(m.coutPiece)}</td><td>${e2(m.plancher?.prix)}</td><td class="${m.marge < 0 ? "neg" : "pos"}"><b>${e0(m.marge)}</b></td><td>${pct(m.tauxMarge)}</td></tr>`;
  const tete = `<tr><th class="l">Modèle</th><th>Pièces</th><th>Rend.</th><th>Prix</th><th>Coût/pc</th><th>Plancher</th><th>Marge</th><th>Taux</th></tr>`;
  const html = `
  <div class="hd"><div><div class="brand">DBS FASHION</div><div class="sub">Atelier de confection — GPAO</div></div>
  <div class="tr"><div class="t">TABLEAU DE BORD DIRECTION</div><div class="sub">Du ${dateFr(r.from)} au ${dateFr(r.to)} · ${b.jours} jours</div></div></div>
  <div class="ks4">
    ${kpi("CA produit", e0(b.ca), `${nb.format(b.pieces)} pièces`)}
    ${kpi("Charges usine", e0(b.chargesPeriode), `${e0(r.params.chargesMensuelles)} / mois`)}
    ${kpi("Marge", e0(b.marge), `${pct(b.tauxMarge)} du CA`)}
    ${kpi("Rendement", pct(r.rendementGlobal), `cible ${r.params.rendementCible} %`)}
    ${kpi("Coût horaire réel", e2(b.coutHoraireReel), `standard ${e2(b.coutHoraireStandard)}`)}
    ${kpi("Saisie GPAO", pct(b.tauxSaisie), `${nb.format(b.heuresSaisies)} h / ${nb.format(b.heuresTheoriques)} h payées`)}
    ${kpi("Point mort / jour", e0(r.pointMort.caJour), `${r.pointMort.joursAtteints}/${r.pointMort.jours.length} jours atteints`)}
    ${kpi("1 pt de rendement", e0(r.valeurPointRendement), "sur la période")}
  </div>
  <h2>Où part l'argent</h2>
  <table><tbody>
    <tr><td class="l">Heures payées non saisies en GPAO (${nb.format(p.heuresNonSaisies)} h)</td><td class="neg"><b>${e0(p.eurosNonSaisies)}</b></td></tr>
    <tr><td class="l">Rendement sous la cible — hors arrêts</td><td class="neg"><b>${e0(p.eurosAutresCauses)}</b></td></tr>
    <tr><td class="l">Arrêts déclarés (${nb1.format(p.heuresArrets)} h)</td><td class="neg"><b>${e0(p.eurosArrets)}</b></td></tr>
    <tr class="tot"><td class="l">Total des pertes chiffrées</td><td class="neg"><b>${e0(p.total)}</b></td></tr>
    <tr><td class="l">Retouches</td><td>${nb.format(p.retouches)} pièce(s)${p.eurosRetouches != null ? ` ≈ ${e0(p.eurosRetouches)}` : ""}</td></tr>
  </tbody></table>
  <h2>Modèles les moins rentables</h2>
  <table><thead>${tete}</thead><tbody>${pires.map(ligneM).join("") || `<tr><td colspan="8">—</td></tr>`}</tbody></table>
  <h2>Modèles les plus rentables</h2>
  <table><thead>${tete}</thead><tbody>${meilleurs.map(ligneM).join("") || `<tr><td colspan="8">—</td></tr>`}</tbody></table>
  <div class="note">Coût horaire standard = ${e0(r.params.chargesMensuelles)} ÷ (${nb.format(r.params.effectifDirect)} ouvrières × ${nb.format(
    r.params.heuresMois,
  )} h). Charges de la période au prorata des jours réellement travaillés (jours avec saisie GPAO ÷ jours travaillés par mois) ; coût d'un modèle = ses heures saisies × coût horaire réel. Prix plancher = SAM ÷ rendement cible (${
    r.params.rendementCible
  } %) × coût standard, marge ${r.params.margeCible} % sur le prix de vente.</div>
  <div class="sig"><div>Responsable production</div><div>Direction</div></div>
  <div class="foot">Imprimé le ${new Date().toLocaleString("fr-FR")} — PilotPro / GPAO DBS Fashion</div>`;
  const w = window.open("", "_blank", "width=1000,height=900");
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Tableau de bord direction</title><style>
    *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    body{font-family:'Segoe UI',Arial,sans-serif;padding:8mm;font-size:11px;color:#111}
    .hd{display:flex;justify-content:space-between;border-bottom:2px solid #0f1f3d;padding-bottom:6px;margin-bottom:10px}
    .brand{font-size:18px;font-weight:800}.sub{font-size:10px;color:#555}.tr{text-align:right}.t{font-size:15px;font-weight:800}
    .ks4{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:8px}
    .k{border:1px solid #bbb;border-radius:6px;padding:5px 8px}.kl{font-size:8.5px;font-weight:700;text-transform:uppercase;color:#555}.kv{font-size:15px;font-weight:800}.ks{font-size:9px;color:#555}
    h2{font-size:12px;margin:12px 0 4px;color:#0f1f3d;text-transform:uppercase}
    table{width:100%;border-collapse:collapse;font-size:10.5px}th,td{border:1px solid #999;padding:3px 6px;text-align:center}th{background:#e6e9f0}
    td.l,th.l{text-align:left}.m{color:#666}.neg{color:#b32525}.pos{color:#0d7a52}tr.tot td{background:#f4f4f4}
    .note{font-size:9px;color:#444;margin-top:10px}
    .sig{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-top:18px}.sig div{border-top:1px dashed #888;padding-top:4px;height:40px;font-size:10px;color:#555}
    .foot{text-align:right;font-size:8.5px;color:#666;margin-top:6px}
    @page{size:A4 portrait;margin:8mm}
  </style></head><body>${html}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 250);
}
