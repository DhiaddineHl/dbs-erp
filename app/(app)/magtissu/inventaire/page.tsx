import { requireUser } from "@/lib/auth/server";
import { inventaireTissu } from "@/lib/services/preparation";
import { BoutonImprimer } from "@/components/shared/bouton-imprimer";

const q2 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

const dateFr = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split("-").reverse().join("/") : iso || "—");

const CONTROLE: Record<string, string> = {
  "": "non contrôlé",
  conforme: "conforme",
  reserve: "sous réserve",
  refuse: "REFUSÉ",
};

/* Inventaire tissu — état des stocks imprimable en un clic.
 *
 * Une ligne par matière reçue, toutes commandes confondues, avec sa laize et
 * son écart prévu/reçu. Le magasin s'en sert pour compter ce qu'il a en rayon,
 * cocher chaque ligne à la main et signer. Comme les autres documents, c'est
 * une page normale : l'impression du navigateur produit le PDF. */
export default async function InventaireTissuPage() {
  await requireUser();
  const lignes = await inventaireTissu();

  const totPrevu = lignes.reduce((s, l) => s + l.metragePrevu, 0);
  const totRecu = lignes.reduce((s, l) => s + l.metrageRecu, 0);
  const nbRefs = new Set(lignes.map((l) => l.reference).filter(Boolean)).size;
  const manquants = lignes.filter((l) => l.metragePrevu > 0 && l.metrageRecu < l.metragePrevu).length;

  return (
    <div className="mx-auto max-w-5xl bg-white p-8 text-[12px] text-neutral-900 print:p-0">
      <style>{`@media print { .no-print { display: none !important } @page { margin: 12mm; size: landscape } }`}</style>

      <div className="no-print mb-4 flex items-center gap-2">
        <BoutonImprimer label="Imprimer / PDF l'inventaire" />
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
          <div className="text-lg font-bold">INVENTAIRE TISSU</div>
          <div className="text-[11px] text-neutral-500">Édité le {dateFr(new Date().toISOString().slice(0, 10))}</div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-3 text-[11.5px]">
        <div className="rounded border border-neutral-300 px-3 py-2">
          <div className="text-[9.5px] font-bold uppercase text-neutral-500">Matières listées</div>
          <div className="text-[16px] font-bold">{lignes.length}</div>
          <div className="text-neutral-500">{nbRefs} référence(s)</div>
        </div>
        <div className="rounded border border-neutral-300 px-3 py-2">
          <div className="text-[9.5px] font-bold uppercase text-neutral-500">Métrage prévu</div>
          <div className="text-[16px] font-bold">{q2.format(totPrevu)} m</div>
        </div>
        <div className="rounded border border-neutral-300 px-3 py-2">
          <div className="text-[9.5px] font-bold uppercase text-neutral-500">Métrage reçu</div>
          <div className="text-[16px] font-bold">{q2.format(totRecu)} m</div>
        </div>
        <div className="rounded border border-neutral-300 px-3 py-2">
          <div className="text-[9.5px] font-bold uppercase text-neutral-500">À réceptionner</div>
          <div className={`text-[16px] font-bold ${manquants ? "text-red-700" : ""}`}>{manquants} ligne(s)</div>
        </div>
      </div>

      {lignes.length === 0 ? (
        <div className="mt-6 rounded border border-neutral-300 bg-neutral-50 px-3 py-6 text-center text-[12px]">
          Aucune matière saisie pour l&apos;instant. Ajoutez les tissus, référence par référence, dans les fiches du
          magasin tissu — elles apparaîtront ici.
        </div>
      ) : (
        <table className="mt-4 w-full border-collapse text-[11px]">
          <thead>
            <tr className="border-y border-neutral-400 bg-neutral-100 text-left">
              <th className="py-1.5 pl-1">OF</th>
              <th className="py-1.5">Modèle / Client</th>
              <th className="py-1.5">Matière</th>
              <th className="py-1.5">Référence</th>
              <th className="py-1.5">Couleur</th>
              <th className="py-1.5 text-center">Laize</th>
              <th className="py-1.5 text-right">Prévu</th>
              <th className="py-1.5 text-right">Reçu</th>
              <th className="py-1.5 text-right">Écart</th>
              <th className="py-1.5">Contrôle</th>
              <th className="py-1.5 pr-1 text-center">Compté ✓</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((l, i) => {
              const manque = l.metragePrevu > 0 && l.metrageRecu < l.metragePrevu;
              return (
                <tr key={`${l.of}-${i}`} className="border-b border-neutral-200">
                  <td className="py-1.5 pl-1 font-semibold">{l.of || "—"}</td>
                  <td className="py-1.5">
                    <span className="font-medium">{l.modele}</span>
                    <span className="text-neutral-500"> · {l.client || "—"}</span>
                  </td>
                  <td className="py-1.5">{l.matiere}</td>
                  <td className="py-1.5">{l.reference || <span className="text-neutral-400">—</span>}</td>
                  <td className="py-1.5">{l.couleur || <span className="text-neutral-400">—</span>}</td>
                  <td className="py-1.5 text-center tabular-nums">{l.laize != null ? `${q2.format(l.laize)} cm` : "—"}</td>
                  <td className="py-1.5 text-right tabular-nums">{q2.format(l.metragePrevu)}</td>
                  <td className="py-1.5 text-right font-semibold tabular-nums">{q2.format(l.metrageRecu)}</td>
                  <td className={`py-1.5 text-right font-bold tabular-nums ${manque ? "text-red-700" : ""}`}>
                    {l.metragePrevu > 0 ? `${l.ecart >= 0 ? "+" : ""}${q2.format(l.ecart)}` : "—"}
                  </td>
                  <td className={`py-1.5 ${l.controle === "refuse" ? "font-bold text-red-700" : ""}`}>
                    {CONTROLE[l.controle] ?? l.controle}
                  </td>
                  <td className="py-1.5 pr-1 text-center">
                    <span className="inline-block h-3 w-3 rounded-sm border border-neutral-500" />
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-neutral-400 font-bold">
              <td className="py-1.5 pl-1" colSpan={6}>
                TOTAL
              </td>
              <td className="py-1.5 text-right tabular-nums">{q2.format(totPrevu)}</td>
              <td className="py-1.5 text-right tabular-nums">{q2.format(totRecu)}</td>
              <td className="py-1.5 text-right tabular-nums">
                {`${totRecu - totPrevu >= 0 ? "+" : ""}${q2.format(Math.round((totRecu - totPrevu) * 100) / 100)}`}
              </td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      )}

      <div className="mt-10 grid grid-cols-3 gap-8 text-[11px]">
        {["Magasin tissu — nom, date, signature", "Contrôle — nom, date, signature", "Direction — visa"].map((l) => (
          <div key={l}>
            <div className="font-semibold text-neutral-500">{l}</div>
            <div className="mt-1 h-14 rounded border border-dashed border-neutral-400" />
          </div>
        ))}
      </div>

      <div className="mt-6 border-t border-neutral-300 pt-2 text-[10.5px] text-neutral-500">
        Document généré par PilotPro — DBS Fashion. Inventaire physique : cochez chaque matière comptée et notez tout
        écart avec le métrage reçu enregistré.
      </div>
    </div>
  );
}
