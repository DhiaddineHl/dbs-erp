import Link from "next/link";
import { requireUser } from "@/lib/auth/server";
import { qrSvg } from "@/lib/atelier/qr";
import { BoutonImprimer } from "@/components/shared/bouton-imprimer";
import { basePortail } from "@/lib/services/portail";
import { listEmplacements } from "@/lib/services/rouleaux";

/* Étiquettes QR des emplacements, en planche A4 (3 × 8, 70 × 37 mm), à
 * coller sur les rayons. Le QR mène à https://<app>/e/<CODE>. */
export default async function EtiquettesEmplacementsPage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  await requireUser();
  const { ids = "" } = await searchParams;
  const voulus = new Set(ids.split(",").map(Number));
  const [emps, base] = await Promise.all([listEmplacements(), basePortail()]);
  const racine = base.replace(/\/+$/, "");
  const cartes = await Promise.all(
    emps.filter((e) => voulus.has(e.id)).map(async (e) => ({ e, svg: await qrSvg(`${racine}/e/${encodeURIComponent(e.code)}`, 200) })),
  );
  return (
    <div className="bg-white text-black">
      <style>{`
        @page { size: A4 portrait; margin: 0 }
        @media print { .no-print { display: none !important } }
        .planche { width: 210mm; display: grid; grid-template-columns: repeat(3, 70mm); grid-auto-rows: 37mm; padding-top: 0.5mm }
        .etq { box-sizing: border-box; width: 70mm; height: 37mm; padding: 2mm; display: flex; gap: 2mm; overflow: hidden; break-inside: avoid; font-family: Arial, sans-serif }
        .etq svg { width: 100%; height: 100% }
        @media screen { .etq { outline: 1px dashed #bbb } }
      `}</style>
      <div className="no-print mb-4 flex items-center gap-2 p-4">
        <BoutonImprimer label={`Imprimer ${cartes.length} étiquette(s)`} />
        <Link href="/magtissu/emplacements" className="rounded-md border px-3 py-1.5 text-xs font-semibold">
          ← Emplacements
        </Link>
      </div>
      <div className="planche mx-auto">
        {cartes.map(({ e, svg }) => (
          <div key={e.id} className="etq">
            <div className="h-[33mm] w-[33mm] shrink-0" dangerouslySetInnerHTML={{ __html: svg }} />
            <div className="flex min-w-0 flex-col justify-center">
              <div className="text-[6pt] font-bold tracking-[0.15em]">DBS FASHION · EMPLACEMENT</div>
              <div className="font-mono text-[18pt] font-black leading-tight">{e.code}</div>
              <div className="text-[7pt]">{[e.zone && `Zone ${e.zone}`, e.rayon && `Rayon ${e.rayon}`].filter(Boolean).join(" · ")}</div>
              <div className="truncate text-[7pt]">{e.libelle}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
