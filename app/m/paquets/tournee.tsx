"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { ScannerQr, type RetourScan } from "@/components/shared/scanner-qr";
import { bipScan } from "@/components/shared/son";
import * as A from "@/lib/actions/paquets";
import * as pq from "@/lib/domain/paquet";
import type { PaquetVue } from "@/lib/services/paquets";

/* La tournée : la responsable scanne, l'application répond, elle enchaîne.
 *
 * Deux gestes seulement : « liasse finie » et « paquet assemblé ». Un
 * troisième, « problème », signale sans rien bloquer.
 *
 * Rien n'est obligatoire et rien ne refuse : on peut relever la veille,
 * assembler un paquet dont une liasse n'a jamais été relevée, sauter des
 * jours. L'application enregistre ce qui EST, pas ce qui devrait être. */

const auj = () => new Date().toISOString().slice(0, 10);

/** Première liasse encore sans nouvelle, sinon la première tout court. */
function liasseAProposer(p: PaquetVue, rang: number | null): string {
  const liasses = p.liasses.length ? p.liasses : [pq.LIASSE_UNIQUE];
  if (rang && liasses[rang - 1]) return liasses[rang - 1];
  return p.etat.cases.find((c) => c.etat === "vide")?.liasse ?? liasses[0];
}

export function TourneePaquets({
  paquetInitial,
  liasseInitiale,
}: {
  /** Paquet déjà ouvert par le QR : chargé côté serveur, pas d'attente. */
  paquetInitial: PaquetVue | null;
  liasseInitiale: number | null;
}) {
  const [pending, start] = useTransition();
  const [paquet, setPaquet] = useState<PaquetVue | null>(paquetInitial);
  const [liasse, setLiasse] = useState<string>(paquetInitial ? liasseAProposer(paquetInitial, liasseInitiale) : "");
  const [date, setDate] = useState(auj());
  const [note, setNote] = useState("");
  const [faits, setFaits] = useState(0);
  const [retour, setRetour] = useState<RetourScan | null>(null);
  const cle = useRef(0);
  const file = useRef<Promise<void>>(Promise.resolve());

  const signaler = (ton: RetourScan["ton"], texte: string) => {
    cle.current += 1;
    setRetour({ cle: cle.current, ton, texte });
    bipScan(ton);
    if (ton === "erreur") navigator.vibrate?.([80, 60, 80]);
  };

  const ouvrir = async (code: string, rang: number | null) => {
    const r = await A.lirePaquet(code);
    if (!r.ok) return signaler("erreur", r.error);
    setPaquet(r.paquet);
    // Le QR d'une liasse ouvre directement la bonne : un geste de moins.
    setLiasse(liasseAProposer(r.paquet, rang));
    setNote("");
    signaler("ok", pq.resumeScan(r.paquet.numero, r.paquet.taille, r.paquet.etat));
  };

  const scanner = (brut: string) => {
    const lu = pq.lireScanPaquet(brut);
    if (!lu) return signaler("erreur", "Ce code n'est pas un paquet.");
    // Les lectures s'enchaînent plus vite que le serveur : une à la fois.
    file.current = file.current.then(() => ouvrir(lu.code, lu.rang)).catch(() => {});
  };

  const poser = (etape: "liasse" | "assemble" | "probleme") => {
    if (!paquet) return;
    start(async () => {
      const r = await A.relever({ code: paquet.code, etape, liasse, note, date });
      if (!r.ok) {
        signaler("erreur", r.error);
        return void toast.error(r.error);
      }
      setPaquet(r.paquet);
      setFaits((n) => n + 1);
      setNote("");
      signaler(etape === "probleme" ? "deja" : "ok", r.message);
      // On avance tout seul sur la première liasse encore sans nouvelle.
      setLiasse(liasseAProposer(r.paquet, null));
    });
  };

  const etat = paquet?.etat;

  return (
    <div className="space-y-3">
      <ScannerQr
        onCode={scanner}
        placeholder="Scanner ou taper PQ-2026-000145"
        autoCamera
        occupe={pending}
        retour={retour}
        compteur={`${faits} relevé${faits > 1 ? "s" : ""} aujourd'hui`}
      />

      {date !== auj() && (
        <div className="rounded-xl bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-900">
          Vous relevez au {date.split("-").reverse().join("/")}, pas à aujourd&apos;hui.
        </div>
      )}

      {!paquet ? (
        <div className="rounded-2xl bg-white px-4 py-6 text-center text-sm text-slate-600">
          Scannez l&apos;étiquette d&apos;une liasse. Rien n&apos;est obligatoire : ce que vous ne relevez pas reste
          simplement « sans nouvelle », et la production continue.
        </div>
      ) : (
        <>
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-black">{paquet.numero}</span>
              <span className="text-sm font-bold text-slate-500">
                {paquet.ofNumber}
                {paquet.taille ? ` · T. ${paquet.taille}` : ""} · {paquet.qte} pcs
              </span>
            </div>
            <div className="text-sm text-slate-500">
              {paquet.modele}
              {paquet.couleur ? ` · ${paquet.couleur}` : ""} — pièces {paquet.pieceDebut} à {paquet.pieceFin}
            </div>
            {paquet.statut !== "actif" && (
              <div className="mt-2 rounded-lg bg-red-100 px-3 py-2 text-sm font-semibold text-red-900">
                Paquet annulé : {paquet.motifAnnulation || "sa fiche de coupe a été annulée"}.
              </div>
            )}

            <div className="mt-3 grid grid-cols-2 gap-1.5">
              {etat!.cases.map((c) => (
                <button
                  key={c.liasse}
                  type="button"
                  disabled={pending || etat!.assemble || paquet.statut !== "actif"}
                  onClick={() => setLiasse(c.liasse)}
                  className={`rounded-xl px-3 py-2.5 text-left ${
                    c.liasse === liasse ? "ring-2 ring-slate-900" : ""
                  } ${c.etat === "fait" ? "bg-emerald-100" : c.etat === "probleme" ? "bg-amber-100" : "bg-slate-100"}`}
                >
                  <div className="truncate text-sm font-bold">{c.liasse}</div>
                  <div className="text-[11px] text-slate-600">
                    {c.etat === "fait" ? `✓ ${c.le}` : c.etat === "probleme" ? `⚠ ${c.note || "problème"}` : "sans nouvelle"}
                  </div>
                </button>
              ))}
            </div>

            {etat!.assemble ? (
              <div className="mt-3 rounded-xl bg-emerald-600 px-4 py-3 text-center font-bold text-white">
                ✓ Paquet assemblé le {etat!.assembleLe.split("-").reverse().join("/")} par {etat!.assemblePar}
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                <button
                  type="button"
                  disabled={pending || paquet.statut !== "actif"}
                  onClick={() => poser("liasse")}
                  className="w-full rounded-xl bg-slate-900 py-4 text-lg font-black text-white disabled:opacity-40"
                >
                  ✓ {liasse} — finie
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={pending || paquet.statut !== "actif"}
                    onClick={() => poser("assemble")}
                    className="flex-1 rounded-xl bg-emerald-600 py-3 font-bold text-white disabled:opacity-40"
                  >
                    🧵 Paquet assemblé
                  </button>
                  <button
                    type="button"
                    disabled={pending || paquet.statut !== "actif"}
                    onClick={() => {
                      if (!note.trim()) return void toast.error("Dites en deux mots ce qui ne va pas.");
                      poser("probleme");
                    }}
                    className="flex-1 rounded-xl bg-amber-500 py-3 font-bold text-white disabled:opacity-40"
                  >
                    ⚠ Problème
                  </button>
                </div>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Note (2 pièces manquent, défaut…)"
                  className="w-full rounded-xl border-2 border-slate-200 px-3 py-2.5 text-base"
                />
              </div>
            )}
          </div>

          <details className="rounded-2xl bg-white p-4 text-sm shadow-sm">
            <summary className="cursor-pointer font-semibold">Relever un autre jour</summary>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value || auj())}
              className="mt-2 w-full rounded-xl border-2 border-slate-200 px-3 py-2.5 text-base"
            />
            <p className="mt-1 text-xs text-slate-500">
              Si vous n&apos;avez pas pu passer hier, mettez la date d&apos;hier : le relevé portera ce jour-là.
            </p>
          </details>
        </>
      )}
    </div>
  );
}
