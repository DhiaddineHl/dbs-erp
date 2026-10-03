import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { BoutonImprimer } from "@/components/shared/bouton-imprimer";
import { motifEcartLabel } from "@/lib/domain/coupe";
import { lirePv } from "@/lib/services/coupe";

const nb = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const signe = (n: number) => (n > 0 ? `+${nb.format(n)}` : nb.format(n));
const dateFr = (iso: string) => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10).split("-").reverse().join("/") : iso || "—");
const dateHeure = (iso: string) => (iso ? new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—");

/* PROCÈS-VERBAL DE COUPE remis au client.
 *
 * Il affiche une VERSION figée : les chiffres ont été copiés à la génération
 * et ne bougent plus, même si la fiche ou le stock évoluent. Régénérer crée
 * la version suivante ; les précédentes restent consultables ici. */
export default async function PvCoupePage({ params, searchParams }: { params: Promise<{ numero: string }>; searchParams: Promise<{ v?: string }> }) {
  await requireUser();
  const numero = decodeURIComponent((await params).numero);
  const v = Number((await searchParams).v) || undefined;
  const pv = await lirePv(numero, v);
  if (!pv) notFound();
  const d = pv.donnees;
  const plusieurs = d.ofs.length > 1;
  return (
    <div className="mx-auto max-w-4xl bg-white p-8 text-[12px] text-neutral-900 print:p-0">
      <style>{`@media print { .no-print { display: none !important } @page { margin: 12mm; size: A4 portrait } }`}</style>
      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        <BoutonImprimer label="Imprimer / PDF" />
        <Link href={`/coupe/fiche/${encodeURIComponent(d.numero)}`} className="rounded-md border px-3 py-1.5 text-xs font-semibold">
          ← Fiche {d.numero}
        </Link>
        <span className="text-xs text-neutral-500">Versions :</span>
        {pv.versions.map((x) => (
          <Link
            key={x.version}
            href={`?v=${x.version}`}
            className={`rounded-md border px-2 py-1 text-xs font-semibold ${x.version === pv.version ? "border-neutral-900 bg-neutral-900 text-white" : ""}`}
            title={`Générée le ${dateHeure(x.createdAt)} par ${x.createdBy}`}
          >
            v{x.version}
          </Link>
        ))}
        {pv.version !== pv.derniere && <span className="text-xs font-semibold text-amber-700">Version ancienne — la v{pv.derniere} la remplace.</span>}
        {pv.ficheAnnulee && <span className="text-xs font-semibold text-red-700">La fiche de coupe a été annulée depuis : ce PV n&apos;est plus valable.</span>}
      </div>

      <div className="flex items-start justify-between border-b-2 border-neutral-900 pb-3">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/dbs-fashion-logo.png" alt="DBS Fashion" className="h-12 w-auto object-contain" />
          <div>
            <div className="text-xl font-extrabold tracking-tight">DBS FASHION</div>
            <div className="text-[11px] uppercase tracking-widest text-neutral-500">Service coupe</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold">PROCÈS-VERBAL DE COUPE</div>
          <div className="text-[15px] font-extrabold">
            {pv.numero} <span className="text-[12px] font-semibold">· version {pv.version}</span>
          </div>
          <div className="text-[11px] text-neutral-500">
            Coupe du {dateFr(d.date)} · fiche {d.numero} · généré le {dateHeure(d.genereLe)}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-x-6 gap-y-1.5 rounded border border-neutral-300 px-4 py-3 text-[12px]">
        <Champ l="Client" v={d.commande.client} />
        <Champ l="Commande / OF" v={d.ofs.map((o) => o.of).join(" + ")} />
        <Champ l="Référence modèle" v={d.commande.refArticle} />
        <Champ l="Désignation modèle" v={d.commande.designation} />
        <Champ l="Couleur" v={d.commande.couleur} />
        <Champ l="Tissu" v={[d.matiere, ...d.tissu.references].filter(Boolean).join(" · ")} />
      </div>

      <h2 className="mt-5 text-[13px] font-bold uppercase tracking-wide">Quantités coupées</h2>
      <table className="mt-1.5 w-full border-collapse text-[12px]">
        <thead>
          <tr className="border-y border-neutral-500 bg-neutral-100">
            <th className="py-1.5 pl-2 text-left">Taille</th>
            <th className="py-1.5 text-right">Commandé</th>
            <th className="py-1.5 text-right">Plan de coupe</th>
            <th className="py-1.5 text-right">Coupé</th>
            <th className="py-1.5 pr-2 text-right">Écart</th>
          </tr>
        </thead>
        <tbody>
          {d.lignes.map((l) => (
            <tr key={l.taille} className="border-b border-neutral-200">
              <td className="py-1.5 pl-2 font-bold">{l.taille}</td>
              <td className="py-1.5 text-right tabular-nums">{nb.format(l.commande)}</td>
              <td className="py-1.5 text-right tabular-nums">{nb.format(l.prevu)}</td>
              <td className="py-1.5 text-right font-bold tabular-nums">{nb.format(l.coupe)}</td>
              <td className="py-1.5 pr-2 text-right tabular-nums">{signe(l.ecart)}</td>
            </tr>
          ))}
          <tr className="border-y-2 border-neutral-700 font-extrabold">
            <td className="py-1.5 pl-2">TOTAL</td>
            <td className="py-1.5 text-right tabular-nums">{nb.format(d.totaux.commande)}</td>
            <td className="py-1.5 text-right tabular-nums">{nb.format(d.totaux.prevu)}</td>
            <td className="py-1.5 text-right tabular-nums">{nb.format(d.totaux.coupe)}</td>
            <td className="py-1.5 pr-2 text-right tabular-nums">{signe(d.totaux.ecart)}</td>
          </tr>
        </tbody>
      </table>
      {plusieurs && (
        <p className="mt-1 text-[11px] text-neutral-600">
          Répartition par OF :{" "}
          {d.ofs.map((o) => `${o.of} ${nb.format(d.lignes.reduce((s, l) => s + (l.parOf.find((x) => x.of === o.of)?.coupe ?? 0), 0))} pcs`).join(" · ")}
        </p>
      )}
      {d.motifEcart && (
        <p className="mt-1 text-[11px]">
          <b>Motif de l&apos;écart :</b> {motifEcartLabel(d.motifEcart)}
          {d.precisionEcart ? ` — ${d.precisionEcart}` : ""}
        </p>
      )}

      <h2 className="mt-5 text-[13px] font-bold uppercase tracking-wide">Consommation tissu</h2>
      <table className="mt-1.5 w-full border-collapse text-[12px]">
        <thead>
          <tr className="border-y border-neutral-500 bg-neutral-100">
            <th className="py-1.5 pl-2 text-left">Tissu</th>
            <th className="py-1.5 text-left">Couleur</th>
            <th className="py-1.5 text-left">Lot</th>
            <th className="py-1.5 text-left">Rouleau</th>
            <th className="py-1.5 pr-2 text-right">Métrage</th>
          </tr>
        </thead>
        <tbody>
          {d.consommation.length === 0 ? (
            <tr>
              <td colSpan={5} className="py-3 text-center text-neutral-500">
                Aucune consommation rattachée.
              </td>
            </tr>
          ) : (
            d.consommation.map((c) => (
              <tr key={`${c.lot}-${c.rouleau}`} className="border-b border-neutral-200">
                <td className="py-1.5 pl-2">{c.tissu || "—"}</td>
                <td className="py-1.5">{c.couleur || "—"}</td>
                <td className="py-1.5">{c.lot}</td>
                <td className="py-1.5 font-mono">{c.rouleau}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">
                  {nb.format(c.total)} {c.unite}
                  {c.chute > 0 && <span className="text-[10px] text-neutral-500"> (dont chute {nb.format(c.chute)})</span>}
                </td>
              </tr>
            ))
          )}
          <tr className="border-y-2 border-neutral-700 font-extrabold">
            <td colSpan={4} className="py-1.5 pr-2 text-right">
              TOTAL
            </td>
            <td className="py-1.5 pr-2 text-right tabular-nums">{nb.format(d.bilan.reel)} m</td>
          </tr>
        </tbody>
      </table>
      <div className="mt-3 grid grid-cols-3 gap-3 text-[12.5px]">
        <Cadre l={`Consommation théorique${d.bilan.consoPiece ? ` (${nb.format(d.bilan.consoPiece)} m/pièce)` : ""}`} v={d.bilan.theorique != null ? `${nb.format(d.bilan.theorique)} m` : "—"} />
        <Cadre l="Consommation réelle" v={`${nb.format(d.bilan.reel)} m`} />
        <Cadre l="Écart" v={d.bilan.ecart != null ? `${signe(d.bilan.ecart)} m${d.bilan.pct != null ? ` / ${signe(d.bilan.pct)} %` : ""}` : "—"} />
      </div>

      <div className="mt-10 grid grid-cols-2 gap-10 text-[11.5px]">
        {["DBS FASHION", "CLIENT"].map((qui) => (
          <div key={qui} className="rounded border border-neutral-400 px-4 py-3">
            <div className="mb-2 font-extrabold">{qui}</div>
            <div className="border-b border-dotted border-neutral-400 pb-3">Nom :</div>
            <div className="border-b border-dotted border-neutral-400 py-3">Fonction :</div>
            <div className="h-16 pt-3">Signature :</div>
          </div>
        ))}
      </div>
      <div className="mt-6 border-t border-neutral-300 pt-2 text-[10.5px] text-neutral-500">
        Document généré par PilotPro — DBS Fashion · {pv.numero} version {pv.version}, générée le {dateHeure(d.genereLe)} par {d.generePar}. Chiffres issus de la fiche de
        coupe {d.numero} (validée par {d.createdBy}) et des mouvements de rouleaux, sans ressaisie.
      </div>
    </div>
  );
}

function Champ({ l, v }: { l: string; v: string }) {
  return (
    <div>
      <div className="text-[9.5px] font-bold uppercase text-neutral-500">{l}</div>
      <div className="font-semibold">{v || "—"}</div>
    </div>
  );
}

function Cadre({ l, v }: { l: string; v: string }) {
  return (
    <div className="rounded border border-neutral-400 px-3 py-2">
      <div className="text-[9.5px] font-bold uppercase text-neutral-500">{l}</div>
      <div className="text-[15px] font-extrabold tabular-nums">{v}</div>
    </div>
  );
}
