"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import "../../gpao.css";
import { type GpaoState, findJ } from "../../store";
import { TvMode } from "../../tv-mode";

/** L'écran d'atelier tourne sans personne devant : il relit la base
 * régulièrement pour suivre les saisies de la journée en cours. */
const RAFRAICHISSEMENT_MS = 20_000;

export function TvPage({ state, journeeId }: { state: GpaoState; journeeId: number }) {
  const router = useRouter();

  useEffect(() => {
    const t = setInterval(() => router.refresh(), RAFRAICHISSEMENT_MS);
    return () => clearInterval(t);
  }, [router]);

  const journee = findJ(state, journeeId);
  if (!journee) return null;

  return (
    <div className="gp">
      <TvMode state={state} journee={journee} onExit={() => router.push("/gpao_prod")} />
    </div>
  );
}
