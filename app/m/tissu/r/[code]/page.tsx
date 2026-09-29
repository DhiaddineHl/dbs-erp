import Link from "next/link";
import { notFound } from "next/navigation";
import { accesTissuPage } from "@/lib/auth/tissu";
import { destinationLabel, lireScan, sensLabel, statutLabel } from "@/lib/domain/rouleau";
import { commandesPourSortie, getRouleau, listEmplacements } from "@/lib/services/rouleaux";
import { Cadre, Entete, Info, TONS_STATUT, nb } from "../../ui";
import { ActionsRouleau } from "./actions-rouleau";

/* Fiche mobile d'un rouleau — ouverte en scannant son étiquette. Tout ce
 * qu'on sait du rouleau, et les gestes du magasin en gros boutons. */

export const dynamic = "force-dynamic";
export const metadata = { title: "Rouleau tissu", robots: { index: false, follow: false } };

const dateHeure = (iso: string) => {
  if (!iso) return "—";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export default async function RouleauMobilePage({ params }: { params: Promise<{ code: string }> }) {
  const brut = decodeURIComponent((await params).code);
  const code = lireScan(brut)?.code ?? brut;
  const { user, peutSaisir } = await accesTissuPage(`/m/tissu/r/${code}`);
  const fiche = await getRouleau(code);
  if (!fiche) notFound();
  const { rouleau: r, mouvements } = fiche;
  const [commandes, emplacements] = await Promise.all([commandesPourSortie(r.lot.id), listEmplacements()]);
  const st = statutLabel(r.statut);
  const b = r.bilan;
  const u = r.lot.unite;

  return (
    <Cadre retour={{ href: "/m/tissu", label: "Scanner un autre rouleau" }}>
      <Entete utilisateur={user.name} titre="Rouleau" />
      <h1 className="font-mono text-3xl font-black">{r.code}</h1>
      <div className="text-sm text-slate-700">
        {[r.lot.reference, r.lot.couleur, r.lot.codeCouleur].filter(Boolean).join(" · ") || "—"}
        {r.laize != null ? ` · laize ${r.laize} cm` : ""}
      </div>
      <div className="text-xs text-slate-500">
        Lot {r.lot.identifiant}
        {r.lot.lotFournisseur ? ` · lot fourn. ${r.lot.lotFournisseur}` : ""} · {r.reception.client || r.reception.fournisseur || "—"} · {r.reception.numero}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${TONS_STATUT[r.statut] ?? "bg-slate-200"}`}>{st.label}</span>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-bold">📍 {r.emplacement || "non rangé"}</span>
        {r.lot.controle === "refuse" && <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-900">Lot refusé</span>}
      </div>

      <div className="my-4 grid grid-cols-3 gap-2 text-center">
        <Info label="Initial" v={r.metrageInitial} u={u} />
        <Info label="En coupe" v={b.enCoupe} u={u} />
        <Info label="En stock" v={b.disponible} u={u} fort />
      </div>
      {(b.consomme > 0 || b.chute > 0 || b.retour > 0) && (
        <div className="-mt-2 mb-4 text-center text-xs text-slate-600">
          sorti {nb.format(b.sorti)} · revenu {nb.format(b.retour)} · consommé {nb.format(b.consomme)} · chute {nb.format(b.chute)} {u}
        </div>
      )}
      {r.commandes.length > 0 && <div className="mb-3 text-xs text-slate-600">Réservé pour : {r.commandes.map((c) => c.label).join(", ")}</div>}

      <ActionsRouleau
        rouleau={r}
        commandes={commandes}
        emplacements={emplacements.filter((e) => e.actif).map((e) => ({ code: e.code, libelle: e.libelle, zone: e.zone }))}
        peutSaisir={peutSaisir}
      />

      <details className="mt-6" open={mouvements.length <= 6}>
        <summary className="mb-1 cursor-pointer text-xs font-bold uppercase text-slate-500">Historique ({mouvements.length})</summary>
        <div className="divide-y rounded-2xl bg-white text-sm">
          {[...mouvements].reverse().map((m) => (
            <div key={m.id} className={`px-4 py-2 ${m.annule ? "opacity-50" : ""}`}>
              <div className="flex justify-between">
                <span className={`font-bold ${m.annule ? "line-through" : ""}`}>{sensLabel(m.sens)}</span>
                <span className="tabular-nums">
                  {m.sens === "deplacement" ? `${m.valeurAvant || "—"} → ${m.valeurApres}` : m.quantite ? `${nb.format(m.quantite)} ${u}` : ""}
                </span>
              </div>
              <div className="text-xs text-slate-500">
                {dateHeure(m.date)} · {m.par || "—"}
                {m.destination ? ` · ${destinationLabel(m.destination)}` : ""}
                {m.commandeLabel ? ` · ${m.commandeLabel}` : ""}
                {m.motif ? ` · ${m.motif}` : ""}
                {m.sens === "retour_fournisseur" && m.valeurApres ? ` (${m.valeurApres})` : ""}
              </div>
            </div>
          ))}
        </div>
      </details>
      <Link href={`/magtissu/rouleaux/${r.code}`} className="mt-4 block text-center text-sm font-semibold text-slate-600 underline">
        Fiche complète (bureau)
      </Link>
    </Cadre>
  );
}
