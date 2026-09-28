import Link from "next/link";
import { requireUser } from "@/lib/auth/server";
import { qrSvg } from "@/lib/atelier/qr";
import { BoutonImprimer } from "@/components/shared/bouton-imprimer";
import { basePortail } from "@/lib/services/portail";
import { listLots } from "@/lib/services/tissu";

const nb = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

/* Étiquettes QR des lots de tissu — à coller sur le rouleau (ou la pile).
 * Le QR ouvre la fiche mobile du lot : on le scanne à la sortie vers la coupe
 * pour enregistrer la consommation sans chercher le lot à l'écran. */
export default async function EtiquettesPage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  await requireUser();
  const { ids = "" } = await searchParams;
  const voulus = new Set(ids.split(",").map(Number).filter(Number.isInteger));
  const [lots, base] = await Promise.all([listLots(), basePortail()]);
  const choisis = lots.filter((l) => voulus.has(l.id));
  const racine = base.replace(/\/+$/, "");
  const cartes = await Promise.all(
    choisis.map(async (l) => ({ l, svg: await qrSvg(`${racine}/m/tissu/${l.id}`, 150) })),
  );

  return (
    <div className="mx-auto max-w-4xl bg-white p-6 text-neutral-900 print:p-0">
      <style>{`@media print { .no-print { display: none !important } @page { margin: 8mm; size: A4 portrait } .etq { break-inside: avoid } }`}</style>
      <div className="no-print mb-4 flex items-center gap-2">
        <BoutonImprimer label={`Imprimer ${cartes.length} étiquette(s)`} />
        <Link href="/magtissu?onglet=lots" className="rounded-md border px-3 py-1.5 text-xs font-semibold">
          ← Retour au magasin tissu
        </Link>
        <span className="text-xs text-neutral-500">Scannez le QR à la sortie vers la coupe.</span>
      </div>
      {cartes.length === 0 ? (
        <p className="py-10 text-center text-neutral-500">Aucun lot sélectionné.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {cartes.map(({ l, svg }) => (
            <div key={l.id} className="etq flex gap-3 rounded-lg border-2 border-neutral-900 p-3">
              <div className="size-[120px] shrink-0 [&_svg]:size-full" dangerouslySetInnerHTML={{ __html: svg }} />
              <div className="min-w-0 text-[12px] leading-snug">
                <div className="font-mono text-[22px] font-black">{l.identifiant}</div>
                <div className="font-bold">{l.client || "—"}</div>
                <div>{[l.reference, l.couleur].filter(Boolean).join(" · ") || "—"}</div>
                <div className="text-neutral-600">
                  {l.laize != null ? `laize ${l.laize} cm · ` : ""}
                  {nb.format(l.quantiteRecue)} {l.unite}
                  {l.nbRouleaux ? ` · ${l.nbRouleaux} rouleau(x)` : ""}
                </div>
                <div className="text-[10.5px] text-neutral-500">
                  {l.saison ? `${l.saison} · ` : ""}réception {l.receptionNumero}
                  {l.blClient ? ` · BL ${l.blClient}` : ""}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
