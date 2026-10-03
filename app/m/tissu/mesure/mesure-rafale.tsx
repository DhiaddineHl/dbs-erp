"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ScannerQr, type RetourScan } from "@/components/shared/scanner-qr";
import { bipScan } from "@/components/shared/son";
import { lireRouleauAMesurer, validerRouleau, type RouleauAMesurer } from "@/lib/actions/rouleaux";
import { FormMesure, type MesureFaite } from "./form-mesure";

const nb = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

/* Scan → métrage → scan → métrage… La caméra ne se ferme pas : dès qu'un
 * rouleau est validé, on présente le suivant. Tant qu'un métrage est en cours
 * de saisie, un autre rouleau devant l'objectif est ignoré (on ne perd pas ce
 * qu'on tape) ; si le champ est encore vide, il le remplace. */
export function MesureRafale({ emplacements, aMesurer }: { emplacements: string[]; aMesurer: { lot: string; n: number }[] }) {
  const router = useRouter();
  const [courant, setCourant] = useState<RouleauAMesurer | null>(null);
  const [retour, setRetour] = useState<RetourScan | null>(null);
  const [faits, setFaits] = useState<MesureFaite[]>([]);
  const cle = useRef(0);
  const enCours = useRef<string | null>(null);

  const signaler = (ton: RetourScan["ton"], texte: string) => {
    cle.current += 1;
    setRetour({ cle: cle.current, ton, texte });
    bipScan(ton);
    if (ton === "erreur") navigator.vibrate?.([80, 60, 80]);
  };

  // Lectures traitées une à une, dans l'ordre (le serveur répond moins vite
  // que la caméra ne lit).
  const file = useRef<Promise<void>>(Promise.resolve());
  const scanner = (brut: string) => {
    file.current = file.current.then(() => traiter(brut)).catch(() => signaler("erreur", "Réseau indisponible : rescannez."));
  };

  const traiter = async (brut: string) => {
    const r = await lireRouleauAMesurer(brut);
    if (!r.ok) return signaler("erreur", r.error);
    const x = r.rouleau;
    if (enCours.current === x.code) return;
    if (x.statut === "annule") return signaler("erreur", `${x.code} : étiquette annulée`);
    if (x.statut === "en_attente") {
      // Rouleau saisi au bureau (métrage connu) : ce scan le met en stock.
      const v = await validerRouleau({ code: x.code });
      if (!v.ok) return signaler("erreur", v.error);
      router.refresh();
      return signaler("ok", `✔ ${x.code} · ${nb.format(x.metrage)} ${x.lot.unite} mis en stock (métrage saisi au bureau)`);
    }
    if (!x.aMesurer) return signaler("deja", `${x.code} déjà mesuré : ${nb.format(x.metrage)} ${x.lot.unite}`);
    if (enCours.current) return signaler("deja", `Terminez d'abord ${enCours.current}`);
    enCours.current = x.code;
    setCourant(x);
    signaler("ok", `${x.code} · tapez le métrage`);
  };

  const fait = (m: MesureFaite) => {
    enCours.current = null;
    setCourant(null);
    setFaits((f) => [m, ...f]);
    signaler("ok", `✔ ${m.code} · ${nb.format(m.metrage)} m · lot ${m.lot} ${m.total - m.restants}/${m.total}`);
    router.refresh();
  };

  const total = faits.reduce((s, f) => s + f.metrage, 0);
  return (
    <div className="space-y-3">
      <ScannerQr
        onCode={scanner}
        autoCamera
        retour={retour}
        compteur={`${faits.length} mesuré${faits.length > 1 ? "s" : ""} · ${nb.format(total)} m`}
        placeholder="Scanner ou taper le code du rouleau"
      />
      {retour && (
        <div
          className={`rounded-xl px-3 py-2 text-sm font-semibold ${
            retour.ton === "ok" ? "bg-emerald-50 text-emerald-900" : retour.ton === "deja" ? "bg-amber-50 text-amber-900" : "bg-red-100 text-red-900"
          }`}
        >
          {retour.texte}
        </div>
      )}
      {courant ? (
        <FormMesure
          key={courant.code}
          rouleau={courant}
          emplacements={emplacements}
          onFait={fait}
          onAbandon={() => {
            enCours.current = null;
            setCourant(null);
          }}
        />
      ) : (
        <div className="rounded-2xl bg-white px-4 py-4 text-center text-sm text-slate-600">
          Présentez l&apos;étiquette d&apos;un rouleau à la caméra, puis tapez le métrage écrit dessus.
        </div>
      )}
      {faits.length > 0 && (
        <div>
          <div className="mb-1 text-xs font-bold uppercase text-slate-500">Mesurés maintenant ({faits.length})</div>
          <div className="divide-y rounded-2xl bg-white text-sm">
            {faits.map((f) => (
              <div key={f.code} className="flex justify-between px-4 py-2">
                <span className="font-mono font-bold">{f.code}</span>
                <span className="text-slate-600">
                  {nb.format(f.metrage)} m · {f.lot} ({f.total - f.restants}/{f.total})
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      {aMesurer.length > 0 && (
        <div>
          <div className="mb-1 text-xs font-bold uppercase text-slate-500">Encore à mesurer</div>
          <div className="divide-y rounded-2xl bg-white text-sm">
            {aMesurer.map((l) => (
              <div key={l.lot} className="flex justify-between px-4 py-2">
                <span className="font-bold">{l.lot}</span>
                <span className="text-amber-700">{l.n} rouleau(x)</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
