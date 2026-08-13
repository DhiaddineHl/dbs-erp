import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { STATUTS_BL, type StatutBl } from "@/lib/domain/aval";
import { getBl } from "@/lib/services/aval";
import { BoutonImprimer } from "@/components/shared/bouton-imprimer";

const nb = new Intl.NumberFormat("fr-FR");
const eur = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateFr = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split("-").reverse().join("/") : iso || "—");

/* Bon de livraison — le document qui accompagne physiquement la marchandise.
 * Il est rendu comme une page normale : l'impression du navigateur produit le
 * PDF, sans fenêtre construite à la main comme dans l'application d'origine. */
export default async function BlImprimerPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const b = await getBl(Number(id));
  if (!b) notFound();

  const s = STATUTS_BL[b.statut as StatutBl] ?? STATUTS_BL.draft;
  const chiffre = b.lignes.some((l) => l.prixUnitaire > 0);

  return (
    <div className="mx-auto max-w-4xl bg-white p-8 text-[13px] text-neutral-900 print:p-0">
      <style>{`@media print { .no-print { display: none !important } @page { margin: 14mm } }`}</style>

      <div className="no-print mb-4 flex items-center gap-2">
        <BoutonImprimer />
        <a href="/bl" className="rounded-md border px-3 py-1.5 text-xs font-semibold">
          ← Retour aux bons de livraison
        </a>
      </div>

      <div className="flex items-start justify-between border-b-2 border-neutral-900 pb-3">
        <div>
          <div className="text-xl font-extrabold tracking-tight">DBS FASHION</div>
          <div className="text-[11px] uppercase tracking-widest text-neutral-500">Confection export</div>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold">BON DE LIVRAISON</div>
          <div className="text-[12px]">
            {b.numero} · {dateFr(b.date)}
          </div>
          <div className="text-[11px] text-neutral-500">{s.label}</div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <div className="rounded border border-neutral-300 px-3 py-2">
          <div className="text-[9.5px] font-bold uppercase text-neutral-500">Livré à</div>
          <div className="text-[14px] font-bold">{b.clientNom}</div>
          {b.adresseLivraison && <div className="mt-0.5 whitespace-pre-line text-[12px]">{b.adresseLivraison}</div>}
        </div>
        <div className="rounded border border-neutral-300 px-3 py-2">
          <div className="text-[9.5px] font-bold uppercase text-neutral-500">Transport</div>
          <div className="text-[14px] font-bold">{b.transporteur || "—"}</div>
          <div className="mt-0.5 text-[12px] text-neutral-500">
            {b.lignes.length} ligne(s) · {nb.format(b.totalQte)} pièces
          </div>
        </div>
      </div>

      <table className="mt-5 w-full border-collapse text-[12px]">
        <thead>
          <tr className="border-y border-neutral-300 bg-neutral-100">
            <th className="py-1.5 pl-1 text-left">OF</th>
            <th className="py-1.5 text-left">Modèle</th>
            <th className="py-1.5 text-left">Référence</th>
            <th className="py-1.5 text-left">Couleur</th>
            <th className="py-1.5 pr-1 text-right">Quantité</th>
            {chiffre && (
              <>
                <th className="py-1.5 pr-1 text-right">P.U. HT</th>
                <th className="py-1.5 pr-1 text-right">Montant HT</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {b.lignes.map((l) => (
            <tr key={l.id} className="border-b border-neutral-200">
              <td className="py-1.5 pl-1 font-semibold">{l.of}</td>
              <td className="py-1.5">{l.modele}</td>
              <td className="py-1.5">{l.refArticle || "—"}</td>
              <td className="py-1.5">{l.couleur || "—"}</td>
              <td className="py-1.5 pr-1 text-right font-bold tabular-nums">{nb.format(l.qteLivree)}</td>
              {chiffre && (
                <>
                  <td className="py-1.5 pr-1 text-right tabular-nums">{eur.format(l.prixUnitaire)} €</td>
                  <td className="py-1.5 pr-1 text-right font-semibold tabular-nums">{eur.format(l.montant)} €</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-neutral-900">
            <th colSpan={4} className="py-2 pl-1 text-left uppercase">
              Total
            </th>
            <td className="py-2 pr-1 text-right text-[15px] font-extrabold tabular-nums">{nb.format(b.totalQte)}</td>
            {chiffre && (
              <>
                <td />
                <td className="py-2 pr-1 text-right text-[15px] font-extrabold tabular-nums">
                  {eur.format(b.totalHt)} €
                </td>
              </>
            )}
          </tr>
        </tfoot>
      </table>

      {b.note && (
        <div className="mt-3 rounded border border-neutral-300 bg-neutral-50 px-3 py-2 text-[12px]">
          <b>Observations :</b> {b.note}
        </div>
      )}

      <div className="mt-10 grid grid-cols-2 gap-8 text-[11px]">
        {["Pour DBS Fashion", "Réception client — nom, date et signature"].map((l) => (
          <div key={l}>
            <div className="font-semibold text-neutral-500">{l}</div>
            <div className="mt-1 h-16 rounded border border-dashed border-neutral-400" />
          </div>
        ))}
      </div>

      <div className="mt-6 border-t border-neutral-300 pt-2 text-[10.5px] text-neutral-500">
        {b.statut === "draft"
          ? "⚠ Brouillon — ce bon n'a pas encore été émis."
          : "Les marchandises voyagent aux risques et périls du destinataire. Réserves à formuler à la réception."}
      </div>
    </div>
  );
}
