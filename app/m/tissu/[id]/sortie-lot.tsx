"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import * as A from "@/lib/actions/tissu";

const nb = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

type Lot = {
  id: number;
  identifiant: string;
  client: string;
  reference: string;
  couleur: string;
  laize: number | null;
  unite: string;
  controle: string;
  disponible: number;
  recu: number;
  consomme: number;
};
type Cmd = { id: number; label: string; affecte: number; sorti: number; reste: number };

const CONTROLE: Record<string, { label: string; cls: string }> = {
  "": { label: "Non contrôlé", cls: "bg-amber-100 text-amber-900" },
  conforme: { label: "✓ Conforme", cls: "bg-emerald-100 text-emerald-900" },
  reserve: { label: "Accepté sous réserve", cls: "bg-amber-100 text-amber-900" },
  refuse: { label: "✗ Refusé", cls: "bg-red-100 text-red-900" },
};

/* Sortie vers la coupe, au téléphone : la commande réservée est déjà choisie,
 * le métrage proposé est ce qu'il lui reste à sortir de ce lot. */
export function SortieLot({
  utilisateur,
  peutSaisir,
  lot,
  commandes,
  derniers,
}: {
  utilisateur: string;
  peutSaisir: boolean;
  lot: Lot;
  commandes: Cmd[];
  derniers: { id: number; quantite: number; label: string; date: string; par: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const premiere = commandes.find((c) => c.reste > 0) ?? commandes[0];
  const [cmd, setCmd] = useState<number | null>(premiere?.id ?? null);
  const choisie = commandes.find((c) => c.id === cmd);
  const propose = (c?: Cmd) => (c ? Math.min(lot.disponible, c.reste || lot.disponible) : lot.disponible);
  const [qte, setQte] = useState(String(Math.round(propose(premiere) * 100) / 100 || ""));
  const [fait, setFait] = useState<string | null>(null);
  const ctl = CONTROLE[lot.controle] ?? CONTROLE[""];
  const valeur = Number(qte.replace(",", ".")) || 0;

  if (fait) {
    return (
      <Cadre>
        <div className="flex min-h-[70vh] flex-col items-center justify-center text-center">
          <div className="flex size-24 items-center justify-center rounded-full bg-emerald-100 text-5xl">✔</div>
          <h1 className="mt-5 text-2xl font-extrabold">{fait}</h1>
          <p className="mt-2 text-sm text-slate-600">
            Lot {lot.identifiant} — reste {nb.format(Math.max(0, lot.disponible))} {lot.unite}
          </p>
          <button onClick={() => setFait(null)} className="mt-8 w-full rounded-2xl bg-slate-900 py-4 text-lg font-bold text-white">
            OK
          </button>
        </div>
      </Cadre>
    );
  }

  return (
    <Cadre>
      <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">DBS Fashion · Magasin tissu · {utilisateur}</div>
      <h1 className="font-mono text-4xl font-black">{lot.identifiant}</h1>
      <div className="text-sm text-slate-700">
        {lot.client || "—"} · {[lot.reference, lot.couleur].filter(Boolean).join(" · ")}
        {lot.laize != null ? ` · laize ${lot.laize} cm` : ""}
      </div>
      <span className={`mt-2 inline-block rounded-full px-3 py-1 text-xs font-bold ${ctl.cls}`}>{ctl.label}</span>

      <div className="my-4 grid grid-cols-3 gap-2 text-center">
        <Info label="Reçu" v={lot.recu} u={lot.unite} />
        <Info label="Sorti" v={lot.consomme} u={lot.unite} />
        <Info label="En stock" v={lot.disponible} u={lot.unite} fort />
      </div>

      {lot.controle === "refuse" && (
        <div className="mb-3 rounded-xl bg-red-100 px-3 py-2 text-sm text-red-900">Lot refusé au contrôle : ne pas le couper sans accord.</div>
      )}

      {!peutSaisir ? (
        <div className="rounded-xl bg-white px-4 py-6 text-center text-sm text-slate-600">Consultation seule : ce compte ne peut pas sortir de tissu.</div>
      ) : lot.disponible <= 0 ? (
        <div className="rounded-xl bg-white px-4 py-6 text-center text-sm text-slate-600">Lot épuisé.</div>
      ) : (
        <>
          <div className="mb-2 text-sm font-bold text-slate-700">1 · Pour quelle commande ?</div>
          {commandes.length === 0 ? (
            <div className="mb-3 rounded-xl bg-amber-100 px-3 py-2 text-sm text-amber-900">
              Ce lot n&apos;est réservé à aucune commande : affectez-le d&apos;abord au magasin tissu.
            </div>
          ) : (
            <div className="mb-4 space-y-2">
              {commandes.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setCmd(c.id);
                    setQte(String(Math.round(propose(c) * 100) / 100));
                  }}
                  className={`flex w-full items-center justify-between rounded-2xl border-2 px-4 py-3 text-left ${cmd === c.id ? "border-slate-900 bg-white" : "border-slate-200 bg-white/60"}`}
                >
                  <span className="font-bold">{c.label || `Commande ${c.id}`}</span>
                  <span className="text-xs text-slate-500">
                    réservé {nb.format(c.affecte)} · reste {nb.format(c.reste)} {lot.unite}
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="mb-2 text-sm font-bold text-slate-700">2 · Métrage sorti ({lot.unite})</div>
          <input
            type="text"
            inputMode="decimal"
            value={qte}
            onChange={(e) => setQte(e.target.value.replace(/[^\d.,]/g, ""))}
            onFocus={(e) => e.target.select()}
            className="w-full rounded-2xl border border-slate-200 bg-white py-3 text-center text-5xl font-black tabular-nums"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {choisie && choisie.reste > 0 && (
              <Chip onClick={() => setQte(String(Math.min(choisie.reste, lot.disponible)))}>Reste réservé {nb.format(Math.min(choisie.reste, lot.disponible))}</Chip>
            )}
            <Chip onClick={() => setQte(String(lot.disponible))}>Tout le lot {nb.format(lot.disponible)}</Chip>
          </div>

          <div className="sticky bottom-3 mt-6">
            <button
              disabled={pending || !cmd || valeur <= 0 || valeur > lot.disponible + 0.001}
              onClick={() =>
                start(async () => {
                  const r = await A.sortir({ lotId: lot.id, commandeId: cmd, quantite: String(valeur), motif: "Sortie vers la coupe (scan)" });
                  if (!r.ok) return void toast.error(r.error);
                  router.refresh();
                  setFait(`${nb.format(valeur)} ${lot.unite} sortis`);
                })
              }
              className="w-full rounded-2xl bg-emerald-600 py-4 text-lg font-extrabold text-white shadow-lg disabled:bg-slate-300"
            >
              {pending ? "Enregistrement…" : `✔ Sortir ${nb.format(valeur)} ${lot.unite} vers la coupe`}
            </button>
          </div>
        </>
      )}

      {derniers.length > 0 && (
        <div className="mt-8">
          <div className="mb-1 text-xs font-bold uppercase text-slate-500">Dernières sorties</div>
          <div className="divide-y rounded-2xl bg-white text-sm">
            {derniers.map((m) => (
              <div key={m.id} className="flex justify-between px-4 py-2">
                <span className="truncate">{m.label || "—"}</span>
                <span className="font-semibold tabular-nums">
                  {nb.format(m.quantite)} {lot.unite}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Cadre>
  );
}

function Cadre({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto max-w-md px-4 pb-10 pt-5">{children}</div>
    </div>
  );
}

function Info({ label, v, u, fort }: { label: string; v: number; u: string; fort?: boolean }) {
  return (
    <div className={`rounded-xl px-2 py-2 ${fort ? "bg-slate-900 text-white" : "bg-white"}`}>
      <div className={`text-[10px] font-semibold uppercase ${fort ? "text-white/70" : "text-slate-500"}`}>{label}</div>
      <div className="text-lg font-extrabold tabular-nums">
        {nb.format(v)} <span className="text-xs">{u}</span>
      </div>
    </div>
  );
}

function Chip({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="rounded-full bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white">
      {children}
    </button>
  );
}
