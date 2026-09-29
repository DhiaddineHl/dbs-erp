"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ScannerQr } from "@/components/shared/scanner-qr";
import { deplacerRouleau } from "@/lib/actions/rouleaux";

/** Mode rangement : chaque rouleau scanné est déplacé à cet emplacement. */
export function RangerIci({ emplacement }: { emplacement: string }) {
  const router = useRouter();
  const [actif, setActif] = useState(false);
  const [journal, setJournal] = useState<{ ok: boolean; texte: string }[]>([]);
  if (!actif) {
    return (
      <button onClick={() => setActif(true)} className="w-full rounded-2xl bg-slate-900 py-4 text-lg font-extrabold text-white">
        ⇄ Ranger des rouleaux ici
      </button>
    );
  }
  return (
    <div className="space-y-2 rounded-2xl bg-white p-3">
      <div className="font-bold">Scannez chaque rouleau à ranger en {emplacement}</div>
      <ScannerQr
        onCode={async (brut) => {
          const r = await deplacerRouleau({ code: brut, emplacement, motif: `Rangement en ${emplacement} (scan)` });
          if (r.ok) navigator.vibrate?.(60);
          else navigator.vibrate?.([80, 60, 80]);
          setJournal((j) => [{ ok: r.ok, texte: r.ok ? `✔ ${r.code} rangé` : `✗ ${r.error}` }, ...j].slice(0, 15));
          if (r.ok) router.refresh();
        }}
      />
      {journal.map((l, i) => (
        <div key={i} className={`rounded-xl px-3 py-2 text-sm font-semibold ${l.ok ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-900"}`}>
          {l.texte}
        </div>
      ))}
      <button onClick={() => setActif(false)} className="w-full rounded-2xl bg-slate-200 py-3 font-bold">
        Terminer
      </button>
    </div>
  );
}
