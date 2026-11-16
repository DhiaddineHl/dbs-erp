"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { ScannerQr, type RetourScan } from "@/components/shared/scanner-qr";
import { bipScan } from "@/components/shared/son";
import { annulerPassage, finirAuPoste } from "@/lib/actions/paquets";
import * as pq from "@/lib/domain/paquet";
import type * as sg from "@/lib/domain/saisie-gpao";
import type { BesoinChoix, PassageVue } from "@/lib/services/paquets";

/* « FINI AU POSTE » SUR LA TABLETTE.
 *
 * L'agent appuie sur 🏷 en face de l'ouvrière et scanne l'étiquette du
 * morceau qu'elle vient de FINIR à son poste. Une seule fois par morceau et
 * par poste. L'application en tire la proposition des pièces de l'heure et le
 * recoupement de la journée — la saisie des pièces reste celle d'avant, et la
 * production reste comptée à la sortie de chaîne. */

/** Pièces des paquets finis par une ouvrière, heure par heure. */
export function finisParHeure(passages: PassageVue[], ouvId: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of passages) if (p.ouvId === ouvId) out[p.heure] = (out[p.heure] ?? 0) + p.qte;
  return out;
}

/** La proposition de pièces pour une ouvrière et une heure. */
/** Ce que la proposition et le récapitulatif lisent de la journée. */
export type SaisieLue = Pick<sg.Matrices, "ops" | "opsDetail">;

export function proposition(passages: PassageVue[], m: SaisieLue, cols: string[], ouvId: number, col: string): number {
  return pq.propositionPieces({ cols, col, pieces: m.ops[ouvId] ?? {}, finis: finisParHeure(passages, ouvId) });
}

const etiquette = (p: PassageVue) => `${p.numero}${p.morceau && p.morceau !== pq.LIASSE_UNIQUE ? ` · ${p.morceau}` : ""}`;

/** Sous l'ouvrière, dans l'heure : bouton 🏷 et paquets finis cette heure. */
export function LigneFinis({
  ouvId,
  col,
  cols,
  m,
  passages,
  legacy,
  disabled,
  onScanner,
  onAnnule,
  onAppliquer,
}: {
  ouvId: number;
  col: string;
  cols: string[];
  m: SaisieLue;
  passages: PassageVue[];
  /** Anciens numéros « travaillé dessus » (avant le 15/11), en lecture. */
  legacy: number[];
  disabled: boolean;
  onScanner: () => void;
  onAnnule: (id: number) => void;
  onAppliquer: (n: number) => void;
}) {
  const siens = passages.filter((p) => p.ouvId === ouvId && p.heure === col);
  const v = m.ops[ouvId]?.[col];
  const multi = (m.opsDetail[ouvId]?.[col]?.length ?? 0) > 1;
  const prop = proposition(passages, m, cols, ouvId, col);
  const propose = siens.length > 0 && !multi && v !== "ABS" && v !== "RI" && prop > 0 && v !== prop;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-9">
      <button
        type="button"
        onClick={onScanner}
        disabled={disabled}
        aria-label="Scanner un paquet fini"
        className="flex h-10 items-center gap-1 rounded-xl bg-slate-900 px-3 text-sm font-bold text-white disabled:opacity-40"
      >
        🏷 Paquet fini
      </button>
      {siens.map((p) => (
        <span key={p.id} className="flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1.5 text-sm font-bold text-emerald-900" title={`${p.of} · T. ${p.taille} · ${p.poste}`}>
          {etiquette(p)} <span className="font-normal text-emerald-700">({p.qte})</span>
          {!disabled && (
            <button
              type="button"
              onClick={() => {
                if (!confirm(`Annuler « paquet ${etiquette(p)} fini au poste ${p.poste} » ? Il reste dans l'historique, barré.`)) return;
                void annulerPassage(p.id, "Annulé sur la tablette").then((r) => (r.ok ? onAnnule(p.id) : toast.error(r.error)));
              }}
              className="ml-1 text-emerald-600"
              aria-label="Annuler ce scan"
            >
              ✕
            </button>
          )}
        </span>
      ))}
      {propose && (
        <button type="button" disabled={disabled} onClick={() => onAppliquer(prop)} className="rounded-full bg-amber-100 px-3 py-1.5 text-sm font-bold text-amber-900">
          Paquets finis → {prop} pcs {typeof v === "number" ? `(case : ${v})` : ""} · appliquer
        </button>
      )}
      {legacy.length > 0 && <span className="text-xs text-slate-400">ancien relevé : {legacy.join(", ")}</span>}
    </div>
  );
}

type Retour = { ton: RetourScan["ton"]; texte: string };
type Demande = { scan: string; code?: string; morceau?: string; poste?: string };

/** Le panneau de scan : caméra ouverte, l'agent enchaîne les étiquettes. */
export function FeuilleFiniAuPoste({
  journeeId,
  ouvId,
  nom,
  col,
  posteH,
  passages,
  onPassage,
  onFermer,
  Cadre,
}: {
  journeeId: number;
  ouvId: number;
  nom: string;
  col: string;
  posteH: string;
  passages: PassageVue[];
  onPassage: (p: PassageVue) => void;
  onFermer: () => void;
  Cadre: (p: { titre: string; onFermer: () => void; children: React.ReactNode }) => React.ReactNode;
}) {
  const [retour, setRetour] = useState<RetourScan | null>(null);
  const [message, setMessage] = useState<Retour | null>(null);
  /* Un choix manque (lequel des deux paquets 12, quel morceau, quel poste) :
     la caméra se met en pause jusqu'à la réponse. */
  const [besoin, setBesoin] = useState<{ b: BesoinChoix; demande: Demande } | null>(null);
  const [occupe, setOccupe] = useState(false);
  const cle = useRef(0);
  const file = useRef<Promise<void>>(Promise.resolve());
  const vus = useRef(new Set<string>());

  const signaler = (ton: RetourScan["ton"], texte: string) => {
    cle.current += 1;
    setRetour({ cle: cle.current, ton, texte });
    setMessage({ ton, texte });
    bipScan(ton);
    if (ton === "erreur") navigator.vibrate?.([80, 60, 80]);
  };

  const envoyer = async (d: Demande) => {
    setOccupe(true);
    try {
      const r = await finirAuPoste({ journeeId, ouvId, col, ...d });
      if (!r.ok) return signaler("erreur", r.error);
      if (r.besoin) {
        setBesoin({ b: r.besoin, demande: d });
        bipScan("deja");
        return;
      }
      if (r.passage) {
        setBesoin(null);
        vus.current.add(d.scan.trim());
        onPassage(r.passage);
        signaler("ok", `✔ Paquet ${etiquette(r.passage)} fini · ${r.passage.qte} pcs`);
      }
    } catch {
      // Réseau coupé : rien n'est enregistré, on le DIT (avant, silence).
      signaler("erreur", "Réseau indisponible : scan NON enregistré, rescannez.");
    } finally {
      setOccupe(false);
    }
  };

  const scanner = (brut: string) => {
    if (besoin) return;
    file.current = file.current.then(() => envoyer({ scan: brut }));
  };

  const choisir = (complement: Partial<Demande>) => {
    if (!besoin) return;
    const d = { ...besoin.demande, ...complement };
    setBesoin(null);
    file.current = file.current.then(() => envoyer(d));
  };

  const siens = passages.filter((p) => p.ouvId === ouvId && p.heure === col);

  return (
    <Cadre titre={`🏷 ${nom} — ${col}`} onFermer={onFermer}>
      <div className="mb-2 rounded-xl bg-slate-100 px-3 py-2 text-sm">
        Poste de l&apos;heure : <b>{posteH || "?"}</b> · scannez le morceau qu&apos;elle vient de <b>finir</b>.
      </div>
      <ScannerQr
        onCode={scanner}
        placeholder="Scanner l'étiquette, ou taper le n° (12)"
        autoCamera
        occupe={occupe}
        pause={!!besoin}
        retour={retour}
        compteur={siens.length ? `${siens.length} paquet(s) fini(s) cette heure` : "aucun paquet fini cette heure"}
      />
      {message && !besoin && (
        <div className={`mt-2 rounded-xl px-3 py-2 text-sm font-semibold ${message.ton === "ok" ? "bg-emerald-50 text-emerald-900" : message.ton === "deja" ? "bg-amber-50 text-amber-900" : "bg-red-100 text-red-900"}`}>
          {message.texte}
        </div>
      )}
      {besoin && (
        <div className="mt-3 rounded-2xl border-2 border-amber-400 bg-amber-50 p-3">
          {besoin.b.besoin === "of" && (
            <>
              <div className="mb-2 font-bold">Paquet {besoin.b.numero} : lequel ?</div>
              <div className="grid gap-2">
                {besoin.b.choix.map((c) => (
                  <button key={c.code} onClick={() => choisir({ code: c.code })} className="rounded-xl bg-white px-4 py-3 text-left text-base font-bold shadow-sm">
                    {c.of}
                    {c.couleur ? ` · ${c.couleur}` : ""} · T. {c.taille} · {c.qte} pcs
                  </button>
                ))}
              </div>
            </>
          )}
          {besoin.b.besoin === "morceau" && (
            <>
              <div className="mb-2 font-bold">Paquet {besoin.b.numero} : quel morceau est fini ?</div>
              <div className="grid grid-cols-2 gap-2">
                {besoin.b.morceaux.map((x) => (
                  <button key={x} onClick={() => choisir({ code: (besoin.b as { code: string }).code, morceau: x })} className="rounded-xl bg-white px-4 py-3 text-base font-bold shadow-sm">
                    {x}
                  </button>
                ))}
              </div>
            </>
          )}
          {besoin.b.besoin === "poste" && (
            <>
              <div className="mb-2 font-bold">Paquet {besoin.b.numero} : fini à quel poste ?</div>
              <div className="grid gap-2">
                {besoin.b.postes.map((x) => (
                  <button key={x} onClick={() => choisir({ code: (besoin.b as { code: string }).code, poste: x })} className="rounded-xl bg-white px-4 py-3 text-base font-bold shadow-sm">
                    {x}
                  </button>
                ))}
              </div>
            </>
          )}
          <button onClick={() => setBesoin(null)} className="mt-2 w-full rounded-xl bg-slate-200 py-2 font-bold">
            Annuler ce scan
          </button>
        </div>
      )}
      <p className="mt-3 text-sm text-slate-500">
        Un scan veut dire « ce morceau est FINI à ce poste ». Il se fait une seule fois : un morceau déjà fini à ce poste est refusé, même un autre jour. Les
        pièces de l&apos;heure sont proposées d&apos;après les paquets finis ; corrigez-les si un paquet est entamé.
      </p>
      <button onClick={onFermer} className="mt-3 w-full rounded-xl bg-slate-900 py-4 text-lg font-black text-white">
        Terminé
      </button>
    </Cadre>
  );
}

/** Récapitulatif de la journée : pièces déclarées contre paquets finis. */
export function RecapFinis({
  passages,
  roster,
  m,
  cols,
  taille,
}: {
  passages: PassageVue[];
  roster: { id: number; nom: string; poste: string }[];
  m: SaisieLue;
  cols: string[];
  taille: number;
}) {
  if (!passages.length) return null;
  const lignes = roster
    .map((o) => {
      const siens = passages.filter((p) => p.ouvId === o.id);
      const pieces = cols.reduce((s, c) => {
        const v = m.ops[o.id]?.[c];
        const det = m.opsDetail[o.id]?.[c];
        return s + (det?.length ? det.reduce((a, d) => a + (d.qte || 0), 0) : typeof v === "number" ? v : 0);
      }, 0);
      const finis = siens.reduce((s, p) => s + p.qte, 0);
      const alerte = pq.controleFiniAuPoste({
        pieces,
        finis,
        nbPaquets: siens.length,
        taillePaquet: Math.max(taille, ...siens.map((p) => p.qte)),
        postes: new Set(siens.map((p) => p.poste.toLowerCase())).size,
      });
      return { o, siens, pieces, finis, alerte };
    })
    .filter((l) => l.siens.length > 0 || l.pieces > 0);
  const alertes = lignes.filter((l) => l.alerte);
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3">
        <b className="text-base">🏷 Paquets finis aujourd&apos;hui</b>
        <span className="text-xs text-slate-500">{passages.length} morceau(x) de paquet fini(s) aux postes</span>
      </div>
      {alertes.length ? (
        <ul className="mb-2 space-y-1 text-sm">
          {alertes.map((l) => (
            <li key={l.o.id} className="font-semibold text-amber-700">
              ⚠ {l.o.nom} — {l.alerte!.message}
            </li>
          ))}
        </ul>
      ) : (
        <div className="mb-2 text-sm font-semibold text-emerald-700">✓ Les pièces déclarées correspondent aux paquets finis (à un paquet entamé près).</div>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-xs uppercase text-slate-500">
            <th className="py-1 text-left">Ouvrière</th>
            <th className="py-1 text-right">Pièces déclarées</th>
            <th className="py-1 text-left">Paquets finis</th>
            <th className="py-1 text-right">Pièces des paquets</th>
            <th className="py-1 text-right">Écart</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((l) => (
            <tr key={l.o.id} className="border-b last:border-0">
              <td className="py-1 font-semibold">{l.o.nom}</td>
              <td className="py-1 text-right tabular-nums">{l.pieces}</td>
              <td className="py-1 text-slate-500">{l.siens.map(etiquette).join(", ") || "—"}</td>
              <td className="py-1 text-right tabular-nums">{l.finis}</td>
              <td className={`py-1 text-right font-bold tabular-nums ${l.alerte ? "text-amber-700" : "text-slate-400"}`}>
                {l.siens.length ? (l.pieces - l.finis > 0 ? `+${l.pieces - l.finis}` : l.pieces - l.finis) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-slate-500">
        Un écart d&apos;un paquet par poste est normal (paquet entamé). Ce relevé ne compte pas la production : elle reste celle de la sortie de chaîne.
      </p>
    </div>
  );
}
