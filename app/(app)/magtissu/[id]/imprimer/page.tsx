import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { getPreparation, journalDe } from "@/lib/services/preparation";
import { BoutonImprimer } from "@/components/shared/bouton-imprimer";

const nb = new Intl.NumberFormat("fr-FR");
const m1 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const m3 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

const dateFr = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split("-").reverse().join("/") : iso || "—");

function dateHeure(iso: string | Date) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* Le verdict du contrôle, tel qu'il doit apparaître sur un document signé :
 * « non contrôlé » est une mention à part entière, pas une case vide. */
const CONTROLE: Record<string, { label: string; note: string }> = {
  "": { label: "NON CONTRÔLÉ", note: "Le tissu n'a pas encore été contrôlé — ce bon ne vaut pas acceptation." },
  conforme: { label: "CONFORME", note: "Tissu accepté sans réserve. Le feu tissu est libéré." },
  reserve: { label: "ACCEPTÉ SOUS RÉSERVE", note: "Tissu accepté malgré les observations ci-dessous. Le feu tissu est libéré." },
  refuse: { label: "REFUSÉ", note: "Tissu refusé. La commande reste bloquée en direction technique." },
};

/* Bon de réception tissu — la trace papier d'une entrée en magasin.
 *
 * Comme le bon de livraison, c'est une page normale : l'impression du
 * navigateur produit le PDF. Le document reprend ce que le magasin a saisi et
 * ce que la nomenclature attendait, pour que l'écart de métrage soit lisible
 * sans recalcul, et il porte le journal des mouvements tissu — un bon signé
 * doit pouvoir dire qui a saisi quoi, et quand. */
export default async function BonReceptionTissuPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const commandeId = Number(id);
  if (!Number.isInteger(commandeId)) notFound();

  const [r, journal] = await Promise.all([getPreparation(commandeId), journalDe(commandeId, "tissu")]);
  if (!r) notFound();

  const ctl = CONTROLE[r.tissuControle] ?? CONTROLE[""];
  const recu = r.tissuDateReelle !== "";
  const manque = r.ecartTissu != null && r.ecartTissu < 0;

  return (
    <div className="mx-auto max-w-4xl bg-white p-8 text-[13px] text-neutral-900 print:p-0">
      <style>{`@media print { .no-print { display: none !important } @page { margin: 14mm } }`}</style>

      <div className="no-print mb-4 flex items-center gap-2">
        <BoutonImprimer label="Imprimer / PDF" />
        <a href="/magtissu" className="rounded-md border px-3 py-1.5 text-xs font-semibold">
          ← Retour au magasin tissu
        </a>
      </div>

      <div className="flex items-start justify-between border-b-2 border-neutral-900 pb-3">
        <div>
          <div className="text-xl font-extrabold tracking-tight">DBS FASHION</div>
          <div className="text-[11px] uppercase tracking-widest text-neutral-500">Magasin tissu</div>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold">BON DE RÉCEPTION TISSU</div>
          <div className="text-[12px]">
            {r.of || `commande n°${r.id}`}
            {recu ? ` · reçu le ${dateFr(r.tissuDateReelle)}` : " · non réceptionné"}
          </div>
          <div className="text-[11px] text-neutral-500">Édité le {dateFr(new Date().toISOString().slice(0, 10))}</div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <div className="rounded border border-neutral-300 px-3 py-2">
          <div className="text-[9.5px] font-bold uppercase text-neutral-500">Commande</div>
          <div className="text-[14px] font-bold">{r.modele}</div>
          <div className="mt-0.5 text-[12px]">
            {r.refArticle || "sans référence"}
            {r.couleur ? ` · ${r.couleur}` : ""}
          </div>
          <div className="mt-0.5 text-[12px] text-neutral-500">
            {r.client || "sans client"} · {nb.format(r.qte)} pièces
          </div>
        </div>
        <div className="rounded border border-neutral-300 px-3 py-2">
          <div className="text-[9.5px] font-bold uppercase text-neutral-500">Réception</div>
          <div className="text-[14px] font-bold">
            {recu ? `${m1.format(r.tissuRecu)} m reçus` : "En attente"}
          </div>
          <div className="mt-0.5 text-[12px]">Prévue le {dateFr(r.receptTissu)}</div>
          <div className="mt-0.5 text-[12px] text-neutral-500">
            {r.joursRetardReception != null
              ? `⚠ ${r.joursRetardReception} jour(s) de retard sur la date prévue`
              : `Destination : ${r.faconnier || r.chaine || "non assignée"}`}
          </div>
        </div>
      </div>

      <table className="mt-5 w-full border-collapse text-[12px]">
        <thead>
          <tr className="border-y border-neutral-300 bg-neutral-100">
            <th className="py-1.5 pl-1 text-left">Désignation</th>
            <th className="py-1.5 pr-1 text-right">Conso. / pièce</th>
            <th className="py-1.5 pr-1 text-right">Chute</th>
            <th className="py-1.5 pr-1 text-right">Besoin théorique</th>
            <th className="py-1.5 pr-1 text-right">Métrage reçu</th>
            <th className="py-1.5 pr-1 text-right">Écart</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-neutral-200">
            <td className="py-2 pl-1">
              <b>Tissu — {r.modele}</b>
              {r.couleur && <span className="text-neutral-500"> ({r.couleur})</span>}
            </td>
            <td className="py-2 pr-1 text-right tabular-nums">
              {r.consoTheo == null ? "—" : `${m3.format(r.consoTheo)} m`}
            </td>
            <td className="py-2 pr-1 text-right tabular-nums">{r.chuteEffective} %</td>
            <td className="py-2 pr-1 text-right font-semibold tabular-nums">
              {r.besoinTissu > 0 ? `${m1.format(r.besoinTissu)} m` : "—"}
            </td>
            <td className="py-2 pr-1 text-right font-bold tabular-nums">
              {recu ? `${m1.format(r.tissuRecu)} m` : "—"}
            </td>
            <td className={`py-2 pr-1 text-right font-bold tabular-nums ${manque ? "text-red-700" : ""}`}>
              {r.ecartTissu == null
                ? "—"
                : `${r.ecartTissu < 0 ? "−" : "+"}${m1.format(Math.abs(r.ecartTissu))} m`}
            </td>
          </tr>
        </tbody>
      </table>

      {r.besoinTissu === 0 && (
        <div className="mt-2 text-[11.5px] text-neutral-600">
          ⚠ Nomenclature non saisie — le besoin théorique n&apos;a pas pu être calculé, l&apos;écart non plus.
        </div>
      )}

      <div className="mt-5 rounded border-2 border-neutral-900 px-3 py-2.5">
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-[9.5px] font-bold uppercase text-neutral-500">Contrôle qualité</span>
          <span className="text-[15px] font-extrabold tracking-tight">{ctl.label}</span>
        </div>
        <div className="mt-1 text-[11.5px] text-neutral-600">{ctl.note}</div>
      </div>

      <div className="mt-3 rounded border border-neutral-300 bg-neutral-50 px-3 py-2 text-[12px]">
        <b>Observations (nuance, laize, défauts…) :</b>{" "}
        {r.tissuNote || <span className="text-neutral-500">aucune</span>}
      </div>

      {journal.length > 0 && (
        <div className="mt-5">
          <div className="mb-1 text-[9.5px] font-bold uppercase text-neutral-500">
            Mouvements enregistrés ({journal.length})
          </div>
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="border-y border-neutral-300 bg-neutral-100">
                <th className="py-1 pl-1 text-left">Date</th>
                <th className="py-1 text-left">Action</th>
                <th className="py-1 text-left">Avant → après</th>
                <th className="py-1 pr-1 text-left">Par</th>
              </tr>
            </thead>
            <tbody>
              {journal.map((e) => (
                <tr key={e.id} className="border-b border-neutral-200">
                  <td className="py-1 pl-1 whitespace-nowrap tabular-nums">{dateHeure(e.ts)}</td>
                  <td className="py-1">
                    {e.action}
                    {e.detail && <span className="text-neutral-500"> — {e.detail}</span>}
                  </td>
                  <td className="py-1 text-neutral-600">
                    {e.avant || e.apres ? `${e.avant || "∅"} → ${e.apres || "∅"}` : "—"}
                  </td>
                  <td className="py-1 pr-1 whitespace-nowrap">
                    {e.par}
                    {e.role ? ` (${e.role})` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-10 grid grid-cols-2 gap-8 text-[11px]">
        {["Magasin tissu — nom, date et signature", "Contrôle qualité — nom, date et signature"].map((l) => (
          <div key={l}>
            <div className="font-semibold text-neutral-500">{l}</div>
            <div className="mt-1 h-16 rounded border border-dashed border-neutral-400" />
          </div>
        ))}
      </div>

      <div className="mt-6 border-t border-neutral-300 pt-2 text-[10.5px] text-neutral-500">
        {recu
          ? "Document généré par PilotPro — DBS Fashion. Les réserves sur la qualité du tissu doivent être formulées avant lancement en coupe."
          : "⚠ Aucune date de réception réelle n'est saisie : ce bon est un état d'attente, pas un accusé de réception."}
      </div>
    </div>
  );
}
