"use client";

import { useEffect, useState } from "react";

/* Veille de version, présente sur toutes les pages.
 *
 * Après un déploiement, un onglet resté ouvert (la GPAO tourne toute la
 * journée sans changer de page) appelle encore les actions serveur de
 * l'ancienne version : le serveur ne les connaît plus, et les saisies sont
 * perdues. La veille relève la version en ligne ; si elle a changé :
 *   - onglet en arrière-plan, ou qui revient au premier plan → on recharge
 *     tout de suite (personne n'est en train de taper) ;
 *   - sinon → un bandeau demande de recharger, sans couper une frappe. */
const INTERVALLE_MS = 60_000;

export function VeilleVersion({ version }: { version: string }) {
  const [perimee, setPerimee] = useState(false);

  useEffect(() => {
    if (!version) return;
    let arret = false;
    let vue = false;
    const verifier = async () => {
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const { v } = (await res.json()) as { v?: string };
        if (arret || !v || v === version) return;
        vue = true;
        if (document.hidden) window.location.reload();
        else setPerimee(true);
      } catch {
        /* réseau coupé ou session expirée : on réessaie au tour suivant */
      }
    };
    const auRetour = () => {
      if (document.hidden) return;
      if (vue) window.location.reload();
      else void verifier();
    };
    const t = setInterval(() => void verifier(), INTERVALLE_MS);
    document.addEventListener("visibilitychange", auRetour);
    return () => {
      arret = true;
      clearInterval(t);
      document.removeEventListener("visibilitychange", auRetour);
    };
  }, [version]);

  if (!perimee) return null;
  return (
    <div
      role="alert"
      className="fixed inset-x-0 top-0 z-[100] flex flex-wrap items-center justify-center gap-3 bg-amber-500 px-4 py-2.5 text-center text-sm font-semibold text-amber-950 shadow-lg print:hidden"
    >
      Une nouvelle version de PilotPro est en ligne — rechargez la page, sinon vos prochaines saisies ne seront pas
      enregistrées.
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-md bg-amber-950 px-3 py-1 text-white hover:bg-amber-900"
      >
        Recharger
      </button>
    </div>
  );
}
