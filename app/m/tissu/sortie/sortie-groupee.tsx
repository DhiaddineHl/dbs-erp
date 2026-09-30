"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ScannerQr, type RetourScan } from "@/components/shared/scanner-qr";
import { bipScan } from "@/components/shared/son";
import { sortieGroupee, verifierPourSortie } from "@/lib/actions/rouleaux";
import { ChoixSortie, lieuComplet, type CmdSortie, type Lieu, type SousTraitant } from "../choix-sortie";

const nb = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const lire = (s: string) => Number(String(s).replace(",", ".")) || 0;

type Ligne = { code: string; disponible: number; lot: string; tissu: string; unite: string; quantite: string };

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
    const r = await verifierPourSortie(brut);
    if (!r.ok) return signaler("erreur", r.error);
    bruts.current.set(brut.trim(), r.code);
    if (deja.current.has(r.code)) return signaler("deja", `${r.code} déjà scanné`);
    deja.current.add(r.code);
    setLignes((l) => [{ code: r.code, disponible: r.disponible, lot: r.lot, tissu: r.tissu, unite: r.unite, quantite: String(r.disponible) }, ...l]);
    signaler("ok", `✔ ${r.code} · ${nb.format(r.disponible)} ${r.unite}`);
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
          <button
            disabled={!lieuComplet(lieu, motif)}
            onClick={() => setEtape(2)}
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
            <div className="min-w-0 flex-1">
              <div className="font-mono font-bold">{l.code}</div>
              <div className="truncate text-xs text-slate-500">
                {l.lot} · {l.tissu} · dispo {nb.format(l.disponible)} {l.unite}
              </div>
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
