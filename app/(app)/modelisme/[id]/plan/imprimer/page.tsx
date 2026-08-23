import { notFound } from "next/navigation";
import { BoutonImprimer } from "@/components/shared/bouton-imprimer";
import { requireUser } from "@/lib/auth/server";
import * as pc from "@/lib/domain/plan-coupe";
import { contexteCommande, getPlan } from "@/lib/services/plan-coupe";

const nb = new Intl.NumberFormat("fr-FR");
const m2 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const m3 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const dateFr = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split("-").reverse().join("/") : iso || "—");

/* La fiche de matelassage, telle qu'elle descend à l'atelier de coupe.
 *
 * Page normale : l'impression du navigateur produit le PDF, comme pour le bon
 * de réception tissu et le bon de livraison. Elle porte les trois visas —
 * modéliste, chef de coupe, contrôle — parce qu'une fiche de coupe est un
 * document signé : c'est elle qui autorise à entamer le rouleau. */
export default async function FicheMatelassagePage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const commandeId = Number(id);
  if (!Number.isInteger(commandeId)) notFound();

  const [ctx, plan] = await Promise.all([contexteCommande(commandeId), getPlan(commandeId)]);
  if (!ctx) notFound();

  const total = plan ? pc.totalCommande(plan) : 0;
  const auMoinsUneEstimee = plan?.matieres.some(pc.estEstime) ?? false;

  return (
    <div className="mx-auto max-w-4xl bg-white p-8 text-[13px] text-neutral-900 print:p-0">
      <style>{`@media print { .no-print { display: none !important } @page { margin: 12mm } }`}</style>

      <div className="no-print mb-4 flex items-center gap-2">
        <BoutonImprimer label="Imprimer / PDF" />
        <a href={`/modelisme/${commandeId}/plan`} className="rounded-md border px-3 py-1.5 text-xs font-semibold">
          ← Retour au plan
        </a>
      </div>

      <div className="flex items-start justify-between border-b-2 border-neutral-900 pb-3">
        <div>
          <div className="text-xl font-extrabold tracking-tight">DBS FASHION</div>
          <div className="text-[11px] uppercase tracking-widest text-neutral-500">Bureau modélisme</div>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold">FICHE DE MATELASSAGE</div>
          <div className="text-[12px]">
            {ctx.of || `commande n°${ctx.id}`} · {ctx.modele}
          </div>
          <div className="text-[11px] text-neutral-500">
            Édité le {dateFr(new Date().toISOString().slice(0, 10))}
            {plan?.par ? ` · préparé par ${plan.par}${plan.date ? ` le ${dateFr(plan.date)}` : ""}` : ""}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <div className="rounded border border-neutral-300 px-3 py-2">
          <div className="text-[9.5px] font-bold uppercase text-neutral-500">Commande</div>
          <div className="text-[14px] font-bold">{ctx.modele}</div>
          <div className="mt-0.5 text-[12px]">
            {ctx.refArticle || "sans référence"}
            {ctx.couleur ? ` · ${ctx.couleur}` : ""}
          </div>
          <div className="mt-0.5 text-[12px] text-neutral-500">
            {ctx.client || "sans client"} · {nb.format(ctx.qte)} pièces
            {ctx.estPorteur ? ` · groupe de ${ctx.nbMembres} OF (${nb.format(ctx.qteGroupe)} pcs)` : ""}
          </div>
        </div>
        <div className="rounded border border-neutral-300 px-3 py-2">
          <div className="text-[9.5px] font-bold uppercase text-neutral-500">Matière</div>
          <div className="text-[14px] font-bold">
            {ctx.tissuRecu > 0 ? `${m2.format(ctx.tissuRecu)} m reçus` : "Réception non saisie"}
          </div>
          <div className="mt-0.5 text-[12px]">
            Conso prévue {ctx.consoTheo ? `${m3.format(ctx.consoTheo)} m/pc` : "—"}
          </div>
          <div className="mt-0.5 text-[12px] text-neutral-500">
            Conso réelle {ctx.consoReel ? `${m3.format(ctx.consoReel)} m/pc` : "non reportée"}
          </div>
        </div>
      </div>

      {!plan ? (
        <div className="mt-6 rounded border border-neutral-300 px-4 py-6 text-center text-neutral-500">
          Aucun plan de coupe n&apos;a encore été préparé pour cette commande.
        </div>
      ) : (
        <>
          {/* ── la commande à couper ── */}
          <table className="mt-5 w-full border-collapse text-[11px]">
            <tbody>
              <tr className="border-y border-neutral-300 bg-neutral-100">
                <th className="border border-neutral-300 px-2 py-1 text-left">Commande</th>
                {plan.sizes.map((s) => (
                  <th key={s} className="border border-neutral-300 px-2 py-1">
                    {s}
                  </th>
                ))}
                <th className="border border-neutral-300 px-2 py-1">Total</th>
              </tr>
              <tr>
                <td className="border border-neutral-300 px-2 py-1 font-semibold">Quantité</td>
                {plan.sizes.map((s) => (
                  <td key={s} className="border border-neutral-300 px-2 py-1 text-center tabular-nums">
                    {nb.format(plan.ordre[s] ?? 0)}
                  </td>
                ))}
                <td className="border border-neutral-300 px-2 py-1 text-center font-bold tabular-nums">
                  {nb.format(total)}
                </td>
              </tr>
            </tbody>
          </table>

          {/* ── une section par matière ── */}
          {plan.matieres.map((m, i) => {
            const coupe = pc.piecesParTaille(m, plan.sizes);
            const metres = pc.consoTotale(m);
            const pieces = pc.piecesTotales(m, plan.sizes);
            const estime = pc.estEstime(m);
            return (
              <div key={i} className="mt-5 break-inside-avoid">
                <div className="border border-b-0 border-neutral-400 bg-neutral-100 px-2 py-1 text-[12px] font-bold">
                  {m.nom} — laise {m.laise ? `${nb.format(m.laise)} cm` : "?"}
                </div>
                <table className="w-full border-collapse text-[11px]">
                  <thead>
                    <tr className="bg-neutral-100">
                      <th className="border border-neutral-300 px-2 py-1 text-left">Tracé</th>
                      <th className="border border-neutral-300 px-2 py-1">Long.</th>
                      <th className="border border-neutral-300 px-2 py-1">Plis</th>
                      {plan.sizes.map((s) => (
                        <th key={s} className="border border-neutral-300 px-2 py-1">
                          {s}
                        </th>
                      ))}
                      <th className="border border-neutral-300 px-2 py-1">Conso</th>
                    </tr>
                  </thead>
                  <tbody>
                    {m.traces.map((t, j) => (
                      <tr key={j}>
                        <td className="border border-neutral-300 px-2 py-1 font-semibold">{t.nom || `Tracé ${j + 1}`}</td>
                        <td className="border border-neutral-300 px-2 py-1 text-center tabular-nums">
                          {t.longueur ? `${m2.format(t.longueur)}${t.estime ? " *" : ""}` : "—"}
                        </td>
                        <td className="border border-neutral-300 px-2 py-1 text-center tabular-nums">{t.plis || 0}</td>
                        {plan.sizes.map((s) => (
                          <td key={s} className="border border-neutral-300 px-2 py-1 text-center tabular-nums">
                            {t.qty[s] || ""}
                          </td>
                        ))}
                        <td className="border border-neutral-300 px-2 py-1 text-center tabular-nums">
                          {m2.format(t.longueur * t.plis)}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-neutral-100 font-bold">
                      <td className="border border-neutral-300 px-2 py-1">Coupé</td>
                      <td className="border border-neutral-300 px-2 py-1" />
                      <td className="border border-neutral-300 px-2 py-1 text-center tabular-nums">
                        {m.traces.reduce((a, t) => a + t.plis, 0)}
                      </td>
                      {plan.sizes.map((s) => (
                        <td key={s} className="border border-neutral-300 px-2 py-1 text-center tabular-nums">
                          {nb.format(coupe[s] ?? 0)}
                        </td>
                      ))}
                      <td className="border border-neutral-300 px-2 py-1 text-center tabular-nums">
                        {m2.format(metres)}
                      </td>
                    </tr>
                  </tbody>
                </table>
                <div className="mt-1 text-[10px] italic text-neutral-600">
                  {nb.format(pieces)} pièces · consommation {estime ? "estimée" : "réelle"} {m2.format(metres)} m
                  {m.consoPrevue ? ` · prévu ${m3.format(m.consoPrevue)} m/pc` : ""}
                  {m.perteBout ? ` · perte bout de matelas ${m2.format(m.perteBout)} m` : ""}
                </div>
              </div>
            );
          })}

          {auMoinsUneEstimee && (
            <div className="mt-4 text-[10px] italic text-neutral-600">
              * longueur estimée — à confirmer après placement. Le métrage total n&apos;est pas définitif tant
              qu&apos;une longueur porte cette marque.
            </div>
          )}
        </>
      )}

      {/* ── visas ── */}
      <div className="mt-16 flex justify-between text-[11px]">
        {["Modéliste", "Chef de coupe", "Visa"].map((r) => (
          <div key={r} className="w-[28%] border-t border-neutral-500 pt-1 text-center">
            {r}
          </div>
        ))}
      </div>
    </div>
  );
}
