"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { relireJournee, saisirProduction } from "@/lib/actions/saisie-gpao";
import { cleOperation } from "@/lib/domain/atelier";
import * as rd from "@/lib/domain/rendement";
import * as sg from "@/lib/domain/saisie-gpao";
import type { JourneeTablette } from "@/lib/services/saisie-gpao";
import {
  SEUIL_B,
  SEUIL_H,
  SEUIL_RET,
  alertesRendement,
  chObjH,
  chObjJour,
  chRend,
  chRetTotal,
  chSortieTotal,
  ouvProd,
  ouvRend,
  ouvRet,
  ouvRetPct,
  ouvSamAt,
  rcol,
  retcol,
  type GpaoState,
  type Journee,
} from "@/app/(app)/gpao_prod/store";

/* Saisie de production sur tablette, en chaîne.
 *
 * Chaque case tapée part tout de suite au serveur, case par case (voir
 * lib/domain/saisie-gpao) : le bureau voit la production en direct, sans rien
 * recopier. Si le Wi-Fi de l'atelier décroche, les saisies attendent sur la
 * tablette (même après fermeture de l'onglet) et partent au retour du réseau. */

type Row = JourneeTablette["journee"];
type Ligne = JourneeTablette["roster"][number];
type Onglet = string; // "H1"… | "ret" | "arrets" | "recap"
type Feuille = { type: "poste"; ouvId: number; col: string } | { type: "arret"; ouvId: number } | null;

const nb = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
const fmtCase = (v: sg.Cellule | number | undefined | null) => (v === undefined || v === null ? "" : String(v).replace(".", ","));
const fmtDuree = (sec: number) => (sec < 60 ? `${sec} s` : `${Math.round(sec / 60)} min`);
const pctTone = (p: number | null) => (p === null ? "text-slate-400" : p >= SEUIL_H ? "text-emerald-600" : p >= SEUIL_B ? "text-amber-600" : "text-red-600");
const pctBg = (p: number | null) => (p === null ? "" : p >= SEUIL_H ? "bg-emerald-50" : p >= SEUIL_B ? "bg-amber-50" : "bg-red-50");

const absenteJour = sg.absenteJour;
/** Effectif de la journée : celui qu'elle a figé (il suit les retraits). */
const rosterDe = (j: Row, repli: Ligne[]) => (j.ouvrieres?.length ? j.ouvrieres : repli);

const matricesDe = (j: Row): sg.Matrices => ({
  cols: j.cols,
  cloture: j.cloture,
  sortie: j.sortie ?? {},
  ops: j.ops ?? {},
  ret: j.ret ?? {},
  opsSam: j.opsSam ?? {},
  opsPoste: j.opsPoste ?? {},
  opsDetail: j.opsDetail ?? {},
  arrets: j.arrets ?? {},
});

const cleFile = (id: number) => `gpao-saisies-${id}`;
function lireFile(id: number): sg.Saisie[][] {
  try {
    const v = JSON.parse(localStorage.getItem(cleFile(id)) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function ecrireFile(id: number, f: sg.Saisie[][]) {
  try {
    if (f.length) localStorage.setItem(cleFile(id), JSON.stringify(f));
    else localStorage.removeItem(cleFile(id));
  } catch {
    /* navigation privée : la file reste en mémoire */
  }
}

export function SaisieTablette({
  utilisateur,
  initial,
  operations,
  seuilAlerte,
}: {
  utilisateur: string;
  initial: JourneeTablette;
  operations: { nom: string; sam: number }[];
  seuilAlerte: number;
}) {
  const { chaine, modele } = initial;
  const id = initial.journee.id;
  const [j, setJ] = useState<Row>(initial.journee);
  /* La dernière version connue, lisible tout de suite (deux gestes rapprochés
   * ne doivent pas partir d'un écran pas encore redessiné). */
  const jRef = useRef<Row>(initial.journee);
  const majJ = useCallback((nv: Row) => {
    jRef.current = nv;
    setJ(nv);
  }, []);
  const repli = initial.roster;
  const roster = useMemo(() => rosterDe(j, repli), [j, repli]);

  /** Applique des saisies à une journée (même règle que le serveur). */
  const appliquer = useCallback(
    (base: Row, saisies: sg.Saisie[]): { ok: true; row: Row } | { ok: false; error: string } => {
      const liste = rosterDe(base, repli);
      let m = matricesDe(base);
      for (const s of saisies) {
        const r = sg.appliquerSaisie(m, liste, s);
        if (!r.ok) return r;
        m = r.matrices;
      }
      const retires = new Set(saisies.flatMap((s) => (s.type === "retirerOuvriere" ? [s.ouvId] : [])));
      return { ok: true, row: { ...base, ...m, ouvrieres: retires.size ? liste.filter((o) => !retires.has(o.id)) : base.ouvrieres } };
    },
    [repli],
  );
  const [onglet, setOnglet] = useState<Onglet>(() => sg.heureASaisir(matricesDe(initial.journee), rosterDe(initial.journee, initial.roster)));
  const [feuille, setFeuille] = useState<Feuille>(null);
  const [attente, setAttente] = useState(0);
  const [horsLigne, setHorsLigne] = useState(false);
  const [enregistreA, setEnregistreA] = useState("");

  /* ─────────── envoi : file d'attente, dans l'ordre, jamais perdue ─────────── */
  const file = useRef<sg.Saisie[][]>([]);
  const enCours = useRef(false);
  const relance = useRef<() => void>(() => {});

  const pomper = useCallback(async () => {
    if (enCours.current) return;
    enCours.current = true;
    while (file.current.length) {
      const lot = file.current[0];
      let res: Awaited<ReturnType<typeof saisirProduction>>;
      try {
        res = await saisirProduction(id, lot);
      } catch {
        // Réseau coupé : on garde tout et on réessaie.
        setHorsLigne(true);
        enCours.current = false;
        setTimeout(() => relance.current(), 5000);
        return;
      }
      setHorsLigne(false);
      file.current.shift();
      ecrireFile(id, file.current);
      setAttente(file.current.length);
      if (!res.ok) {
        toast.error(res.error);
        const r = await relireJournee(id).catch(() => null);
        if (r?.ok && !file.current.length) majJ(r.journee);
        continue;
      }
      setEnregistreA(new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
      if (!file.current.length) majJ(res.journee);
    }
    enCours.current = false;
  }, [id, majJ]);
  useEffect(() => {
    relance.current = () => void pomper();
  }, [pomper]);

  // Saisies restées sur la tablette (réseau coupé, onglet fermé) : on les rejoue.
  useEffect(() => {
    const reste = lireFile(id);
    if (!reste.length) return;
    file.current = reste;
    let row = jRef.current;
    for (const lot of reste) {
      const r = appliquer(row, lot);
      if (r.ok) row = r.row;
    }
    majJ(row);
    setAttente(reste.length);
    void pomper();
  }, [id, appliquer, pomper, majJ]);

  // Ce que le bureau modifie apparaît ici aussi.
  useEffect(() => {
    const t = setInterval(() => {
      if (file.current.length || enCours.current || document.hidden) return;
      void relireJournee(id)
        .then((r) => {
          if (r.ok && !file.current.length && !enCours.current) majJ(r.journee);
        })
        .catch(() => setHorsLigne(true));
    }, 15000);
    return () => clearInterval(t);
  }, [id, majJ]);

  /** Applique tout de suite à l'écran (même règle que le serveur), puis envoie. */
  const saisir = (...saisies: sg.Saisie[]): boolean => {
    if (!saisies.length) return false;
    const r = appliquer(jRef.current, saisies);
    if (!r.ok) {
      toast.error(r.error);
      return false;
    }
    majJ(r.row);
    file.current.push(saisies);
    ecrireFile(id, file.current);
    setAttente(file.current.length);
    void pomper();
    return true;
  };

  /* ─────────── calculs : les mêmes que l'écran GPAO du bureau ─────────── */
  const jj: Journee = useMemo(() => ({ ...j, objManuel: j.objManuel ?? undefined, ouvrieres: roster }) as Journee, [j, roster]);
  const etat: GpaoState = useMemo(
    () => ({
      modeles: [{ ...modele, qte: 0, archive: false, estimEff: 0 }],
      chaines: [{ id: chaine.id, nom: chaine.nom, chef: chaine.chef, effectif: j.effectif, ouvrieres: roster }],
      journees: [jj],
      personnes: [],
      operations: [],
      reglages: { seuilAlerte, tvRotSec: 12 },
      nextOuvId: 0,
    }),
    [modele, chaine, roster, jj, j.effectif, seuilAlerte],
  );
  const objH = chObjH(etat, jj);
  const objJour = chObjJour(etat, jj);
  const sortieTotale = chSortieTotal(jj);
  const rendChaine = chRend(etat, jj);
  const retTotal = chRetTotal(jj);
  const alertes = alertesRendement(etat, jj, seuilAlerte);
  const m = matricesDe(j);
  const ferme = j.cloture;

  /* navigation au clavier : Entrée passe à la case suivante */
  const cases = useRef<(HTMLInputElement | null)[]>([]);
  const poserCase = (i: number, el: HTMLInputElement | null) => {
    cases.current[i] = el;
  };
  const suivante = (i: number) => {
    const n = cases.current[i + 1];
    if (n) n.focus();
    else (document.activeElement as HTMLElement | null)?.blur();
  };

  const heures = j.cols;
  const estHeure = heures.includes(onglet);

  return (
    <div className="min-h-screen bg-slate-100 pb-24 text-slate-900">
      {/* ── en-tête ── */}
      <div className="sticky top-0 z-20 border-b bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2">
          <Link href={`/m/gpao?date=${j.date}`} className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold">
            ← Chaînes
          </Link>
          <div className="min-w-0">
            <div className="text-xl font-black leading-tight">
              {chaine.nom} <span className="font-semibold text-slate-500">· {modele.nom}</span>
            </div>
            <div className="text-xs text-slate-500">
              {new Date(`${j.date}T00:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })} · {j.effectif} présentes × {j.nbHeures} h · SAM{" "}
              {modele.sam}s · {utilisateur}
            </div>
          </div>
          <div className="ml-auto">
            {horsLigne ? (
              <span className="rounded-full bg-red-100 px-3 py-1.5 text-sm font-bold text-red-800">⚠ Hors ligne · {attente} en attente</span>
            ) : attente > 0 ? (
              <span className="rounded-full bg-amber-100 px-3 py-1.5 text-sm font-bold text-amber-800">⏳ Envoi… ({attente})</span>
            ) : (
              <span className="rounded-full bg-emerald-100 px-3 py-1.5 text-sm font-bold text-emerald-800">✓ Enregistré {enregistreA}</span>
            )}
          </div>
        </div>
        {/* indicateurs */}
        <div className="mx-auto grid max-w-6xl grid-cols-5 gap-2 px-4 pb-2 text-center">
          <Kpi l="Objectif / h" v={nb.format(objH)} />
          <Kpi l="Sortie / objectif" v={`${sortieTotale} / ${objJour}`} />
          <Kpi l="Rendement chaîne" v={`${rendChaine} %`} style={{ color: rcol(rendChaine) }} />
          <Kpi l="Retouches" v={`${retTotal}`} sub={sortieTotale ? `${nb.format((retTotal / sortieTotale) * 100)} %` : ""} />
          <Kpi l={`Sous ${seuilAlerte} %`} v={String(alertes.length)} style={{ color: alertes.length ? "#e04545" : undefined }} />
        </div>
        {/* onglets */}
        <div className="mx-auto flex max-w-6xl gap-1.5 overflow-x-auto px-4 pb-2">
          {heures.map((col) => {
            const a = sg.avancementHeure(m, roster, col);
            const cls =
              onglet === col
                ? "bg-slate-900 text-white"
                : a.complete
                  ? "bg-emerald-100 text-emerald-900"
                  : a.faites || a.sortie
                    ? "bg-amber-100 text-amber-900"
                    : "bg-white text-slate-700";
            return (
              <button key={col} onClick={() => setOnglet(col)} className={`shrink-0 rounded-xl px-4 py-2 text-base font-extrabold ${cls}`}>
                {col}
                <span className="ml-1 text-xs font-semibold opacity-80">{a.complete ? "✓" : `${a.faites}/${a.total}`}</span>
              </button>
            );
          })}
          <span className="mx-1 w-px shrink-0 bg-slate-200" />
          {(
            [
              ["equipe", "Présence"],
              ["ret", "Retouches"],
              ["arrets", "Arrêts"],
              ["recap", "Récap"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} onClick={() => setOnglet(k)} className={`shrink-0 rounded-xl px-4 py-2 text-base font-bold ${onglet === k ? "bg-slate-900 text-white" : "bg-white"}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 pt-3">
        {ferme && <div className="mb-3 rounded-xl bg-slate-200 px-4 py-3 font-semibold">Journée clôturée : consultation seule (réouverture au bureau).</div>}
        {!(modele.sam > 0) && !j.objManuel && (
          <div className="mb-3 rounded-xl bg-amber-100 px-4 py-3 text-amber-900">
            Le SAM du modèle « {modele.nom} » n&apos;est pas renseigné : l&apos;objectif et le rendement de la chaîne restent à 0. Renseignez-le au
            bureau (GPAO → Modèles). La saisie, elle, est bien enregistrée.
          </div>
        )}

        {onglet === "equipe" && (
          <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
            <div className="border-b px-4 py-2 text-sm text-slate-500">
              Présentes aujourd&apos;hui : {roster.filter((o) => !absenteJour(m, j.cols, o.id)).length} / {roster.length} (effectif déclaré {j.effectif}).
              « Absente » marque ABS sur toutes ses heures vides ; « Retirer » l&apos;enlève de cette journée seulement (pas de la chaîne).
            </div>
            {roster.map((o) => {
              const absente = absenteJour(m, j.cols, o.id);
              return (
                <div key={o.id} className={`flex items-center gap-2 border-b px-4 py-2 last:border-0 ${absente ? "bg-slate-50 text-slate-400" : ""}`}>
                  <div className="min-w-0 flex-1">
                    <div className="font-bold">{o.nom}</div>
                    <div className="text-xs">{o.poste}</div>
                  </div>
                  {!ferme && (
                    <>
                      <button
                        onClick={() =>
                          absente
                            ? saisir(...j.cols.filter((c) => m.ops[o.id]?.[c] === "ABS").map((col): sg.Saisie => ({ type: "op", ouvId: o.id, col, valeur: null })))
                            : saisir(...j.cols.filter((c) => !sg.caseFaite(m, o.id, c)).map((col): sg.Saisie => ({ type: "op", ouvId: o.id, col, valeur: "ABS" })))
                        }
                        className={`w-32 rounded-xl py-3 text-sm font-extrabold ${absente ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-700"}`}
                      >
                        {absente ? "Présente" : "Absente"}
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Retirer ${o.nom} de cette journée (sa saisie du jour part avec elle) ?`)) saisir({ type: "retirerOuvriere", ouvId: o.id });
                        }}
                        className="rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold text-red-700"
                      >
                        Retirer
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {estHeure && (
          <VueHeure
            col={onglet}
            j={jj}
            m={m}
            roster={roster}
            objH={objH}
            ferme={ferme}
            poserCase={poserCase}
            suivante={suivante}
            saisir={saisir}
            ouvrirPoste={(ouvId) => setFeuille({ type: "poste", ouvId, col: onglet })}
            heureSuivante={() => {
              const i = heures.indexOf(onglet);
              if (i < heures.length - 1) setOnglet(heures[i + 1]);
            }}
          />
        )}

        {onglet === "ret" && (
          <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
            <div className="border-b px-4 py-2 text-sm text-slate-500">Pièces retouchées dans la journée, par ouvrière.</div>
            {roster.map((o, i) => {
              const p = ouvRetPct(jj, o.id);
              return (
                <div key={o.id} className="flex items-center gap-3 border-b px-4 py-2 last:border-0">
                  <div className="min-w-0 flex-1">
                    <div className="font-bold">{o.nom}</div>
                    <div className="text-xs text-slate-500">
                      {o.poste} · production {ouvProd(jj, o.id)} pcs
                    </div>
                  </div>
                  <CaseSaisie
                    valeur={m.ret[o.id]}
                    disabled={ferme}
                    inputRef={(el) => (cases.current[i] = el)}
                    onEntree={() => suivante(i)}
                    onValider={(t) => {
                      const r = sg.lireCellule(t);
                      if (!r.ok || r.valeur === "RI" || r.valeur === "ABS") return void toast.error("Nombre de retouches invalide");
                      saisir({ type: "ret", ouvId: o.id, valeur: r.valeur });
                    }}
                  />
                  <div className="w-16 text-right text-lg font-extrabold" style={{ color: retcol(p) }}>
                    {p === null ? "—" : `${nb.format(p)} %`}
                  </div>
                </div>
              );
            })}
            <div className="px-4 py-2 text-xs text-slate-500">Alerte au-dessus de {SEUIL_RET} % de la production.</div>
          </div>
        )}

        {onglet === "arrets" && (
          <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
            <div className="border-b px-4 py-2 text-sm text-slate-500">Arrêts et temps non productifs (motif + durée) — ils justifient une baisse de rendement.</div>
            {roster.map((o) => {
              const liste = m.arrets[o.id] ?? [];
              return (
                <div key={o.id} className="flex flex-wrap items-center gap-2 border-b px-4 py-2 last:border-0">
                  <div className="min-w-[180px] flex-1">
                    <div className="font-bold">{o.nom}</div>
                    <div className="text-xs text-slate-500">{o.poste}</div>
                  </div>
                  {liste.map((a, k) => (
                    <span key={k} className="flex items-center gap-1 rounded-full bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-800">
                      {a.motif} · {fmtDuree(a.secondes)}
                      {!ferme && (
                        <button onClick={() => saisir({ type: "arretRetrait", ouvId: o.id, index: k })} className="ml-1 px-1 text-red-400">
                          ✕
                        </button>
                      )}
                    </span>
                  ))}
                  {!ferme && (
                    <button onClick={() => setFeuille({ type: "arret", ouvId: o.id })} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white">
                      ＋ Arrêt
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {onglet === "recap" && (
          <Recap
            j={jj}
            m={m}
            roster={roster}
            objH={objH}
            alertes={alertes.map((a) => `${a.ouv.nom} (${a.rend} %)`)}
            seuilAlerte={seuilAlerte}
            ferme={ferme}
            onCloturer={() => {
              const incompletes = heures.filter((c) => !sg.avancementHeure(m, roster, c).complete);
              const msg = incompletes.length
                ? `Heures incomplètes : ${incompletes.join(", ")}.\nClôturer quand même ? Plus aucune saisie ne sera possible (réouverture au bureau).`
                : "Clôturer la journée ? Plus aucune saisie ne sera possible (réouverture au bureau).";
              if (confirm(msg)) saisir({ type: "cloture", valeur: true });
            }}
            onHeure={setOnglet}
          />
        )}
      </div>

      {feuille?.type === "poste" && (
        <FeuillePoste
          o={roster.find((o) => o.id === feuille.ouvId)!}
          col={feuille.col}
          m={m}
          roster={roster}
          operations={operations}
          onFermer={() => setFeuille(null)}
          onValider={(lignes) => {
            if (saisir({ type: "posteHeure", ouvId: feuille.ouvId, col: feuille.col, lignes })) setFeuille(null);
          }}
        />
      )}
      {feuille?.type === "arret" && (
        <FeuilleArret
          o={roster.find((o) => o.id === feuille.ouvId)!}
          onFermer={() => setFeuille(null)}
          onValider={(motif, secondes) => {
            if (saisir({ type: "arretAjout", ouvId: feuille.ouvId, motif, secondes })) setFeuille(null);
          }}
        />
      )}
    </div>
  );
}

/* ═══════════ une heure : chaque ouvrière + la sortie de chaîne ═══════════ */

function VueHeure({
  col,
  j,
  m,
  roster,
  objH,
  ferme,
  poserCase,
  suivante,
  saisir,
  ouvrirPoste,
  heureSuivante,
}: {
  col: string;
  j: Journee;
  m: sg.Matrices;
  roster: Ligne[];
  objH: number;
  ferme: boolean;
  poserCase: (i: number, el: HTMLInputElement | null) => void;
  suivante: (i: number) => void;
  saisir: (...s: sg.Saisie[]) => boolean;
  ouvrirPoste: (ouvId: number) => void;
  heureSuivante: () => void;
}) {
  const sortie = m.sortie[col];
  const pSortie = typeof sortie === "number" && objH > 0 ? Math.round((sortie / objH) * 100) : null;
  const a = sg.avancementHeure(m, roster, col);
  const brute = j as unknown as rd.JourneeBrute;
  // Les absentes de la journée passent en bas, repliées : on ne les saute pas une à une.
  const presentes = roster.filter((o) => !sg.absenteJour(m, j.cols, o.id));
  const absentes = roster.filter((o) => sg.absenteJour(m, j.cols, o.id));
  const iSortie = presentes.length;

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
        {presentes.map((o, i) => {
          const v = m.ops[o.id]?.[col];
          const detail = m.opsDetail[o.id]?.[col];
          const samH = ouvSamAt(j, o, col);
          const posteH = detail?.length ? detail.map((d) => d.poste).join(" + ") : (m.opsPoste[o.id]?.[col] ?? o.poste);
          const change = !!detail?.length || !!m.opsPoste[o.id]?.[col] || !!m.opsSam[o.id]?.[col];
          const pct = rd.heureTravaillee(brute, o.id, col) ? Math.round((rd.gagneHeure(brute, o, col) / 3600) * 100) : null;
          return (
            <div key={o.id} className={`flex items-center gap-2 border-b px-3 py-2 last:border-0 ${pctBg(pct)}`}>
              <div className="w-7 text-center text-sm text-slate-400">{i + 1}</div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-lg font-bold">{o.nom}</div>
                <div className={`truncate text-xs ${change ? "font-bold text-violet-700" : "text-slate-500"}`}>
                  {posteH} · {samH > 0 ? `obj ${nb.format(3600 / samH)}/h` : "SAM du poste ?"}
                  {change ? " · poste changé" : ""}
                </div>
              </div>
              {detail?.length ? (
                <button onClick={() => ouvrirPoste(o.id)} disabled={ferme} className="w-28 rounded-xl border-2 border-violet-500 bg-white py-2.5 text-center text-2xl font-black tabular-nums">
                  {nb.format(sg.quantite(detail.reduce((t, d) => t + d.qte, 0)) ?? 0)}
                </button>
              ) : (
                <CaseSaisie
                  valeur={v}
                  disabled={ferme}
                  inputRef={(el) => poserCase(i, el)}
                  onEntree={() => suivante(i)}
                  onValider={(t) => {
                    const r = sg.lireCellule(t);
                    if (!r.ok) return void toast.error(r.error);
                    saisir({ type: "op", ouvId: o.id, col, valeur: r.valeur });
                  }}
                />
              )}
              {(["ABS", "RI"] as const).map((k) => (
                <button
                  key={k}
                  disabled={ferme}
                  onClick={() => saisir({ type: "op", ouvId: o.id, col, valeur: v === k ? null : k })}
                  className={`w-14 rounded-xl py-3 text-sm font-extrabold ${v === k ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}
                >
                  {k}
                </button>
              ))}
              <button
                disabled={ferme}
                onClick={() => ouvrirPoste(o.id)}
                title="Changement de poste dans l'heure"
                className={`w-14 rounded-xl py-3 text-lg font-bold ${change ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-600"}`}
              >
                ⇄
              </button>
              <div className={`w-16 text-right text-lg font-extrabold tabular-nums ${pctTone(pct)}`}>{pct === null ? (v === "ABS" || v === "RI" ? v : "—") : `${pct}%`}</div>
            </div>
          );
        })}
        {roster.length === 0 && <div className="px-4 py-6 text-center text-slate-500">Aucune ouvrière sur cette journée : ajoutez-les au bureau.</div>}
        {absentes.length > 0 && (
          <details className="bg-slate-50 px-4 py-2 text-sm text-slate-500">
            <summary className="cursor-pointer font-semibold">{absentes.length} absente(s) aujourd&apos;hui (onglet Présence)</summary>
            {absentes.map((o) => o.nom).join(" · ")}
          </details>
        )}
      </div>

      <div className={`flex items-center gap-3 rounded-2xl border-2 border-sky-500 bg-white px-4 py-3 shadow-sm ${pctBg(pSortie)}`}>
        <div className="flex-1">
          <div className="text-lg font-black text-sky-800">🏁 SORTIE DE CHAÎNE — {col}</div>
          <div className="text-sm text-slate-500">pièces terminées dans l&apos;heure · objectif {Math.round(objH)} / h</div>
        </div>
        <CaseSaisie
          valeur={sortie}
          disabled={ferme}
          inputRef={(el) => poserCase(iSortie, el)}
          onEntree={() => suivante(iSortie)}
          onValider={(t) => {
            const r = sg.lireCellule(t);
            if (!r.ok || r.valeur === "RI" || r.valeur === "ABS") return void toast.error("Quantité de sortie invalide");
            saisir({ type: "sortie", col, valeur: r.valeur });
          }}
        />
        <div className={`w-16 text-right text-lg font-extrabold ${pctTone(pSortie)}`}>{pSortie === null ? "—" : `${pSortie}%`}</div>
      </div>

      <div className="flex items-center justify-between text-sm text-slate-600">
        <span>
          {a.faites}/{a.total} ouvrières · sortie {a.sortie ? "✓" : "à saisir"} — Entrée = case suivante. ABS / RI : heure exclue de l&apos;objectif.
        </span>
        <button onClick={heureSuivante} className="rounded-xl bg-slate-900 px-5 py-3 font-bold text-white">
          Heure suivante →
        </button>
      </div>
    </div>
  );
}

/* ═══════════ récapitulatif de la journée ═══════════ */

function Recap({
  j,
  m,
  roster,
  objH,
  alertes,
  seuilAlerte,
  ferme,
  onCloturer,
  onHeure,
}: {
  j: Journee;
  m: sg.Matrices;
  roster: Ligne[];
  objH: number;
  alertes: string[];
  seuilAlerte: number;
  ferme: boolean;
  onCloturer: () => void;
  onHeure: (col: string) => void;
}) {
  const brute = j as unknown as rd.JourneeBrute;
  return (
    <div className="space-y-3">
      {alertes.length > 0 && (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-red-900">
          <b>⚠ Sous {seuilAlerte} % :</b> {alertes.join(" · ")}
        </div>
      )}
      <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-slate-50 text-xs uppercase text-slate-500">
              <th className="px-3 py-2 text-left">Ouvrière</th>
              {j.cols.map((c) => (
                <th key={c} className="px-1 py-2">
                  <button onClick={() => onHeure(c)} className="underline">
                    {c}
                  </button>
                </th>
              ))}
              <th className="px-2 py-2">Total</th>
              <th className="px-2 py-2">Rend.</th>
              <th className="px-2 py-2">Ret.</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b bg-sky-50 font-bold text-sky-900">
              <td className="px-3 py-2">🏁 Sortie de chaîne</td>
              {j.cols.map((c) => {
                const v = m.sortie[c];
                const p = typeof v === "number" && objH > 0 ? (v / objH) * 100 : null;
                return (
                  <td key={c} className={`px-1 py-2 text-center tabular-nums ${pctTone(p)}`}>
                    {v ?? "·"}
                  </td>
                );
              })}
              <td className="px-2 py-2 text-center">{chSortieTotal(j)}</td>
              <td />
              <td className="px-2 py-2 text-center">{chRetTotal(j)}</td>
            </tr>
            {roster.map((o) => {
              const r = ouvRend(j, o);
              return (
                <tr key={o.id} className="border-b">
                  <td className="px-3 py-1.5">
                    <div className="font-semibold">{o.nom}</div>
                    <div className="text-xs text-slate-500">{o.poste}</div>
                  </td>
                  {j.cols.map((c) => {
                    const v = m.ops[o.id]?.[c];
                    const q = rd.qteHeure(brute, o.id, c);
                    const p = rd.heureTravaillee(brute, o.id, c) ? (rd.gagneHeure(brute, o, c) / 3600) * 100 : null;
                    return (
                      <td key={c} className={`px-1 py-1.5 text-center tabular-nums ${pctTone(p)} ${m.opsDetail[o.id]?.[c] ? "font-black" : ""}`}>
                        {v === "ABS" || v === "RI" ? v : v === undefined && !m.opsDetail[o.id]?.[c] ? "·" : q}
                      </td>
                    );
                  })}
                  <td className="px-2 py-1.5 text-center font-bold">{ouvProd(j, o.id)}</td>
                  <td className={`px-2 py-1.5 text-center font-extrabold ${pctTone(r)}`}>{r === null ? "—" : `${r}%`}</td>
                  <td className="px-2 py-1.5 text-center">{ouvRet(j, o.id) || ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!ferme && (
        <button onClick={onCloturer} className="w-full rounded-2xl bg-emerald-600 py-4 text-lg font-extrabold text-white">
          ✓ Clôturer la journée
        </button>
      )}
    </div>
  );
}

/* ═══════════ case de saisie ═══════════ */

/** Case numérique : affiche la valeur du serveur tant qu'on n'y tape pas ;
 * enregistre en quittant la case (Entrée = case suivante). */
function CaseSaisie({
  valeur,
  disabled,
  inputRef,
  onEntree,
  onValider,
}: {
  valeur: sg.Cellule | number | undefined;
  disabled?: boolean;
  inputRef?: (el: HTMLInputElement | null) => void;
  onEntree?: () => void;
  onValider: (texte: string) => void;
}) {
  const [focus, setFocus] = useState(false);
  const [txt, setTxt] = useState("");
  const affiche = focus ? txt : fmtCase(valeur);
  return (
    <input
      ref={inputRef}
      value={affiche}
      disabled={disabled}
      inputMode="decimal"
      enterKeyHint="next"
      placeholder="·"
      onFocus={(e) => {
        setTxt(fmtCase(valeur));
        setFocus(true);
        const el = e.currentTarget;
        requestAnimationFrame(() => el.select());
      }}
      onChange={(e) => setTxt(e.target.value)}
      onBlur={() => {
        setFocus(false);
        if (txt.trim() !== fmtCase(valeur)) onValider(txt);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          if (onEntree) onEntree();
          else e.currentTarget.blur();
        }
      }}
      className="w-28 rounded-xl border-2 border-slate-300 bg-white py-2.5 text-center text-2xl font-black tabular-nums focus:border-slate-900 focus:outline-none disabled:bg-slate-100"
    />
  );
}

function Kpi({ l, v, sub, style }: { l: string; v: string; sub?: string; style?: React.CSSProperties }) {
  return (
    <div className="rounded-xl bg-slate-50 px-2 py-1">
      <div className="text-[10px] font-bold uppercase text-slate-500">{l}</div>
      <div className="text-lg font-black tabular-nums" style={style}>
        {v} {sub && <span className="text-xs font-semibold text-slate-500">{sub}</span>}
      </div>
    </div>
  );
}

/* ═══════════ feuilles (panneaux du bas) ═══════════ */

function Feuille({ titre, onFermer, children }: { titre: string; onFermer: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/50 sm:items-center" onClick={(e) => e.target === e.currentTarget && onFermer()}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white p-5 sm:rounded-3xl">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-xl font-black">{titre}</div>
          <button onClick={onFermer} className="rounded-xl bg-slate-100 px-3 py-2 font-bold">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Changement de poste dans l'heure : une ligne par opération réellement faite. */
function FeuillePoste({
  o,
  col,
  m,
  roster,
  operations,
  onFermer,
  onValider,
}: {
  o: Ligne;
  col: string;
  m: sg.Matrices;
  roster: Ligne[];
  operations: { nom: string; sam: number }[];
  onFermer: () => void;
  onValider: (lignes: sg.OpDetail[]) => void;
}) {
  const depart = () => {
    const d = m.opsDetail[o.id]?.[col];
    if (d?.length) return d.map((x) => ({ poste: x.poste, sam: String(x.sam), qte: String(x.qte) }));
    const v = m.ops[o.id]?.[col];
    return [{ poste: m.opsPoste[o.id]?.[col] ?? o.poste, sam: String(m.opsSam[o.id]?.[col] ?? o.sam), qte: typeof v === "number" ? String(v) : "" }];
  };
  const [lignes, setLignes] = useState(depart);
  const catalogue = useMemo(() => {
    const map = new Map<string, { nom: string; sam: number }>();
    for (const x of [...roster.map((r) => ({ nom: r.poste, sam: r.sam })), ...operations]) if (x.nom) map.set(cleOperation(x.nom), x);
    return [...map.values()];
  }, [roster, operations]);
  const set = (i: number, k: "poste" | "sam" | "qte", v: string) =>
    setLignes((s) =>
      s.map((l, x) => {
        if (x !== i) return l;
        const n = { ...l, [k]: v };
        if (k === "poste") {
          const trouve = catalogue.find((c) => cleOperation(c.nom) === cleOperation(v));
          if (trouve && trouve.sam > 0) n.sam = String(trouve.sam);
        }
        return n;
      }),
    );
  const lire = (s: string) => Number(String(s).replace(",", "."));
  return (
    <Feuille titre={`⇄ ${o.nom} — ${col}`} onFermer={onFermer}>
      <p className="mb-3 text-sm text-slate-600">
        Poste habituel : <b>{o.poste}</b> (SAM {o.sam}s). Si elle a changé d&apos;opération dans l&apos;heure, une ligne par opération : le
        rendement se calcule avec le SAM de chaque opération.
      </p>
      <datalist id="postes-gpao">
        {catalogue.map((c) => (
          <option key={c.nom} value={c.nom}>
            {c.sam > 0 ? `SAM ${c.sam}s` : ""}
          </option>
        ))}
      </datalist>
      <div className="space-y-2">
        {lignes.map((l, i) => (
          <div key={i} className="flex gap-2">
            <input list="postes-gpao" value={l.poste} onChange={(e) => set(i, "poste", e.target.value)} placeholder="Opération" className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-3 text-base" />
            <input value={l.sam} onChange={(e) => set(i, "sam", e.target.value)} inputMode="decimal" placeholder="SAM s" className="w-20 rounded-xl border border-slate-300 px-2 py-3 text-center" />
            <input value={l.qte} onChange={(e) => set(i, "qte", e.target.value)} inputMode="decimal" placeholder="Pièces" className="w-24 rounded-xl border-2 border-slate-400 px-2 py-3 text-center text-xl font-black" />
            <button onClick={() => setLignes((s) => s.filter((_, x) => x !== i))} className="rounded-xl bg-slate-100 px-3 text-slate-500">
              ✕
            </button>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={() => setLignes((s) => [...s, { poste: "", sam: "", qte: "" }])} className="rounded-xl bg-slate-100 px-4 py-3 font-bold">
          ＋ Autre opération
        </button>
        <button
          onClick={() => setLignes((s) => [{ poste: o.poste, sam: String(o.sam), qte: String(s.reduce((t, x) => t + (lire(x.qte) || 0), 0) || "") }])}
          className="rounded-xl bg-slate-100 px-4 py-3 font-bold"
        >
          ↺ Poste habituel
        </button>
      </div>
      <button
        onClick={() => {
          const propres = lignes
            .filter((l) => l.qte.trim() !== "")
            .map((l) => ({ poste: l.poste.trim() || o.poste, sam: lire(l.sam) > 0 ? lire(l.sam) : o.sam, qte: lire(l.qte) }));
          if (propres.some((p) => !Number.isFinite(p.qte) || p.qte < 0)) return void toast.error("Quantité invalide");
          onValider(propres);
        }}
        className="mt-4 w-full rounded-2xl bg-emerald-600 py-4 text-lg font-extrabold text-white"
      >
        ✓ Enregistrer
      </button>
    </Feuille>
  );
}

const DUREES = [5, 10, 15, 20, 30, 45, 60];

function FeuilleArret({ o, onFermer, onValider }: { o: Ligne; onFermer: () => void; onValider: (motif: string, secondes: number) => void }) {
  const [motif, setMotif] = useState("");
  const [minutes, setMinutes] = useState("");
  const min = Number(minutes.replace(",", "."));
  return (
    <Feuille titre={`⏱ Arrêt — ${o.nom}`} onFermer={onFermer}>
      <div className="mb-1 text-sm font-bold text-slate-600">Motif</div>
      <div className="flex flex-wrap gap-2">
        {sg.MOTIFS_ARRET.map((x) => (
          <button key={x} onClick={() => setMotif(x)} className={`rounded-xl px-3 py-2.5 text-sm font-bold ${motif === x ? "bg-slate-900 text-white" : "bg-slate-100"}`}>
            {x}
          </button>
        ))}
      </div>
      <div className="mb-1 mt-4 text-sm font-bold text-slate-600">Durée (minutes)</div>
      <div className="flex flex-wrap gap-2">
        {DUREES.map((d) => (
          <button key={d} onClick={() => setMinutes(String(d))} className={`w-16 rounded-xl py-3 font-extrabold ${min === d ? "bg-slate-900 text-white" : "bg-slate-100"}`}>
            {d}
          </button>
        ))}
        <input value={minutes} onChange={(e) => setMinutes(e.target.value)} inputMode="decimal" placeholder="autre" className="w-24 rounded-xl border border-slate-300 px-2 py-3 text-center text-lg font-bold" />
      </div>
      <button
        disabled={!motif || !(min > 0)}
        onClick={() => onValider(motif, Math.round(min * 60))}
        className="mt-5 w-full rounded-2xl bg-emerald-600 py-4 text-lg font-extrabold text-white disabled:bg-slate-300"
      >
        ✓ Ajouter l&apos;arrêt
      </button>
    </Feuille>
  );
}
