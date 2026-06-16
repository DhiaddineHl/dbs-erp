"use client";

import { useCallback, useRef, useState } from "react";
import "./gpao.css";
import {
  type Chaine,
  type GpaoState,
  type Journee,
  type Modele,
  type Ouvriere,
  SEUIL_B,
  SEUIL_H,
  SEUIL_RET,
  cellDetail,
  chObjH,
  chObjJour,
  chRend,
  chRetTotal,
  chSortieTotal,
  cumulModele,
  findC,
  findJ,
  findM,
  fmtDate,
  ouvCellQte,
  ouvHasMulti,
  ouvObjAjuste,
  ouvObjH,
  ouvProd,
  ouvRend,
  ouvRet,
  ouvRetPct,
  ouvSamAt,
  rbarCls,
  rcls,
  rcol,
  retcol,
  uid,
  useGpaoStore,
} from "./store";
import { ChaineModal, ModeleModal, NewDayModal, OuvriereModal } from "./modals";
import { PostesHeureModal } from "./postes-heure";
import { HistoView } from "./histo";
import { TvMode } from "./tv-mode";

type View = "jours" | "jour" | "chaines" | "modeles" | "cumul" | "histo";

export default function GpaoProdPage() {
  const { state, mutate } = useGpaoStore();

  const [view, setView] = useState<View>("jours");
  const [currentDayId, setCurrentDayId] = useState<number | null>(null);
  const [currentChaineId, setCurrentChaineId] = useState<number | null>(null);
  const [tvOpen, setTvOpen] = useState(false);
  const [savedAt, setSavedAt] = useState<string>("");

  // modal state
  const [newDay, setNewDay] = useState(false);
  const [chaineModal, setChaineModal] = useState<{ open: boolean; edit: Chaine | null }>({ open: false, edit: null });
  const [modeleModal, setModeleModal] = useState<{ open: boolean; edit: Modele | null }>({ open: false, edit: null });
  const [ouvModal, setOuvModal] = useState<{ open: boolean; chaineId: number; ouv: Ouvriere | null }>({
    open: false,
    chaineId: 0,
    ouv: null,
  });
  const [posteHeureOuv, setPosteHeureOuv] = useState<number | null>(null);

  // toast
  const [toastMsg, setToastMsg] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = useCallback((m: string) => {
    setToastMsg(m);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(""), 2600);
  }, []);

  const markSaved = useCallback(() => {
    setSavedAt("✓ " + new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }));
  }, []);

  if (!state) return <div className="gp" style={{ padding: 24 }} />;

  const go = (p: View) => setView(p);

  /* ─────────── data ops ─────────── */
  const createDay = (d: { date: string; chaineId: number; modeleId: number; effectif: number; nbHeures: number }) => {
    const cols = Array.from({ length: d.nbHeures }, (_, i) => `H${i + 1}`);
    const j: Journee = { id: uid(), ...d, cols, sortie: {}, ops: {}, cloture: false };
    mutate((s) => s.journees.push(j));
    markSaved();
    setNewDay(false);
    setCurrentDayId(j.id);
    setView("jour");
    toast("✅ Journée créée");
  };
  const delDay = (id: number) => {
    if (!confirm("Supprimer cette journée et toutes ses données ?")) return;
    mutate((s) => (s.journees = s.journees.filter((j) => j.id !== id)));
    markSaved();
    toast("🗑 Journée supprimée");
  };
  const setSortie = (col: string, val: string) => {
    mutate((s) => {
      const j = findJ(s, currentDayId!);
      if (!j || j.cloture) return;
      const v = val.trim();
      if (v === "") delete j.sortie[col];
      else {
        const n = parseFloat(v.replace(",", "."));
        j.sortie[col] = isNaN(n) ? 0 : n;
      }
    });
    markSaved();
  };
  const setOp = (ouvId: number, col: string, val: string) => {
    mutate((s) => {
      const j = findJ(s, currentDayId!);
      if (!j || j.cloture) return;
      const v = val.trim().toUpperCase();
      if (!j.ops[ouvId]) j.ops[ouvId] = {};
      if (v === "") delete j.ops[ouvId][col];
      else if (v === "RI" || v === "ABS") j.ops[ouvId][col] = v;
      else {
        const n = parseFloat(v.replace(",", "."));
        j.ops[ouvId][col] = isNaN(n) ? 0 : n;
      }
    });
    markSaved();
  };
  const setRet = (ouvId: number, val: string) => {
    mutate((s) => {
      const j = findJ(s, currentDayId!);
      if (!j || j.cloture) return;
      if (!j.ret) j.ret = {};
      const v = val.trim();
      if (v === "") delete j.ret[ouvId];
      else {
        const n = parseFloat(v.replace(",", "."));
        j.ret[ouvId] = isNaN(n) ? 0 : n;
      }
    });
    markSaved();
  };
  const setObjManuel = (val: string) => {
    let manual = 0;
    mutate((s) => {
      const j = findJ(s, currentDayId!);
      if (!j) return;
      const v = val.trim().replace(",", ".");
      const n = parseFloat(v);
      if (v === "" || isNaN(n) || n <= 0) delete j.objManuel;
      else j.objManuel = n;
      manual = j.objManuel ?? 0;
    });
    markSaved();
    toast(manual ? `🎯 Objectif fixé à ${manual} p/h` : "Objectif remis en automatique");
  };
  const toggleCloture = () => {
    let nowClosed = false;
    mutate((s) => {
      const j = findJ(s, currentDayId!);
      if (!j) return;
      j.cloture = !j.cloture;
      nowClosed = j.cloture;
    });
    markSaved();
    toast(nowClosed ? "✓ Journée clôturée" : "🔓 Journée réouverte");
  };
  const dupDay = (id: number) => {
    const src = findJ(state, id);
    if (!src) return;
    const nd = prompt("Date de la nouvelle journée (AAAA-MM-JJ) :", new Date().toISOString().slice(0, 10));
    if (!nd) return;
    const nj: Journee = {
      id: uid(),
      date: nd,
      chaineId: src.chaineId,
      modeleId: src.modeleId,
      effectif: src.effectif,
      nbHeures: src.nbHeures,
      cols: src.cols.slice(),
      sortie: {},
      ops: {},
      ret: {},
      opsSam: {},
      opsPoste: {},
      opsDetail: {},
      objManuel: src.objManuel || 0,
      cloture: false,
    };
    mutate((s) => s.journees.push(nj));
    markSaved();
    setCurrentDayId(nj.id);
    setView("jour");
    toast("⎘ Journée dupliquée — chaîne et ouvrières conservées, saisie vierge");
  };
  /** Persist the postes-par-heure editor output (computed in the modal). */
  const savePosteHeure = (
    ouvId: number,
    result: {
      ops: Record<string, number | null>;
      sm: Record<string, number>;
      pm: Record<string, string>;
      dt: Record<string, { poste: string; sam: number; qte: number }[]>;
    },
  ) => {
    mutate((s) => {
      const j = findJ(s, currentDayId!);
      if (!j) return;
      if (!j.ops[ouvId]) j.ops[ouvId] = {};
      if (!j.opsSam) j.opsSam = {};
      if (!j.opsPoste) j.opsPoste = {};
      if (!j.opsDetail) j.opsDetail = {};
      for (const [hour, qte] of Object.entries(result.ops)) {
        if (qte === null) delete j.ops[ouvId][hour];
        else j.ops[ouvId][hour] = qte;
      }
      if (Object.keys(result.sm).length) j.opsSam[ouvId] = result.sm;
      else delete j.opsSam[ouvId];
      if (Object.keys(result.pm).length) j.opsPoste[ouvId] = result.pm;
      else delete j.opsPoste[ouvId];
      if (Object.keys(result.dt).length) j.opsDetail[ouvId] = result.dt;
      else delete j.opsDetail[ouvId];
    });
    markSaved();
    setPosteHeureOuv(null);
    toast("✅ Opérations par heure enregistrées");
  };
  const resetPosteHeure = (ouvId: number) => {
    mutate((s) => {
      const j = findJ(s, currentDayId!);
      if (!j) return;
      if (j.opsSam) delete j.opsSam[ouvId];
      if (j.opsPoste) delete j.opsPoste[ouvId];
      if (j.opsDetail) delete j.opsDetail[ouvId];
    });
    markSaved();
    setPosteHeureOuv(null);
    toast("Réinitialisé");
  };

  const saveChaine = (data: { nom: string; chef: string }) => {
    if (!data.nom) return toast("⚠ Nom requis");
    mutate((s) => {
      if (chaineModal.edit) {
        const c = findC(s, chaineModal.edit.id);
        if (c) {
          c.nom = data.nom;
          c.chef = data.chef;
        }
      } else {
        const nc: Chaine = { id: uid(), nom: data.nom, chef: data.chef, ouvrieres: [] };
        s.chaines.push(nc);
        setCurrentChaineId(nc.id);
      }
    });
    markSaved();
    setChaineModal({ open: false, edit: null });
    toast("✅ Chaîne enregistrée");
  };
  const delChaine = (id: number) => {
    const used = state.journees.some((j) => j.chaineId === id);
    if (used && !confirm("Cette chaîne a des journées enregistrées. Supprimer quand même ?")) return;
    if (!used && !confirm("Supprimer cette chaîne ?")) return;
    mutate((s) => (s.chaines = s.chaines.filter((c) => c.id !== id)));
    if (currentChaineId === id) setCurrentChaineId(null);
    markSaved();
    toast("🗑 Chaîne supprimée");
  };
  const saveOuv = (data: { nom: string; poste: string; sam: number }) => {
    if (!data.nom) return toast("⚠ Nom requis");
    mutate((s) => {
      const c = findC(s, ouvModal.chaineId);
      if (!c) return;
      if (ouvModal.ouv) {
        const o = c.ouvrieres.find((x) => x.id === ouvModal.ouv!.id);
        if (o) Object.assign(o, data);
      } else {
        c.ouvrieres.push({ id: s.nextOuvId++, ...data });
      }
    });
    markSaved();
    setOuvModal({ open: false, chaineId: 0, ouv: null });
    toast("✅ Ouvrière enregistrée");
  };
  const delOuv = (chId: number, ouvId: number) => {
    if (!confirm("Supprimer cette ouvrière de la chaîne ?")) return;
    mutate((s) => {
      const c = findC(s, chId);
      if (c) c.ouvrieres = c.ouvrieres.filter((o) => o.id !== ouvId);
    });
    markSaved();
    toast("🗑 Supprimée");
  };
  const saveModele = (data: { nom: string; ref: string; client: string; sam: number; qte: number }) => {
    if (!data.nom) return toast("⚠ Nom requis");
    mutate((s) => {
      if (modeleModal.edit) {
        const m = findM(s, modeleModal.edit.id);
        if (m) Object.assign(m, data);
      } else {
        s.modeles.push({ id: uid(), ...data });
      }
    });
    markSaved();
    setModeleModal({ open: false, edit: null });
    toast("✅ Modèle enregistré");
  };
  const delModele = (id: number) => {
    if (state.journees.some((j) => j.modeleId === id))
      return toast("⚠ Modèle utilisé dans des journées — suppression impossible");
    if (!confirm("Supprimer ce modèle ?")) return;
    mutate((s) => (s.modeles = s.modeles.filter((m) => m.id !== id)));
    markSaved();
    toast("🗑 Modèle supprimé");
  };

  const openNewDay = () => {
    if (!state.chaines.length) {
      toast("⚠ Créez d'abord une chaîne");
      return setView("chaines");
    }
    if (!state.modeles.length) {
      toast("⚠ Créez d'abord un modèle");
      return setView("modeles");
    }
    setNewDay(true);
  };

  const printReport = () => printJournee(state, currentDayId!);

  const NAV: { id: View; label: string }[] = [
    { id: "jours", label: "📅 Journées" },
    { id: "chaines", label: "🧵 Chaînes" },
    { id: "modeles", label: "👔 Modèles" },
    { id: "cumul", label: "📊 Cumul production" },
    { id: "histo", label: "🕓 Historique ouvrière" },
  ];

  const journee = currentDayId !== null ? findJ(state, currentDayId) : null;

  return (
    <div className="gp -mx-7 -my-6 min-h-[calc(100vh-60px)]">
      <header className="hdr">
        <span style={{ fontSize: 20 }}>🏭</span>
        <h1>GPAO Production</h1>
        <span className="tag">AGENT DE MÉTHODE — DBS FASHION</span>
        <div className="right">
          <span className="saved">{savedAt}</span>
          <button className="btn green sm" onClick={() => toast("💾 Données enregistrées")}>
            💾 Enregistrer
          </button>
        </div>
      </header>

      <nav className="nav">
        {NAV.map((n) => (
          <div
            key={n.id}
            className={`t${view === n.id || (view === "jour" && n.id === "jours") ? " on" : ""}`}
            onClick={() => go(n.id)}
          >
            {n.label}
          </div>
        ))}
      </nav>

      {view === "jours" && (
        <JoursView
          state={state}
          onOpen={(id) => {
            setCurrentDayId(id);
            setView("jour");
          }}
          onDelete={delDay}
          onNew={openNewDay}
        />
      )}

      {view === "jour" && journee && (
        <JourDetail
          state={state}
          journee={journee}
          onBack={() => setView("jours")}
          onSortie={setSortie}
          onOp={setOp}
          onRet={setRet}
          onObjManuel={setObjManuel}
          onPostesHeure={setPosteHeureOuv}
          onDup={dupDay}
          onToggleCloture={toggleCloture}
          onPrint={printReport}
          onTv={() => setTvOpen(true)}
        />
      )}

      {view === "chaines" && (
        <ChainesView
          state={state}
          currentChaineId={currentChaineId}
          onSelect={setCurrentChaineId}
          onNewChaine={() => setChaineModal({ open: true, edit: null })}
          onEditChaine={(c) => setChaineModal({ open: true, edit: c })}
          onDeleteChaine={delChaine}
          onNewOuv={(chId) => setOuvModal({ open: true, chaineId: chId, ouv: null })}
          onEditOuv={(chId, o) => setOuvModal({ open: true, chaineId: chId, ouv: o })}
          onDeleteOuv={delOuv}
        />
      )}

      {view === "modeles" && (
        <ModelesView
          state={state}
          onNew={() => setModeleModal({ open: true, edit: null })}
          onEdit={(m) => setModeleModal({ open: true, edit: m })}
          onDelete={delModele}
        />
      )}

      {view === "cumul" && <CumulView state={state} onOpenDay={(id) => {
        setCurrentDayId(id);
        setView("jour");
      }} />}

      {view === "histo" && (
        <HistoView
          state={state}
          onOpenDay={(id) => {
            setCurrentDayId(id);
            setView("jour");
          }}
        />
      )}

      {/* modals */}
      {newDay && <NewDayModal state={state} onClose={() => setNewDay(false)} onCreate={createDay} />}
      {chaineModal.open && (
        <ChaineModal edit={chaineModal.edit} onClose={() => setChaineModal({ open: false, edit: null })} onSave={saveChaine} />
      )}
      {modeleModal.open && (
        <ModeleModal edit={modeleModal.edit} onClose={() => setModeleModal({ open: false, edit: null })} onSave={saveModele} />
      )}
      {ouvModal.open && (
        <OuvriereModal
          edit={ouvModal.ouv}
          onClose={() => setOuvModal({ open: false, chaineId: 0, ouv: null })}
          onSave={saveOuv}
        />
      )}

      {posteHeureOuv !== null && journee && (
        <PostesHeureModal
          journee={journee}
          chaine={findC(state, journee.chaineId)}
          ouvId={posteHeureOuv}
          onClose={() => setPosteHeureOuv(null)}
          onSave={savePosteHeure}
          onReset={resetPosteHeure}
        />
      )}

      {tvOpen && journee && <TvMode state={state} journee={journee} onExit={() => setTvOpen(false)} />}

      {toastMsg && <div className="gp-toast show">{toastMsg}</div>}
    </div>
  );
}

/* ═══════════════════ JOURNÉES (liste) ═══════════════════ */
function JoursView({
  state,
  onOpen,
  onDelete,
  onNew,
}: {
  state: GpaoState;
  onOpen: (id: number) => void;
  onDelete: (id: number) => void;
  onNew: () => void;
}) {
  const sorted = state.journees.slice().sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div className="page">
      <h2 className="sec">
        📅 Journées de production <span className="cnt">{state.journees.length}</span>
        <button className="btn primary" style={{ marginLeft: "auto" }} onClick={onNew}>
          ＋ Nouvelle journée
        </button>
      </h2>
      {!sorted.length ? (
        <div className="empty">
          Aucune journée de production.
          <br />
          Cliquez sur <b>＋ Nouvelle journée</b> pour commencer.
          <br />
          <br />
          <span style={{ fontSize: 11 }}>
            Vérifiez d&apos;abord que vos chaînes et modèles sont créés dans les onglets 🧵 et 👔.
          </span>
        </div>
      ) : (
        <div className="grid">
          {sorted.map((j) => {
            const c = findC(state, j.chaineId);
            const m = findM(state, j.modeleId);
            const r = chRend(state, j);
            const pcls = r >= SEUIL_H ? "g" : r >= SEUIL_B ? "a" : "r";
            return (
              <div className="gc" key={j.id} onClick={() => onOpen(j.id)}>
                <button
                  className="btn-ic gdel"
                  title="Supprimer"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(j.id);
                  }}
                >
                  🗑
                </button>
                <div className="gt">📅 {fmtDate(j.date)}</div>
                <div className="gs">
                  {c ? c.nom : "?"} · {m ? `${m.nom} (${m.ref})` : "?"}
                </div>
                <div style={{ marginTop: 8 }}>
                  <span className={`pill ${pcls}`}>Rendement {r}%</span>{" "}
                  {j.cloture ? <span className="pill b">✓ Clôturée</span> : <span className="pill a">En cours</span>}
                </div>
                <div className="grow">
                  <span>
                    Sortie <b>{chSortieTotal(j)}</b>
                  </span>
                  <span>
                    Objectif <b>{chObjJour(state, j)}</b>
                  </span>
                  <span>
                    Effectif <b>{j.effectif}</b>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════ DÉTAIL JOURNÉE (saisie) ═══════════════════ */
function JourDetail({
  state,
  journee: j,
  onBack,
  onSortie,
  onOp,
  onRet,
  onObjManuel,
  onPostesHeure,
  onDup,
  onToggleCloture,
  onPrint,
  onTv,
}: {
  state: GpaoState;
  journee: Journee;
  onBack: () => void;
  onSortie: (col: string, val: string) => void;
  onOp: (ouvId: number, col: string, val: string) => void;
  onRet: (ouvId: number, val: string) => void;
  onObjManuel: (val: string) => void;
  onPostesHeure: (ouvId: number) => void;
  onDup: (id: number) => void;
  onToggleCloture: () => void;
  onPrint: () => void;
  onTv: () => void;
}) {
  const c = findC(state, j.chaineId);
  const m = findM(state, j.modeleId);
  const objH = chObjH(state, j);
  const objJ = chObjJour(state, j);
  const sortie = chSortieTotal(j);
  const r = chRend(state, j);
  const ecart = sortie - objJ;
  const retT = chRetTotal(j);
  const retPctCh = sortie > 0 ? Math.round((retT / sortie) * 1000) / 10 : 0;
  const kc = r >= SEUIL_H ? "g" : r >= SEUIL_B ? "a" : "r";
  const dis = j.cloture;
  const disStyle = dis ? { opacity: 0.55, pointerEvents: "none" as const } : undefined;

  return (
    <div className="page">
      <div className="daybar">
        <button
          className="btn sm"
          style={{ background: "#2a3f6e", color: "#fff", borderColor: "#2a3f6e" }}
          onClick={onBack}
        >
          ← Journées
        </button>
        <div>
          <div className="dbl">Date</div>
          <div className="dbv">{fmtDate(j.date)}</div>
        </div>
        <div>
          <div className="dbl">Chaîne</div>
          <div className="dbv">{c ? c.nom : "?"}</div>
        </div>
        <div>
          <div className="dbl">Modèle</div>
          <div className="dbv">
            {m ? m.nom : "?"}{" "}
            <span style={{ fontSize: 12, color: "#8fa3c8" }}>
              {m ? m.ref : ""} · SAM {m ? m.sam : 0}s
            </span>
          </div>
        </div>
        <div>
          <div className="dbl">Effectif / Heures</div>
          <div className="dbv">
            {j.effectif} <span style={{ fontSize: 12, color: "#8fa3c8" }}>× {j.nbHeures}h</span>
          </div>
        </div>
        <div className="dright">
          <button className="btn amber sm" onClick={onPrint}>
            🖨 Rapport
          </button>
          <button className="btn tv sm" onClick={onTv}>
            📺 Mode TV
          </button>
          <button
            className="btn sm"
            style={{ background: "#5b3fae", color: "#fff", borderColor: "#5b3fae" }}
            onClick={() => onDup(j.id)}
          >
            ⎘ Dupliquer
          </button>
          {j.cloture ? (
            <button className="btn sm" onClick={onToggleCloture}>
              🔓 Réouvrir
            </button>
          ) : (
            <button className="btn green sm" onClick={onToggleCloture}>
              ✓ Clôturer
            </button>
          )}
        </div>
      </div>

      <div className="kpis">
        <div className="kpi">
          <div className="l">Objectif /H ✎</div>
          <div className="v">
            <input
              key={`obj-${j.id}-${j.objManuel ?? "auto"}`}
              type="number"
              step="0.1"
              defaultValue={objH.toFixed(1)}
              onBlur={(e) => onObjManuel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              style={{
                width: 92,
                font: "inherit",
                fontWeight: 800,
                color: "inherit",
                border: "1px dashed #9bb",
                borderRadius: 6,
                textAlign: "center",
                background: "#f8fbff",
              }}
            />
          </div>
          <div className="s">{j.objManuel ? "objectif manuel · vider=auto" : "(eff×3600)/SAM · modifiable"}</div>
        </div>
        <div className="kpi">
          <div className="l">Objectif jour</div>
          <div className="v">{objJ}</div>
          <div className="s">sur {j.nbHeures}h</div>
        </div>
        <div className="kpi">
          <div className="l">Sortie chaîne</div>
          <div className="v" style={{ color: "var(--blue)" }}>
            {sortie}
          </div>
          <div className="s">pièces sorties</div>
        </div>
        <div className={`kpi ${kc}`}>
          <div className="l">Rendement chaîne</div>
          <div className="v" style={{ color: rcol(r) }}>
            {r}%
          </div>
          <div className="s">(sortie × SAM) / capacité</div>
        </div>
        <div className={`kpi ${ecart >= 0 ? "g" : "r"}`}>
          <div className="l">Écart</div>
          <div className="v" style={{ color: ecart >= 0 ? "var(--green)" : "var(--red)" }}>
            {ecart >= 0 ? "+" : ""}
            {ecart}
          </div>
          <div className="s">vs objectif</div>
        </div>
        <div className={`kpi ${retPctCh > SEUIL_RET ? "r" : retPctCh > 2 ? "a" : "g"}`}>
          <div className="l">Retouches</div>
          <div className="v" style={{ color: retcol(retPctCh) }}>
            {retT}
          </div>
          <div className="s">{retPctCh}% de la sortie</div>
        </div>
      </div>

      <div className="twrap">
        <table key={j.id}>
          <thead>
            <tr>
              <th style={{ width: 26 }}>#</th>
              <th style={{ textAlign: "left" }}>Ouvrière / Poste</th>
              <th>
                SAM<small>sec</small>
              </th>
              <th>Obj/H</th>
              {j.cols.map((cn) => (
                <th key={cn}>{cn}</th>
              ))}
              <th>Total</th>
              <th>
                Obj.<small>ajusté</small>
              </th>
              <th>Rend.</th>
              <th>
                Ret.<small>pcs</small>
              </th>
              <th>
                % Ret.<small>/prod</small>
              </th>
            </tr>
          </thead>
          <tbody>
            {/* SORTIE DE CHAÎNE */}
            <tr className="sortie-row">
              <td>🏁</td>
              <td className="lft">
                <div className="opname" style={{ color: "var(--blue)" }}>
                  SORTIE DE CHAÎNE
                </div>
                <div className="oppost">objectif {Math.round(objH)} p/h</div>
              </td>
              <td />
              <td style={{ fontWeight: 800, color: "var(--blue)" }}>{objH.toFixed(1)}</td>
              {j.cols.map((cn) => {
                const sv = j.sortie[cn];
                let scls = "";
                if (typeof sv === "number" && objH > 0) {
                  const p = (sv / objH) * 100;
                  scls = p >= SEUIL_H ? "ok" : p >= SEUIL_B ? "mid" : "bad";
                }
                return (
                  <td key={cn}>
                    <input
                      className={`hcell out ${scls}`}
                      defaultValue={sv === undefined ? "" : sv}
                      placeholder="·"
                      disabled={dis}
                      style={disStyle}
                      onBlur={(e) => onSortie(cn, e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                    />
                  </td>
                );
              })}
              <td style={{ fontWeight: 800, fontSize: 16, color: "var(--blue)" }}>{sortie}</td>
              <td style={{ fontWeight: 700, color: "var(--muted)" }}>{objJ}</td>
              <td>
                <div className="rendcell">
                  <span className="rendpct" style={{ color: rcol(r) }}>
                    {r}%
                  </span>
                  <div className="rbar">
                    <div className="rfill" style={{ width: `${Math.min(r, 100)}%`, background: rcol(r) }} />
                  </div>
                </div>
              </td>
              <td style={{ fontWeight: 800, color: retcol(retPctCh) }}>{retT}</td>
              <td style={{ fontWeight: 800, color: retcol(retPctCh) }}>{retPctCh}%</td>
            </tr>

            {/* ouvrières */}
            {c?.ouvrieres.map((o, k) => {
              const oH = ouvObjH(o);
              const d = j.ops[o.id] || {};
              const prod = ouvProd(j, o.id);
              const oA = Math.round(ouvObjAjuste(j, o));
              const ro = ouvRend(j, o);
              const ret = ouvRet(j, o.id);
              const retP = ouvRetPct(j, o.id);
              const multi = ouvHasMulti(j, o);
              return (
                <tr key={o.id}>
                  <td style={{ color: "#aab", fontSize: 12 }}>{k + 1}</td>
                  <td className="lft">
                    <div className="opname">
                      {o.nom}{" "}
                      <button
                        className="btn-ic"
                        style={{ padding: "0 4px", fontSize: 12 }}
                        title="Postes par heure (si elle change de poste)"
                        onClick={() => onPostesHeure(o.id)}
                      >
                        ⚙
                      </button>
                    </div>
                    <div className="oppost">
                      {o.poste}
                      {multi && (
                        <>
                          {" · "}
                          <span style={{ color: "var(--blue)", fontWeight: 700 }}>multi-postes</span>
                        </>
                      )}
                    </div>
                  </td>
                  <td style={{ fontWeight: 600 }}>{o.sam}</td>
                  <td style={{ fontWeight: 700, color: "var(--blue)" }}>{oH.toFixed(1)}</td>
                  {j.cols.map((cn) => {
                    const det = cellDetail(j, o.id, cn);
                    if (det && det.length) {
                      const qH = det.reduce((t, x) => t + (+x.qte || 0), 0);
                      const eH = det.reduce((t, x) => t + (+x.qte || 0) * (+x.sam || 0), 0);
                      const ppd = (eH / 3600) * 100;
                      const cls = ppd >= SEUIL_H ? "ok" : ppd >= SEUIL_B ? "mid" : "bad";
                      const lab = det.map((x) => `${x.poste || "op"} ${x.qte}p@${x.sam}s`).join(" + ");
                      return (
                        <td key={cn}>
                          <input
                            key="multi"
                            className={`hcell ${cls}`}
                            value={qH}
                            readOnly
                            title={lab}
                            disabled={dis}
                            style={{ boxShadow: "inset 0 0 0 2px #5b3fae", borderRadius: 4, cursor: "pointer" }}
                            onClick={() => onPostesHeure(o.id)}
                          />
                        </td>
                      );
                    }
                    const v = d[cn];
                    const samC = ouvSamAt(j, o, cn);
                    const ohc = samC > 0 ? 3600 / samC : 0;
                    const over = !!j.opsSam?.[o.id]?.[cn];
                    let cls = "";
                    if (v === "RI" || v === "ABS") cls = "special";
                    else if (typeof v === "number" && ohc > 0) {
                      const pp = (v / ohc) * 100;
                      cls = pp >= SEUIL_H ? "ok" : pp >= SEUIL_B ? "mid" : "bad";
                    }
                    const tt = over ? `Poste: ${j.opsPoste?.[o.id]?.[cn] || "autre"} - SAM ${samC}s` : undefined;
                    return (
                      <td key={cn}>
                        <input
                          key={`single-${v ?? ""}`}
                          className={`hcell ${cls}`}
                          defaultValue={v === undefined ? "" : v}
                          placeholder="·"
                          title={tt}
                          disabled={dis}
                          style={{
                            ...(over ? { boxShadow: "inset 0 0 0 2px var(--blue)", borderRadius: 4 } : {}),
                            ...(disStyle ?? {}),
                          }}
                          onBlur={(e) => onOp(o.id, cn, e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                        />
                      </td>
                    );
                  })}
                  <td style={{ fontWeight: 800, color: "var(--navy)" }}>{prod}</td>
                  <td style={{ color: "var(--muted)", fontWeight: 600 }}>{oA}</td>
                  <td>
                    {ro !== null ? (
                      <div className="rendcell">
                        <span className={`rendpct ${rcls(ro)}`}>{ro}%</span>
                        <div className="rbar">
                          <div className={`rfill ${rbarCls(ro)}`} style={{ width: `${Math.min(ro, 100)}%` }} />
                        </div>
                      </div>
                    ) : (
                      <span style={{ color: "#ccc" }}>—</span>
                    )}
                  </td>
                  <td>
                    <input
                      className="hcell ret"
                      defaultValue={ret || ""}
                      placeholder="·"
                      disabled={dis}
                      style={disStyle}
                      onBlur={(e) => onRet(o.id, e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                    />
                  </td>
                  <td style={{ fontWeight: 800, color: retcol(retP) }}>{retP === null ? "—" : `${retP}%`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="note" style={{ marginTop: 10 }}>
        💡 <b>RI</b>/<b>ABS</b> dans une cellule = heure exclue de l&apos;objectif ajusté. Le bouton <b>⚙</b> d&apos;une
        ouvrière ouvre la saisie <b>multi-postes / poste par heure</b> (rendement = temps standard gagné ÷ temps
        travaillé). La colonne <b>Ret.</b> = pièces retouchées dans la journée ; <b>% Ret.</b> = retouches ÷ production
        (alerte rouge &gt; {SEUIL_RET}%). L&apos;objectif /H est modifiable directement. Sauvegarde automatique à chaque
        saisie.
      </div>
    </div>
  );
}

/* ═══════════════════ CHAÎNES ═══════════════════ */
function ChainesView({
  state,
  currentChaineId,
  onSelect,
  onNewChaine,
  onEditChaine,
  onDeleteChaine,
  onNewOuv,
  onEditOuv,
  onDeleteOuv,
}: {
  state: GpaoState;
  currentChaineId: number | null;
  onSelect: (id: number) => void;
  onNewChaine: () => void;
  onEditChaine: (c: Chaine) => void;
  onDeleteChaine: (id: number) => void;
  onNewOuv: (chId: number) => void;
  onEditOuv: (chId: number, o: Ouvriere) => void;
  onDeleteOuv: (chId: number, ouvId: number) => void;
}) {
  const c = currentChaineId !== null ? findC(state, currentChaineId) : null;
  return (
    <div className="page">
      <h2 className="sec">
        🧵 Chaînes de production <span className="cnt">{state.chaines.length}</span>
        <button className="btn primary" style={{ marginLeft: "auto" }} onClick={onNewChaine}>
          ＋ Nouvelle chaîne
        </button>
      </h2>
      {!state.chaines.length ? (
        <div className="empty">Aucune chaîne. Créez-en une.</div>
      ) : (
        <div className="grid">
          {state.chaines.map((ch) => {
            const nbJ = state.journees.filter((j) => j.chaineId === ch.id).length;
            return (
              <div
                className="gc"
                key={ch.id}
                style={currentChaineId === ch.id ? { borderColor: "var(--blue)" } : undefined}
                onClick={() => onSelect(ch.id)}
              >
                <button
                  className="btn-ic gdel"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteChaine(ch.id);
                  }}
                >
                  🗑
                </button>
                <div className="gt">🧵 {ch.nom}</div>
                <div className="gs">{ch.chef ? `Chef : ${ch.chef}` : "—"}</div>
                <div className="grow">
                  <span>
                    Ouvrières <b>{ch.ouvrieres.length}</b>
                  </span>
                  <span>
                    Journées <b>{nbJ}</b>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {c && (
        <div style={{ marginTop: 18 }}>
          <h2 className="sec">
            👥 Ouvrières — {c.nom} <span className="cnt">{c.ouvrieres.length}</span>
            <button className="btn sm" style={{ marginLeft: "auto" }} onClick={() => onEditChaine(c)}>
              ✏ Modifier chaîne
            </button>
            <button className="btn primary sm" onClick={() => onNewOuv(c.id)}>
              ＋ Ouvrière
            </button>
          </h2>
          <div className="twrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 26 }}>#</th>
                  <th style={{ textAlign: "left" }}>Nom</th>
                  <th style={{ textAlign: "left" }}>Poste / Opération</th>
                  <th>SAM (s)</th>
                  <th>Obj/H = 3600/SAM</th>
                  <th style={{ width: 80 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {c.ouvrieres.map((o, i) => (
                  <tr key={o.id}>
                    <td style={{ color: "#aab" }}>{i + 1}</td>
                    <td className="lft" style={{ fontWeight: 600 }}>
                      {o.nom}
                    </td>
                    <td className="lft">{o.poste}</td>
                    <td style={{ fontWeight: 600 }}>{o.sam}</td>
                    <td style={{ fontWeight: 700, color: "var(--blue)" }}>{ouvObjH(o).toFixed(1)} p/h</td>
                    <td>
                      <button className="btn-ic" onClick={() => onEditOuv(c.id, o)}>
                        ✏
                      </button>
                      <button className="btn-ic" onClick={() => onDeleteOuv(c.id, o.id)}>
                        🗑
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════ MODÈLES ═══════════════════ */
function ModelesView({
  state,
  onNew,
  onEdit,
  onDelete,
}: {
  state: GpaoState;
  onNew: () => void;
  onEdit: (m: Modele) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <div className="page">
      <h2 className="sec">
        👔 Modèles / Articles <span className="cnt">{state.modeles.length}</span>
        <button className="btn primary" style={{ marginLeft: "auto" }} onClick={onNew}>
          ＋ Nouveau modèle
        </button>
      </h2>
      {!state.modeles.length ? (
        <div className="empty">Aucun modèle. Créez votre premier modèle (SAM total + quantité commandée).</div>
      ) : (
        <div className="grid">
          {state.modeles.map((m) => {
            const prod = cumulModele(state, m.id);
            const pct = m.qte > 0 ? Math.min(Math.round((prod / m.qte) * 100), 100) : 0;
            return (
              <div className="gc" key={m.id} onClick={() => onEdit(m)}>
                <button
                  className="btn-ic gdel"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(m.id);
                  }}
                >
                  🗑
                </button>
                <div className="gt">👔 {m.nom}</div>
                <div className="gs">
                  Réf <b>{m.ref}</b>
                  {m.client ? ` · ${m.client}` : ""}
                </div>
                <div className="grow">
                  <span>
                    SAM <b>{m.sam}s</b>
                  </span>
                  <span>
                    Commande <b>{m.qte}</b>
                  </span>
                  <span>
                    Produit <b>{prod}</b>
                  </span>
                </div>
                <div style={{ marginTop: 8 }}>
                  <div className="prog">
                    <div className="progf" style={{ width: `${pct}%` }} />
                  </div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>{pct}% de la commande réalisée</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════ CUMUL ═══════════════════ */
function CumulView({ state, onOpenDay }: { state: GpaoState; onOpenDay: (id: number) => void }) {
  return (
    <div className="page">
      <h2 className="sec">📊 Cumul de production par modèle</h2>
      {!state.modeles.length ? (
        <div className="empty">Aucun modèle créé.</div>
      ) : (
        state.modeles.map((m) => {
          const jours = state.journees
            .filter((j) => j.modeleId === m.id)
            .sort((a, b) => a.date.localeCompare(b.date));
          const prod = cumulModele(state, m.id);
          const pct = m.qte > 0 ? Math.round((prod / m.qte) * 100) : 0;
          const reste = Math.max(m.qte - prod, 0);
          const avgJ = jours.length ? Math.round(prod / jours.length) : 0;
          const joursRestants = avgJ > 0 ? Math.ceil(reste / avgJ) : null;
          let run = 0;
          return (
            <div
              key={m.id}
              style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 13, padding: 18, marginBottom: 16 }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
                <div style={{ fontWeight: 800, fontSize: 15, color: "var(--navy)" }}>
                  👔 {m.nom} — {m.ref}
                </div>
                {m.client && <span className="pill b">{m.client}</span>}
                <span className={`pill ${pct >= 100 ? "g" : pct >= 50 ? "b" : "a"}`}>{pct}%</span>
              </div>
              <div className="prog" style={{ height: 16, marginBottom: 8 }}>
                <div
                  className="progf"
                  style={{ width: `${Math.min(pct, 100)}%`, background: pct >= 100 ? "var(--green)" : "var(--blue)" }}
                />
              </div>
              <div style={{ display: "flex", gap: 24, flexWrap: "wrap", fontSize: 13, marginBottom: 12 }}>
                <span>
                  Commande : <b>{m.qte}</b>
                </span>
                <span>
                  Produit cumulé : <b style={{ color: "var(--blue)" }}>{prod}</b>
                </span>
                <span>
                  Reste : <b style={{ color: reste > 0 ? "var(--red)" : "var(--green)" }}>{reste}</b>
                </span>
                <span>
                  Moyenne/jour : <b>{avgJ}</b>
                </span>
                {joursRestants !== null && reste > 0 && (
                  <span>
                    Estimation : <b>{joursRestants} jour(s) restant(s)</b>
                  </span>
                )}
              </div>
              {jours.length ? (
                <div className="twrap">
                  <table>
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left" }}>Date</th>
                        <th>Chaîne</th>
                        <th>Effectif</th>
                        <th>Objectif jour</th>
                        <th>Sortie</th>
                        <th>Écart</th>
                        <th>Rendement</th>
                        <th>Cumul</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {jours.map((j) => {
                        const cc = findC(state, j.chaineId);
                        const s = chSortieTotal(j);
                        const oj = chObjJour(state, j);
                        const rr = chRend(state, j);
                        const e = s - oj;
                        run += s;
                        return (
                          <tr key={j.id}>
                            <td className="lft">
                              {j.date}
                              {j.cloture && (
                                <span className="pill b" style={{ fontSize: 9 }}>
                                  ✓
                                </span>
                              )}
                            </td>
                            <td>{cc ? cc.nom : "?"}</td>
                            <td>{j.effectif}</td>
                            <td>{oj}</td>
                            <td style={{ fontWeight: 800, color: "var(--blue)" }}>{s}</td>
                            <td style={{ fontWeight: 700, color: e >= 0 ? "var(--green)" : "var(--red)" }}>
                              {e >= 0 ? "+" : ""}
                              {e}
                            </td>
                            <td>
                              <span className="rendpct" style={{ color: rcol(rr) }}>
                                {rr}%
                              </span>
                            </td>
                            <td style={{ fontWeight: 800 }}>{run}</td>
                            <td>
                              <button className="btn sm" onClick={() => onOpenDay(j.id)}>
                                Ouvrir
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: "var(--muted)" }}>Aucune journée de production pour ce modèle.</div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

/* ═══════════════════ RAPPORT JOURNALIER (impression) ═══════════════════ */
function printJournee(state: GpaoState, dayId: number) {
  const j = findJ(state, dayId);
  if (!j) return;
  const c = findC(state, j.chaineId);
  const m = findM(state, j.modeleId);
  const objH = chObjH(state, j);
  const objJ = chObjJour(state, j);
  const sortie = chSortieTotal(j);
  const r = chRend(state, j);
  const ecart = sortie - objJ;
  const retT = chRetTotal(j);
  const retPctCh = sortie > 0 ? Math.round((retT / sortie) * 1000) / 10 : 0;
  const esc = (s: unknown) =>
    String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  let h = `<h1>RAPPORT JOURNALIER DE PRODUCTION</h1>`;
  h += `<div class="psub">DBS Fashion — Suivi de rendement chaîne · Document agent de méthode</div>`;
  h += `<div class="pmeta"><span><b>Date :</b> ${fmtDate(j.date)}</span><span><b>Chaîne :</b> ${esc(
    c?.nom ?? "?",
  )}${c?.chef ? ` (${esc(c.chef)})` : ""}</span><span><b>Modèle :</b> ${esc(m?.nom ?? "?")} — Réf ${esc(
    m?.ref ?? "",
  )}</span><span><b>Client :</b> ${esc(m?.client ?? "")}</span><span><b>SAM :</b> ${m?.sam ?? 0} s</span><span><b>Effectif :</b> ${
    j.effectif
  }</span><span><b>Heures :</b> ${j.nbHeures}</span></div>`;
  h += `<table><thead><tr><th>Objectif général /H</th><th>Objectif jour</th><th>Sortie chaîne</th><th>Écart</th><th>RENDEMENT CHAÎNE</th><th>Retouches</th></tr></thead><tbody><tr><td>${objH.toFixed(
    1,
  )} p/h</td><td>${objJ}</td><td><b>${sortie}</b></td><td>${ecart >= 0 ? "+" : ""}${ecart}</td><td style="font-size:14px"><b>${r} %</b></td><td><b>${retT}</b> (${retPctCh}%)</td></tr></tbody></table>`;
  h += `<table><thead><tr><th>Sortie / heure</th>${j.cols.map((x) => `<th>${esc(x)}</th>`).join("")}<th>Total</th></tr></thead><tbody><tr><td><b>Pièces sorties</b></td>${j.cols
    .map((x) => `<td>${j.sortie[x] === undefined ? "—" : j.sortie[x]}</td>`)
    .join("")}<td><b>${sortie}</b></td></tr></tbody></table>`;
  h += `<table><thead><tr><th>N°</th><th style="text-align:left">Ouvrière</th><th style="text-align:left">Poste</th><th>SAM</th><th>Obj/H</th>${j.cols
    .map((x) => `<th>${esc(x)}</th>`)
    .join("")}<th>Total</th><th>Obj.aj.</th><th>Rend.%</th><th>Ret.</th><th>%Ret.</th></tr></thead><tbody>`;
  c?.ouvrieres.forEach((o, k) => {
    const d = j.ops[o.id] || {};
    const ro = ouvRend(j, o);
    const retP = ouvRetPct(j, o.id);
    h += `<tr><td>${k + 1}</td><td style="text-align:left">${esc(o.nom)}${
      ouvHasMulti(j, o) ? " *" : ""
    }</td><td style="text-align:left">${esc(o.poste)}</td><td>${o.sam}</td><td>${ouvObjH(o).toFixed(1)}</td>${j.cols
      .map((x) => {
        const det = cellDetail(j, o.id, x);
        if (det && det.length) return `<td>${ouvCellQte(j, o.id, x)}*</td>`;
        return `<td>${d[x] === undefined ? "—" : d[x]}</td>`;
      })
      .join("")}<td><b>${ouvProd(j, o.id)}</b></td><td>${Math.round(ouvObjAjuste(j, o))}</td><td><b>${
      ro === null ? "—" : ro + "%"
    }</b></td><td>${ouvRet(j, o.id) || "—"}</td><td>${retP === null ? "—" : retP + "%"}</td></tr>`;
  });
  h += `</tbody></table>`;
  h += `<div class="psig"><div>Agent de méthode</div><div>Chef de chaîne</div><div>Direction production</div></div>`;
  h += `<div style="text-align:right;font-size:9px;color:#666;margin-top:8px">Imprimé le ${new Date().toLocaleString(
    "fr-FR",
  )} — GPAO DBS Fashion</div>`;

  const w = window.open("", "_blank", "width=1100,height=800");
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Rapport journalier</title><style>
    body{font-family:'Segoe UI',Arial,sans-serif;padding:10mm;font-size:11px;color:#000}
    h1{font-size:17px;text-align:center;margin:0 0 4px}
    .psub{text-align:center;font-size:11px;color:#444;margin-bottom:10px}
    .pmeta{display:flex;justify-content:space-between;border:1.5px solid #000;padding:6px 12px;margin-bottom:8px;font-size:11px;flex-wrap:wrap;gap:8px}
    table{width:100%;border-collapse:collapse;font-size:10px;margin-bottom:8px}
    th,td{border:1px solid #555;padding:3px 4px;text-align:center}th{background:#e6e6e6;font-size:9px}
    .psig{display:flex;justify-content:space-between;margin-top:18px;font-size:11px}
    .psig div{width:30%;border-top:1px solid #000;padding-top:4px;text-align:center}
    @page{size:A4 landscape;margin:8mm}
  </style></head><body>${h}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 250);
}
