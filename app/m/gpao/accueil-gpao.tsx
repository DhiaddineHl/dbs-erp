"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ouvrirJourneeTablette } from "@/lib/actions/saisie-gpao";

type Chaine = {
  id: number;
  nom: string;
  chef: string;
  effectif: number;
  nbOuvrieres: number;
  dernier: { modeleId: number; nbHeures: number } | null;
  journees: { id: number; modele: string; nbHeures: number; cols: number; heuresFaites: number; sortie: number; cloture: boolean }[];
};

const dateLongue = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const decaler = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export function AccueilGpao({
  utilisateur,
  peutSaisir,
  date,
  aujourdhui,
  modeles,
  chaines,
}: {
  utilisateur: string;
  peutSaisir: boolean;
  date: string;
  aujourdhui: string;
  modeles: { id: number; label: string }[];
  chaines: Chaine[];
}) {
  const [ouverte, setOuverte] = useState<number | null>(null);
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto max-w-5xl px-4 pb-16 pt-4">
        <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">DBS Fashion · Saisie production · {utilisateur}</div>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-black">Choisissez la chaîne</h1>
          <div className="ml-auto flex items-center gap-2">
            <Link href={`/m/gpao?date=${decaler(date, -1)}`} className="rounded-xl bg-white px-4 py-3 text-lg font-bold shadow-sm">
              ‹
            </Link>
            <div className="min-w-[230px] rounded-xl bg-white px-4 py-2.5 text-center font-bold capitalize shadow-sm">
              {dateLongue(date)}
              {date === aujourdhui && <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">aujourd&apos;hui</span>}
            </div>
            <Link href={`/m/gpao?date=${decaler(date, 1)}`} className="rounded-xl bg-white px-4 py-3 text-lg font-bold shadow-sm">
              ›
            </Link>
            {date !== aujourdhui && (
              <Link href="/m/gpao" className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white">
                Aujourd&apos;hui
              </Link>
            )}
          </div>
        </div>

        {!peutSaisir && (
          <div className="mb-4 rounded-xl bg-amber-100 px-4 py-3 text-amber-900">
            Ce compte n&apos;a pas le module « GPAO Production » : consultation impossible. Demandez à l&apos;administrateur (Paramètres → rôles).
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {chaines.map((c) => (
            <div key={c.id} className="flex flex-col rounded-2xl bg-white p-4 shadow-sm">
              <div className="flex items-baseline justify-between">
                <div className="text-2xl font-black">{c.nom}</div>
                <div className="text-sm text-slate-500">{c.nbOuvrieres} ouvrière(s)</div>
              </div>
              {c.chef && <div className="text-sm text-slate-500">Chef : {c.chef}</div>}
              <div className="mt-3 flex-1 space-y-2">
                {c.journees.map((j) => (
                  <Link
                    key={j.id}
                    href={peutSaisir ? `/m/gpao/j/${j.id}` : "#"}
                    className={`block rounded-xl border-2 px-3 py-3 ${j.cloture ? "border-slate-200 bg-slate-50" : "border-emerald-500 bg-emerald-50"}`}
                  >
                    <div className="font-bold">{j.modele}</div>
                    <div className="text-sm text-slate-600">
                      sortie saisie {j.heuresFaites}/{j.cols} h · {j.sortie} pcs {j.cloture && "· clôturée"}
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200">
                      <div className="h-full bg-emerald-500" style={{ width: `${(j.heuresFaites / Math.max(1, j.cols)) * 100}%` }} />
                    </div>
                  </Link>
                ))}
              </div>
              {peutSaisir &&
                (ouverte === c.id ? (
                  <Demarrer chaine={c} date={date} modeles={modeles} onAnnuler={() => setOuverte(null)} />
                ) : (
                  <button
                    onClick={() => setOuverte(c.id)}
                    className={`mt-3 w-full rounded-xl py-3 text-base font-extrabold ${c.journees.length ? "bg-slate-100 text-slate-700" : "bg-slate-900 text-white"}`}
                  >
                    {c.journees.length ? "＋ Autre modèle ce jour" : "▶ Démarrer la journée"}
                  </button>
                ))}
            </div>
          ))}
          {chaines.length === 0 && <div className="rounded-2xl bg-white p-6 text-slate-500">Aucune chaîne : créez-les au bureau (GPAO → Chaînes).</div>}
        </div>
      </div>
    </div>
  );
}

function Demarrer({ chaine: c, date, modeles, onAnnuler }: { chaine: Chaine; date: string; modeles: { id: number; label: string }[]; onAnnuler: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [modeleId, setModeleId] = useState(String(c.dernier?.modeleId ?? ""));
  const [heures, setHeures] = useState(String(c.dernier?.nbHeures ?? 8));
  const [effectif, setEffectif] = useState(String(c.effectif || c.nbOuvrieres || ""));
  return (
    <div className="mt-3 space-y-2 rounded-xl bg-slate-50 p-3">
      <label className="block text-sm font-bold text-slate-600">
        Modèle
        <select value={modeleId} onChange={(e) => setModeleId(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-base">
          <option value="">— choisir —</option>
          {modeles.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-sm font-bold text-slate-600">
          Heures de travail
          <input value={heures} onChange={(e) => setHeures(e.target.value)} inputMode="decimal" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-3 text-center text-lg font-bold" />
        </label>
        <label className="block text-sm font-bold text-slate-600">
          Effectif présent
          <input value={effectif} onChange={(e) => setEffectif(e.target.value)} inputMode="numeric" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-3 text-center text-lg font-bold" />
        </label>
      </div>
      {c.nbOuvrieres === 0 && (
        <div className="rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-900">Aucune ouvrière sur cette chaîne : ajoutez-les d&apos;abord au bureau (GPAO → Chaînes).</div>
      )}
      <div className="flex gap-2">
        <button onClick={onAnnuler} className="flex-1 rounded-xl bg-slate-200 py-3 font-bold">
          Annuler
        </button>
        <button
          disabled={pending || !modeleId}
          onClick={() =>
            start(async () => {
              const r = await ouvrirJourneeTablette({ date, chaineId: c.id, modeleId: Number(modeleId), nbHeures: heures, effectif });
              if (!r.ok) return void toast.error(r.error);
              if (r.existait) toast.info("Cette journée existait déjà : elle est rouverte.");
              router.push(`/m/gpao/j/${r.id}`);
            })
          }
          className="flex-[2] rounded-xl bg-emerald-600 py-3 text-lg font-extrabold text-white disabled:bg-slate-300"
        >
          {pending ? "…" : "▶ Démarrer"}
        </button>
      </div>
    </div>
  );
}
