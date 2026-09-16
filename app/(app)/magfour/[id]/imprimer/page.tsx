import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { getPreparation, journalDe } from "@/lib/services/preparation";
import { BoutonImprimer } from "@/components/shared/bouton-imprimer";

const nb = new Intl.NumberFormat("fr-FR");
const q2 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

const dateFr = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split("-").reverse().join("/") : iso || "—");

function dateHeure(iso: string | Date) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* Bon de réception fournitures — la trace papier d'une entrée en magasin.
 *
 * Comme le bon tissu, c'est une page normale : l'impression du navigateur
 * produit le PDF. Le document confronte, référence par référence, ce que la
 * commande attendait (quantité prévue) à ce qui est réellement arrivé
 * (quantité reçue), et met en tête une ALERTE listant tout ce qui manque ou
 * n'est pas encore reçu — pour que le magasinier n'ait pas à recompter à la
 * main avant de dire si la commande peut partir en production. */
export default async function BonReceptionFournituresPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const commandeId = Number(id);
  if (!Number.isInteger(commandeId)) notFound();

  const [r, journal] = await Promise.all([getPreparation(commandeId), journalDe(commandeId, "four")]);
  if (!r) notFound();

  const lignes = r.fournitures;
  const detaille = lignes.length > 0;

  /* Une fourniture « manque » quand la quantité reçue est inférieure à la
   * quantité prévue. On distingue le cas « rien reçu » (attente pure) du cas
   * « partiel » (une partie est là), parce que le magasinier ne les traite pas
   * de la même façon. */
  const manquantes = lignes.filter((l) => l.qteRecue < l.qtePrevue);
  const rienRecu = manquantes.filter((l) => l.qteRecue <= 0);
  const partielles = manquantes.filter((l) => l.qteRecue > 0);
  const completes = lignes.length - manquantes.length;
  const toutRecu = detaille && manquantes.length === 0;

  const feu = r.feux.find((f) => f.id === "four");

  return (
    <div className="mx-auto max-w-4xl bg-white p-8 text-[13px] text-neutral-900 print:p-0">
      <style>{`@media print { .no-print { display: none !important } @page { margin: 14mm } }`}</style>

      <div className="no-print mb-4 flex items-center gap-2">
        <BoutonImprimer label="Imprimer / PDF" />
        <a href="/magfour" className="rounded-md border px-3 py-1.5 text-xs font-semibold">
          ← Retour au magasin fournitures
        </a>
      </div>

      <div className="flex items-start justify-between border-b-2 border-neutral-900 pb-3">
        <div>
          <div className="text-xl font-extrabold tracking-tight">DBS FASHION</div>
          <div className="text-[11px] uppercase tracking-widest text-neutral-500">Magasin fournitures</div>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold">BON DE RÉCEPTION FOURNITURES</div>
          <div className="text-[12px]">{r.of || `commande n°${r.id}`}</div>
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
          <div className="text-[9.5px] font-bold uppercase text-neutral-500">État des fournitures</div>
          <div className="text-[14px] font-bold">
            {!detaille ? "Suivi global" : toutRecu ? "Toutes reçues" : `${manquantes.length} manquante(s)`}
          </div>
          <div className="mt-0.5 text-[12px]">
            {detaille ? `${lignes.length} référence(s) suivie(s)` : "Aucune ligne de détail saisie"}
          </div>
          <div className="mt-0.5 text-[12px] text-neutral-500">
            Destination : {r.faconnier || r.chaine || "non assignée"}
          </div>
        </div>
      </div>

      {/* ─── ALERTE : ce qui manque ─── */}
      {detaille && manquantes.length > 0 && (
        <div className="mt-4 rounded border-2 border-red-700 bg-red-50 px-3 py-2.5 print:bg-white">
          <div className="text-[13px] font-extrabold uppercase text-red-800">
            ⚠ {manquantes.length} fourniture(s) à réceptionner avant lancement
          </div>
          <ul className="mt-1.5 space-y-0.5 text-[12px] text-red-900">
            {manquantes.map((l) => {
              const reste = l.qtePrevue - l.qteRecue;
              return (
                <li key={l.id}>
                  <b>{l.designation || "Réf. sans désignation"}</b> —{" "}
                  {l.qteRecue <= 0
                    ? `non reçue (${q2.format(l.qtePrevue)} ${l.unite} attendues)`
                    : `reçue ${q2.format(l.qteRecue)} / ${q2.format(l.qtePrevue)} ${l.unite} — manque ${q2.format(reste)}`}
                </li>
              );
            })}
          </ul>
          <div className="mt-1.5 text-[11px] text-red-800">
            {rienRecu.length > 0 && `${rienRecu.length} référence(s) pas encore reçue(s). `}
            {partielles.length > 0 && `${partielles.length} réception(s) partielle(s). `}
            Tant qu&apos;une fourniture manque, la commande ne doit pas être lancée en production.
          </div>
        </div>
      )}

      {detaille && toutRecu && (
        <div className="mt-4 rounded border-2 border-green-700 bg-green-50 px-3 py-2.5 print:bg-white">
          <div className="text-[13px] font-extrabold uppercase text-green-800">
            ✓ Toutes les fournitures sont reçues ({completes}/{lignes.length})
          </div>
          <div className="mt-1 text-[11.5px] text-green-900">
            Aucun manque constaté — les fournitures ne bloquent pas le lancement.
          </div>
        </div>
      )}

      {/* ─── Détail référence par référence ─── */}
      {detaille ? (
        <table className="mt-5 w-full border-collapse text-[12px]">
          <thead>
            <tr className="border-y border-neutral-300 bg-neutral-100">
              <th className="py-1.5 pl-1 text-left">Désignation</th>
              <th className="py-1.5 pr-1 text-right">Prévu</th>
              <th className="py-1.5 pr-1 text-right">Reçu</th>
              <th className="py-1.5 pr-1 text-right">Reste</th>
              <th className="py-1.5 pr-1 text-center">Unité</th>
              <th className="py-1.5 pr-1 text-center">État</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => {
              const reste = l.qtePrevue - l.qteRecue;
              const manque = reste > 0;
              return (
                <tr key={l.id} className="border-b border-neutral-200">
                  <td className="py-2 pl-1">
                    <b>{l.designation || <span className="text-neutral-500">Réf. sans désignation</span>}</b>
                  </td>
                  <td className="py-2 pr-1 text-right tabular-nums">{q2.format(l.qtePrevue)}</td>
                  <td className="py-2 pr-1 text-right font-semibold tabular-nums">{q2.format(l.qteRecue)}</td>
                  <td className={`py-2 pr-1 text-right font-bold tabular-nums ${manque ? "text-red-700" : ""}`}>
                    {manque ? q2.format(reste) : "—"}
                  </td>
                  <td className="py-2 pr-1 text-center text-neutral-600">{l.unite}</td>
                  <td className="py-2 pr-1 text-center">
                    {manque ? (
                      <span className="font-bold text-red-700">{l.qteRecue > 0 ? "partiel" : "manquant"}</span>
                    ) : (
                      <span className="font-bold text-green-700">✓ reçu</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <div className="mt-5 rounded border border-neutral-300 bg-neutral-50 px-3 py-3 text-[12px]">
          <b>Suivi global</b> — cette commande n&apos;a pas de détail référence par référence.
          {feu && (
            <>
              {" "}
              État déclaré : <b>{feu.etat.label}</b>.
            </>
          )}
          <div className="mt-1 text-[11.5px] text-neutral-600">
            Pour un contrôle précis avant lancement, ajoutez les références (boutons, fermetures, étiquettes, fil…) dans
            l&apos;écran magasin fournitures, avec leurs quantités prévues et reçues.
          </div>
        </div>
      )}

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
        {["Magasin fournitures — nom, date et signature", "Contrôle — nom, date et signature"].map((l) => (
          <div key={l}>
            <div className="font-semibold text-neutral-500">{l}</div>
            <div className="mt-1 h-16 rounded border border-dashed border-neutral-400" />
          </div>
        ))}
      </div>

      <div className="mt-6 border-t border-neutral-300 pt-2 text-[10.5px] text-neutral-500">
        Document généré par PilotPro — DBS Fashion. Une fourniture manquante bloque le lancement en production tant
        qu&apos;une dérogation n&apos;a pas été accordée en direction technique.
      </div>
    </div>
  );
}
