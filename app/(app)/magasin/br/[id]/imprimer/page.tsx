import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth/server";
import { BoutonImprimer } from "@/components/shared/bouton-imprimer";
import { CONTROLES_BR } from "@/lib/domain/aval";
import { getBrImpression } from "@/lib/services/aval";

const nb = new Intl.NumberFormat("fr-FR");
const dateFr = (iso: string | null | undefined) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split("-").reverse().join("/") : iso || "—");

/* Bon de réception façonnier — le document remis et signé à la réception.
 * Page normale : l'impression du navigateur produit le PDF. */
export default async function BrImprimerPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const d = await getBrImpression(Number(id));
  if (!d) notFound();
  const { br, commande: c } = d;
  const controle = CONTROLES_BR.find((x) => x.value === br.controle) ?? CONTROLES_BR[0];
  const qte = c?.qte ?? 0;
  const reste = Math.max(0, qte - d.cumulOk);

  return (
    <div className="mx-auto max-w-3xl bg-white p-8 text-[12px] text-neutral-900 print:p-0">
      <style>{`@media print { .no-print { display: none !important } @page { margin: 12mm; size: A4 portrait } }`}</style>
      <div className="no-print mb-4 flex items-center gap-2">
        <BoutonImprimer label="Imprimer / PDF le bon" />
        <Link href="/magasin?onglet=receptions" className="rounded-md border px-3 py-1.5 text-xs font-semibold">
          ← Retour au magasin
        </Link>
      </div>

      <div className="flex items-start justify-between border-b-2 border-neutral-900 pb-3">
        <div>
          <div className="text-xl font-extrabold tracking-tight">DBS FASHION</div>
          <div className="text-[11px] uppercase tracking-widest text-neutral-500">Magasin produits finis</div>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold">BON DE RÉCEPTION</div>
          <div className="text-[15px] font-extrabold">{br.numero}</div>
          <div className="text-[11px] text-neutral-500">
            Reçu le {dateFr(br.date)} · réception {d.rang} / {d.total} de la commande
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded border border-neutral-300 px-3 py-2">
          <div className="text-[9.5px] font-bold uppercase text-neutral-500">Façonnier</div>
          <div className="text-[15px] font-bold">{br.faconnier || "—"}</div>
        </div>
        <div className="rounded border border-neutral-300 px-3 py-2">
          <div className="text-[9.5px] font-bold uppercase text-neutral-500">Commande</div>
          <div className="text-[15px] font-bold">
            {c?.ofNumber ?? "—"} · {c?.modele ?? ""}
          </div>
          <div className="text-[11px] text-neutral-600">
            {d.client}
            {c?.refArticle ? ` · réf ${c.refArticle}` : ""}
            {c?.couleur ? ` · ${c.couleur}` : ""}
          </div>
        </div>
      </div>

      <table className="mt-4 w-full border-collapse text-[12px]">
        <thead>
          <tr className="border-y border-neutral-400 bg-neutral-100">
            <th className="py-1.5 pl-2 text-left">Cette réception</th>
            <th className="py-1.5 text-right">Reçu</th>
            <th className="py-1.5 text-right">Conforme (entré au stock)</th>
            <th className="py-1.5 pr-2 text-right">Non conforme</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-neutral-200">
            <td className="py-2 pl-2">
              Contrôle : <b>{controle.label}</b>
            </td>
            <td className="py-2 text-right text-[15px] font-bold tabular-nums">{nb.format(br.qteRecue)}</td>
            <td className="py-2 text-right text-[15px] font-bold tabular-nums">{nb.format(br.qteOk)}</td>
            <td className="py-2 pr-2 text-right text-[15px] font-bold tabular-nums">{br.qteNc ? nb.format(br.qteNc) : "—"}</td>
          </tr>
        </tbody>
      </table>

      <table className="mt-3 w-full border-collapse text-[11.5px]">
        <thead>
          <tr className="border-y border-neutral-400 bg-neutral-100">
            <th className="py-1.5 pl-2 text-left">Situation de la commande après ce bon</th>
            <th className="py-1.5 text-right">Commandé</th>
            <th className="py-1.5 text-right">Reçu cumulé</th>
            <th className="py-1.5 text-right">Conforme cumulé</th>
            <th className="py-1.5 text-right">NC cumulé</th>
            <th className="py-1.5 pr-2 text-right">Reste à livrer par le façonnier</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="py-2 pl-2 text-neutral-500">{c?.ofNumber}</td>
            <td className="py-2 text-right tabular-nums">{nb.format(qte)}</td>
            <td className="py-2 text-right tabular-nums">{nb.format(d.cumulRecu)}</td>
            <td className="py-2 text-right tabular-nums">{nb.format(d.cumulOk)}</td>
            <td className="py-2 text-right tabular-nums">{nb.format(d.cumulNc)}</td>
            <td className={`py-2 pr-2 text-right font-bold tabular-nums ${reste ? "text-red-700" : ""}`}>{nb.format(reste)}</td>
          </tr>
        </tbody>
      </table>

      {br.note && (
        <div className="mt-3 rounded border border-neutral-300 px-3 py-2">
          <div className="text-[9.5px] font-bold uppercase text-neutral-500">Observations</div>
          {br.note}
        </div>
      )}

      <div className="mt-10 grid grid-cols-2 gap-8 text-[11px]">
        {["Magasin DBS — nom, date, signature", "Façonnier — nom, date, signature"].map((l) => (
          <div key={l}>
            <div className="font-semibold text-neutral-500">{l}</div>
            <div className="mt-1 h-16 rounded border border-dashed border-neutral-400" />
          </div>
        ))}
      </div>
      <div className="mt-6 border-t border-neutral-300 pt-2 text-[10.5px] text-neutral-500">
        Document généré par PilotPro — DBS Fashion. Les pièces non conformes restent à la charge du façonnier jusqu&apos;à
        leur retouche ou leur mise au rebut.
      </div>
    </div>
  );
}
