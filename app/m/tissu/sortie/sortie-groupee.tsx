"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ScannerQr, type RetourScan } from "@/components/shared/scanner-qr";
import { bipScan } from "@/components/shared/son";
import { infoSortie, sortieGroupee, verifierPourSortie } from "@/lib/actions/rouleaux";
import * as rl from "@/lib/domain/rouleau";
import type { CibleSortie } from "@/lib/services/rouleaux";
import { ChoixSortie, lieuComplet, type CmdSortie, type Lieu, type SousTraitant } from "../choix-sortie";

const nb = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const lire = (s: string) => Number(String(s).replace(",", ".")) || 0;

type Ligne = {
  code: string;
  disponible: number;
  lot: string;
  tissu: string;
  unite: string;
  quantite: string;
  couleur: string;
  bain: string;
  feu: rl.FeuTissu;
};

const PASTILLE = { vert: "bg-emerald-500", orange: "bg-amber-500", rouge: "bg-red-600" } as const;

export function SortieGroupee({
  commandes,
  sousTraitants,
  codesInitiaux,
  bons,
}: {
  commandes: CmdSortie[];
  sousTraitants: SousTraitant[];
  codesInitiaux: string[];
  bons: { numero: string; date: string; lieu: string; commande: string; rouleaux: number; metrage: number }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [etape, setEtape] = useState<1 | 2>(1);
  const [lieu, setLieu] = useState<Lieu>({ commandeId: null, destination: "soustraitant", faconnierId: null });
  const [motif, setMotif] = useState("");
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [message, setMessage] = useState<{ ton: RetourScan["ton"]; texte: string } | null>(null);
  const [fait, setFait] = useState<{ numero: string; n: number; metrage: number } | null>(null);
  /* Ce qu'il faut à l'OF (besoin, déjà sorti, reste) : lu en passant à
     l'étape du scan, affiché en permanence pendant qu'on scanne. */
  const [cible, setCible] = useState<CibleSortie | null>(null);
  /** Couleur et bain des rouleaux déjà scannés (contrôle du mélange de bains). */
  const scannes = useRef<{ couleur: string; bain: string }[]>([]);
  const deja = useRef(new Set<string>());
  /* Texte brut du QR → code rouleau : un QR resté devant l'objectif n'est
     pas renvoyé au serveur à chaque passage. */
  const bruts = useRef(new Map<string, string>());
  const [retour, setRetour] = useState<RetourScan | null>(null);
  const cle = useRef(0);
  /* Scan en rafale : les lectures s'enchaînent plus vite que le serveur ne
     répond. On les traite une par une, dans l'ordre, pour qu'un même rouleau
     lu deux fois de suite ne passe pas deux fois le contrôle « déjà scanné ». */
  const file = useRef<Promise<void>>(Promise.resolve());

  const signaler = (ton: RetourScan["ton"], texte: string) => {
    cle.current += 1;
    setRetour({ cle: cle.current, ton, texte });
    setMessage({ ton, texte });
    bipScan(ton);
    if (ton === "erreur") navigator.vibrate?.([80, 60, 80]);
  };

  const traiter = async (brut: string) => {
    const connu = bruts.current.get(brut.trim());
    if (connu && deja.current.has(connu)) return signaler("deja", `${connu} déjà scanné`);
    const r = await verifierPourSortie(brut, lieu.commandeId);
    if (!r.ok) return signaler("erreur", r.error);
    bruts.current.set(brut.trim(), r.code);
    if (deja.current.has(r.code)) return signaler("deja", `${r.code} déjà scanné`);
    // Tissu d'un autre client, autre couleur : on demande avant d'ajouter.
    if (r.feu.ton === "rouge") {
      signaler("erreur", `${r.code} : ${r.feu.message}`);
      if (!confirm(`${r.code} : ${r.feu.message}\n\nAjouter quand même ce rouleau à la sortie ?`)) return;
    }
    const bain = rl.autreBain({ couleur: r.couleur, bain: r.bain }, scannes.current);
    deja.current.add(r.code);
    scannes.current.push({ couleur: r.couleur, bain: r.bain });
    setLignes((l) => [
      { code: r.code, disponible: r.disponible, lot: r.lot, tissu: r.tissu, unite: r.unite, quantite: String(r.disponible), couleur: r.couleur, bain: r.bain, feu: r.feu },
      ...l,
    ]);
    if (bain) signaler("deja", `⚠ ${r.code} : ${bain}`);
    else if (r.feu.ton === "orange") signaler("deja", `⚠ ${r.code} : ${r.feu.message}`);
    else signaler("ok", `✔ ${r.code} · ${nb.format(r.disponible)} ${r.unite}`);
  };

  const ajouter = (brut: string) => {
    file.current = file.current.then(() => traiter(brut)).catch(() => signaler("erreur", "Réseau indisponible : rescannez ce rouleau."));
    return file.current;
  };

  // Rouleaux présélectionnés au bureau (onglet Rouleaux → Sortie groupée).
  const initiaux = useRef(codesInitiaux);
  useEffect(() => {
    const codes = initiaux.current;
    initiaux.current = [];
    for (const c of codes) void ajouter(c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const total = lignes.reduce((s, l) => s + lire(l.quantite), 0);
  const lieuTexte =
    lieu.destination === "soustraitant"
      ? `chez ${sousTraitants.find((s) => s.id === lieu.faconnierId)?.nom ?? "?"}`
      : lieu.destination === "coupe"
        ? "en coupe interne"
        : lieu.destination;
  const cmd = commandes.find((c) => c.id === lieu.commandeId);

  if (fait) {
    return (
      <div className="rounded-2xl bg-white px-4 py-6 text-center">
        <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-emerald-100 text-3xl">✔</div>
        <div className="mt-3 text-2xl font-black">{fait.numero}</div>
        <div className="text-slate-600">
          {fait.n} rouleau(x) · {nb.format(fait.metrage)} m {lieuTexte}
        </div>
        <a href={`/magtissu/sortie/${encodeURIComponent(fait.numero)}`} target="_blank" rel="noreferrer" className="mt-4 block w-full rounded-2xl bg-slate-900 py-3 text-lg font-bold text-white">
          🖨 Imprimer le bon
        </a>
        <button
          onClick={() => {
            setFait(null);
            setLignes([]);
            deja.current.clear();
            bruts.current.clear();
            scannes.current = [];
            setRetour(null);
            setMessage(null);
            setEtape(1);
            router.refresh();
          }}
          className="mt-2 w-full rounded-2xl bg-slate-200 py-3 font-bold"
        >
          Nouvelle sortie
        </button>
      </div>
    );
  }

  if (etape === 1) {
    return (
      <div className="space-y-3">
        <div className="space-y-3 rounded-2xl bg-white p-4">
          <ChoixSortie commandes={commandes} sousTraitants={sousTraitants} valeur={lieu} onChange={setLieu} />
          {(lieu.destination === "autre" || !lieu.commandeId) && (
            <input value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Motif (obligatoire sans commande)" className="w-full rounded-2xl border border-slate-300 px-3 py-3" />
          )}
          {lieu.commandeId != null && (
            <a href={`/m/tissu/prelevement?of=${lieu.commandeId}`} className="block w-full rounded-2xl bg-slate-100 py-3 text-center font-bold text-slate-800">
              📋 Liste de prélèvement de cet OF
            </a>
          )}
          <button
            disabled={!lieuComplet(lieu, motif)}
            onClick={() => {
              setEtape(2);
              setCible(null);
              if (lieu.commandeId != null) void infoSortie(lieu.commandeId).then((r) => r.ok && setCible(r.cible)).catch(() => {});
            }}
            className="w-full rounded-2xl bg-emerald-600 py-4 text-lg font-extrabold text-white disabled:bg-slate-300"
          >
            Suivant : scanner les rouleaux →
          </button>
        </div>
        {bons.length > 0 && (
          <div>
            <div className="mb-1 text-xs font-bold uppercase text-slate-500">Derniers bons</div>
            <div className="divide-y rounded-2xl bg-white text-sm">
              {bons.map((b) => (
                <a key={b.numero} href={`/magtissu/sortie/${encodeURIComponent(b.numero)}`} target="_blank" rel="noreferrer" className="flex justify-between px-4 py-2.5">
                  <span className="font-bold">{b.numero}</span>
                  <span className="text-slate-500">
                    {b.rouleaux} rl · {nb.format(b.metrage)} m · {b.lieu}
                  </span>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <button onClick={() => setEtape(1)} className="w-full rounded-2xl bg-amber-50 px-4 py-3 text-left text-sm">
        <b>{cmd?.label ?? "Sans commande"}</b> · <b>{lieuTexte}</b> <span className="text-slate-500">(modifier)</span>
      </button>
      {cible && cible.besoin > 0 && (
        <div className="grid grid-cols-4 gap-1 rounded-2xl bg-white p-2 text-center text-xs shadow-sm">
          <Chiffre l="Besoin" v={cible.besoin} />
          <Chiffre l="Déjà sorti" v={cible.sorti} />
          <Chiffre l="Reste" v={cible.reste} fort />
          <Chiffre l="Scanné" v={total} ton={total > cible.reste + 0.001 ? "text-amber-700" : total >= cible.reste - 0.001 && cible.reste > 0 ? "text-emerald-700" : ""} />
          <div className="col-span-4 text-[11px] text-slate-500">
            {total > cible.reste + 0.001
              ? `⚠ ${nb.format(total - cible.reste)} m de plus que le reste à sortir.`
              : total >= cible.reste - 0.001 && cible.reste > 0
                ? "✓ Le reste à sortir est couvert."
                : `Encore ${nb.format(cible.reste - total)} m à scanner pour couvrir le besoin.`}
          </div>
        </div>
      )}
      {rl.bainsMelanges(lignes).map((b) => (
        <div key={b.couleur} className="rounded-xl bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-900">
          ⚠ {b.couleur} : {b.bains.length} bains mélangés ({b.bains.map((x) => `${x.bain} × ${x.n}`).join(", ")}). Ne pas les mettre dans le même
          matelas.
        </div>
      ))}
      {/* Caméra ouverte d'office et qui RESTE ouverte : on passe les rouleaux
          devant l'objectif les uns après les autres, sans toucher l'écran.
          Bip + cadre vert = ajouté, orange = déjà scanné, rouge = refusé. */}
      <ScannerQr
        onCode={ajouter}
        occupe={pending}
        autoCamera
        retour={retour}
        compteur={`${lignes.length} rouleau${lignes.length > 1 ? "x" : ""} · ${nb.format(total)} m`}
      />
      {message && <div className={`rounded-xl px-3 py-2 text-sm font-semibold ${message.ton === "ok" ? "bg-emerald-50 text-emerald-900" : message.ton === "deja" ? "bg-amber-50 text-amber-900" : "bg-red-100 text-red-900"}`}>{message.texte}</div>}
      <div className="divide-y rounded-2xl bg-white">
        {lignes.length === 0 && <div className="px-4 py-6 text-center text-sm text-slate-500">Scannez les rouleaux qui partent.</div>}
        {lignes.map((l, i) => (
          <div key={l.code} className="flex items-center gap-2 px-3 py-2">
            <span className={`size-3 shrink-0 rounded-full ${PASTILLE[l.feu.ton]}`} title={l.feu.message} />
            <div className="min-w-0 flex-1">
              <div className="font-mono font-bold">{l.code}</div>
              <div className="truncate text-xs text-slate-500">
                {l.lot} · {l.tissu}
                {l.bain ? ` · bain ${l.bain}` : ""} · dispo {nb.format(l.disponible)} {l.unite}
              </div>
              {l.feu.ton !== "vert" && <div className={`text-xs font-semibold ${l.feu.ton === "rouge" ? "text-red-700" : "text-amber-700"}`}>{l.feu.message}</div>}
            </div>
            <input
              value={l.quantite}
              onChange={(e) => setLignes((s) => s.map((x, j) => (j === i ? { ...x, quantite: e.target.value.replace(/[^\d.,]/g, "") } : x)))}
              inputMode="decimal"
              className={`w-24 rounded-xl border-2 py-2 text-center text-lg font-black ${lire(l.quantite) > l.disponible + 0.001 || lire(l.quantite) <= 0 ? "border-red-400" : "border-slate-300"}`}
            />
            <button
              onClick={() => {
                deja.current.delete(l.code);
                for (const [b, c] of bruts.current) if (c === l.code) bruts.current.delete(b);
                const k = scannes.current.findIndex((x) => x.couleur === l.couleur && x.bain === l.bain);
                if (k >= 0) scannes.current.splice(k, 1);
                setLignes((s) => s.filter((_, j) => j !== i));
              }}
              className="rounded-xl bg-slate-100 px-3 py-2 text-slate-500"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <button
        disabled={pending || !lignes.length || lignes.some((l) => lire(l.quantite) <= 0 || lire(l.quantite) > l.disponible + 0.001)}
        onClick={() =>
          start(async () => {
            const r = await sortieGroupee({
              rouleaux: lignes.map((l) => ({ code: l.code, quantite: lire(l.quantite) >= l.disponible - 0.001 ? undefined : l.quantite })),
              ...lieu,
              motif,
            });
            if (!r.ok) {
              navigator.vibrate?.([80, 60, 80]);
              return void toast.error(r.error);
            }
            setFait(r);
            window.open(`/magtissu/sortie/${encodeURIComponent(r.numero)}`, "_blank");
          })
        }
        className="sticky bottom-3 w-full rounded-2xl bg-emerald-600 py-4 text-lg font-extrabold text-white shadow-lg disabled:bg-slate-300"
      >
        {pending ? "Enregistrement…" : `✔ Sortir ${lignes.length} rouleau(x) · ${nb.format(total)} m`}
      </button>
    </div>
  );
}

function Chiffre({ l, v, fort, ton = "" }: { l: string; v: number; fort?: boolean; ton?: string }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase text-slate-500">{l}</div>
      <div className={`tabular-nums ${fort ? "text-lg font-black" : "font-bold"} ${ton}`}>{nb.format(v)}</div>
    </div>
  );
}
