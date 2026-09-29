"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ScannerQr } from "@/components/shared/scanner-qr";
import * as A from "@/lib/actions/rouleaux";
import { lireScan } from "@/lib/domain/rouleau";

const nb = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

type Inv = {
  id: number;
  numero: string;
  zone: string;
  attendus: number;
  trouves: number;
  manquants: number;
  inconnus: number;
  ecarts: number;
  scans: { id: number; code: string; connu: boolean; metrage: number | null; emplacement: string }[];
};

export function OuvrirInventaire() {
  const router = useRouter();
  const [zone, setZone] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="mt-4 space-y-3 rounded-2xl bg-white p-4">
      <div className="text-xl font-extrabold">Nouvel inventaire</div>
      <p className="text-sm text-slate-600">Zone facultative (ex. A) : vide = tout le magasin.</p>
      <input value={zone} onChange={(e) => setZone(e.target.value.toUpperCase())} placeholder="Zone" className="w-full rounded-2xl border border-slate-300 px-3 py-3 text-lg" />
      <button
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await A.ouvrirInventaire({ zone });
            if (!r.ok) return void toast.error(r.error);
            toast.success(`Inventaire ${r.numero} ouvert`);
            router.refresh();
          })
        }
        className="w-full rounded-2xl bg-emerald-600 py-4 text-lg font-extrabold text-white disabled:bg-slate-300"
      >
        Ouvrir l&apos;inventaire
      </button>
    </div>
  );
}

export function InventaireMobile({ inventaire: inv, autres }: { inventaire: Inv; autres: { id: number; numero: string; zone: string }[] }) {
  const router = useRouter();
  const [emp, setEmp] = useState("");
  const [dernier, setDernier] = useState<{ code: string; connu: boolean; deja: boolean; attendu: number | null; theorique: string } | null>(null);
  const [metrage, setMetrage] = useState("");
  const [pending, start] = useTransition();

  const enregistrer = (scan: string, m?: string) =>
    start(async () => {
      const r = await A.scannerInventaire({ inventaireId: inv.id, scan, metrage: m, emplacement: emp });
      if (!r.ok) {
        navigator.vibrate?.([80, 60, 80]);
        return void toast.error(r.error);
      }
      navigator.vibrate?.(r.connu ? 60 : [80, 60, 80]);
      setDernier({ code: r.code, connu: r.connu, deja: r.deja, attendu: r.attendu, theorique: r.emplacementTheorique });
      if (m == null) setMetrage("");
      router.refresh();
    });

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-black">{inv.numero}</h1>
        <span className="text-sm text-slate-600">{inv.zone ? `zone ${inv.zone}` : "tout le magasin"}</span>
      </div>
      <div className="grid grid-cols-4 gap-1.5 text-center">
        <Compteur l="Trouvés" v={`${inv.trouves}/${inv.attendus}`} />
        <Compteur l="Manquants" v={inv.manquants} alerte={inv.manquants > 0} />
        <Compteur l="Inconnus" v={inv.inconnus} alerte={inv.inconnus > 0} />
        <Compteur l="Écarts" v={inv.ecarts} alerte={inv.ecarts > 0} />
      </div>

      <div className={`rounded-2xl px-4 py-3 text-center text-lg font-extrabold ${emp ? "bg-slate-900 text-white" : "bg-amber-100 text-amber-900"}`}>
        {emp ? `📍 Rayon ${emp}` : "Scannez d'abord l'étiquette du rayon"}
      </div>

      <ScannerQr
        occupe={pending}
        placeholder="Rayon ou rouleau"
        onCode={(brut) => {
          const lu = lireScan(brut);
          if (lu?.type === "emplacement") {
            setEmp(lu.code);
            navigator.vibrate?.(40);
            return;
          }
          enregistrer(brut);
        }}
      />

      {dernier && (
        <div className={`space-y-2 rounded-2xl p-4 ${dernier.connu ? "bg-white" : "bg-red-50"}`}>
          <div className="flex justify-between">
            <span className="font-mono text-xl font-black">{dernier.code}</span>
            <span className="text-sm font-bold">{dernier.deja ? "déjà scanné (mis à jour)" : dernier.connu ? "✔ compté" : "✗ inconnu"}</span>
          </div>
          {dernier.connu ? (
            <div className="text-sm text-slate-600">
              Attendu {dernier.attendu != null ? nb.format(dernier.attendu) : "—"} m · rangé en théorie en {dernier.theorique || "—"}
              {emp && dernier.theorique && dernier.theorique !== emp && <b className="text-amber-700"> · mal rangé</b>}
            </div>
          ) : (
            <div className="text-sm text-red-900">Ce rouleau n&apos;existe pas dans l&apos;ERP : mettez-le de côté.</div>
          )}
          <div className="flex gap-2">
            <input
              value={metrage}
              onChange={(e) => setMetrage(e.target.value.replace(/[^\d.,]/g, ""))}
              inputMode="decimal"
              placeholder="Métrage constaté (facultatif)"
              className="min-w-0 flex-1 rounded-2xl border border-slate-300 px-3 py-3"
            />
            <button disabled={!metrage || pending} onClick={() => enregistrer(dernier.code, metrage)} className="rounded-2xl bg-slate-900 px-4 font-bold text-white disabled:bg-slate-300">
              OK
            </button>
          </div>
        </div>
      )}

      <div>
        <div className="mb-1 text-xs font-bold uppercase text-slate-500">Derniers scans</div>
        <div className="divide-y rounded-2xl bg-white text-sm">
          {inv.scans.length === 0 && <div className="px-4 py-4 text-center text-slate-500">Aucun rouleau scanné.</div>}
          {inv.scans.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-2 px-4 py-2">
              <span className={`font-mono font-bold ${s.connu ? "" : "text-red-700"}`}>{s.code}</span>
              <span className="text-xs text-slate-500">
                {s.emplacement || "—"}
                {s.metrage != null ? ` · ${nb.format(s.metrage)} m` : ""}
              </span>
              <button
                onClick={() =>
                  start(async () => {
                    const r = await A.supprimerScanInventaire(s.id);
                    if (!r.ok) return void toast.error(r.error);
                    router.refresh();
                  })
                }
                className="rounded-lg px-2 py-1 text-slate-400"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>
      {autres.length > 0 && (
        <div className="text-sm text-slate-600">
          Autres inventaires ouverts :{" "}
          {autres.map((o) => (
            <Link key={o.id} href={`/m/tissu/inventaire?id=${o.id}`} className="mr-2 font-semibold underline">
              {o.numero}
              {o.zone ? ` (${o.zone})` : ""}
            </Link>
          ))}
        </div>
      )}
      <p className="text-xs text-slate-500">La clôture et les corrections se font au bureau (Magasin tissu → Inventaires).</p>
    </div>
  );
}

function Compteur({ l, v, alerte }: { l: string; v: number | string; alerte?: boolean }) {
  return (
    <div className={`rounded-xl px-1 py-2 ${alerte ? "bg-amber-100" : "bg-white"}`}>
      <div className="text-[10px] font-semibold uppercase text-slate-500">{l}</div>
      <div className="text-lg font-extrabold tabular-nums">{v}</div>
    </div>
  );
}
