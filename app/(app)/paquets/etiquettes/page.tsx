import Link from "next/link";
import { requireUser } from "@/lib/auth/server";
import { qrSvg } from "@/lib/atelier/qr";
import { BoutonImprimer } from "@/components/shared/bouton-imprimer";
import { basePortail } from "@/lib/services/portail";
import { LIASSE_UNIQUE } from "@/lib/domain/paquet";
import { paquetsDeCommande } from "@/lib/services/paquets";

/* ÉTIQUETTES QR DES PAQUETS — une par LIASSE.
 *
 * Le paquet n° 12 existe en plusieurs liasses — col, devant, manches, dos —
 * qui partent chacune à un poste et se retrouvent à l'assemblage. Elles
 * portent donc TOUTES le numéro 12, écrit en gros, et chacune son nom. Les
 * QR mènent à la même fiche, positionnée sur la bonne liasse :
 *   https://<app>/p/PQ-2026-000145/3
 *
 * Deux formats, les mêmes marges que les étiquettes de rouleaux :
 *   - standard 70 × 37 mm  : imprimante d'étiquettes, une par page ;
 *   - planche A4 × 24      : 3 × 8 sur feuille de bureau. */

type Format = "standard" | "a4";
const FORMATS: { value: Format; label: string }[] = [
  { value: "a4", label: "Planche A4 — 24 étiquettes" },
  { value: "standard", label: "Standard 70 × 37 mm" },
];

const MARGE_HAUT_BAS = 10;
const MARGE_COTES = 4;
const UTILE_L = 210 - 2 * MARGE_COTES;
const UTILE_H = 297 - 2 * MARGE_HAUT_BAS;
const mm = (n: number) => `${Math.floor(n * 1000) / 1000}mm`;

type Carte = {
  cle: string;
  numero: number;
  code: string;
  liasse: string;
  rang: number;
  surTotal: number;
  of: string;
  modele: string;
  couleur: string;
  taille: string;
  qte: number;
  pieceDebut: number;
  pieceFin: number;
  svg: string;
};

export default async function EtiquettesPaquetsPage({
  searchParams,
}: {
  searchParams: Promise<{ of?: string; du?: string; au?: string; format?: string }>;
}) {
  await requireUser();
  const sp = await searchParams;
  const format: Format = FORMATS.some((f) => f.value === sp.format) ? (sp.format as Format) : "a4";
  const commandeId = Number(sp.of) || 0;
  const tous = commandeId ? await paquetsDeCommande(commandeId) : [];
  // Une étiquette de paquet annulé ne se réimprime pas.
  const actifs = tous.filter((p) => p.statut === "actif");
  const du = Number(sp.du) || 0;
  const au = Number(sp.au) || 0;
  const paquets = actifs.filter((p) => (!du || p.numero >= du) && (!au || p.numero <= au));

  const racine = (await basePortail()).replace(/\/+$/, "");
  const cartes: Carte[] = [];
  for (const p of paquets) {
    const liasses = p.liasses.length ? p.liasses : [LIASSE_UNIQUE];
    for (let i = 0; i < liasses.length; i++) {
      cartes.push({
        cle: `${p.id}-${i}`,
        numero: p.numero,
        code: p.code,
        liasse: liasses[i],
        rang: i + 1,
        surTotal: liasses.length,
        of: p.ofNumber,
        modele: p.modele,
        couleur: p.couleur,
        taille: p.taille,
        qte: p.qte,
        pieceDebut: p.pieceDebut,
        pieceFin: p.pieceFin,
        svg: await qrSvg(`${racine}/p/${p.code}/${i + 1}`, 220),
      });
    }
  }

  const qs = (f: Format) => {
    const q = new URLSearchParams();
    if (sp.of) q.set("of", sp.of);
    if (sp.du) q.set("du", sp.du);
    if (sp.au) q.set("au", sp.au);
    q.set("format", f);
    return `?${q.toString()}`;
  };

  const pages: Carte[][] = [];
  if (format === "a4") for (let i = 0; i < cartes.length; i += 24) pages.push(cartes.slice(i, i + 24));

  return (
    <div className="bg-white text-neutral-900">
      <style>{`
        ${format === "a4" ? "@page { size: A4 portrait; margin: 0 }" : "@page { size: 70mm 37mm; margin: 0 }"}
        @media print { .no-print { display: none !important } body { background: #fff } }
        .etq { box-sizing: border-box; overflow: hidden; break-inside: avoid; page-break-inside: avoid; font-family: Arial, Helvetica, sans-serif; color: #000 }
        .etq svg { width: 100%; height: 100% }
        .f-standard .etq { width: 70mm; height: 37mm; padding: 1.5mm 2mm; break-after: page; page-break-after: always }
        .f-standard .etq:last-child { break-after: auto; page-break-after: auto }
        .planche { box-sizing: border-box; width: 210mm; height: 296.5mm; overflow: hidden; display: grid; padding: ${MARGE_HAUT_BAS}mm ${MARGE_COTES}mm 0; break-after: page; page-break-after: always }
        .planche:last-child { break-after: auto; page-break-after: auto }
        .qr { width: 30mm; height: 30mm }
        .f-a4 .planche { grid-template-columns: repeat(3, ${mm(UTILE_L / 3)}); grid-template-rows: repeat(8, ${mm(UTILE_H / 8)}) }
        .f-a4 .etq { width: ${mm(UTILE_L / 3)}; height: ${mm(UTILE_H / 8)}; padding: 1.5mm 2mm }
        @media screen {
          .etq { outline: 1px dashed #bbb; margin: 0 auto 6px }
          .planche .etq { margin: 0 }
          .planche { margin: 0 auto 12px; outline: 1px solid #ddd }
        }
      `}</style>

      <div className="no-print mx-auto mb-4 flex max-w-4xl flex-wrap items-center gap-2 p-4">
        <BoutonImprimer label={`Imprimer ${cartes.length} étiquette(s)`} />
        {FORMATS.map((f) => (
          <Link
            key={f.value}
            href={qs(f.value)}
            className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${f.value === format ? "border-neutral-900 bg-neutral-900 text-white" : "hover:bg-neutral-100"}`}
          >
            {f.label}
          </Link>
        ))}
        <Link href={`/paquets?of=${commandeId}`} className="rounded-md border px-3 py-1.5 text-xs font-semibold">
          ← Suivi paquets
        </Link>
        <span className="w-full text-xs text-neutral-500">
          Une étiquette par LIASSE : le paquet 12 en a {cartes.length && paquets.length ? Math.round(cartes.length / paquets.length) : "n"}, toutes au même numéro.
          Réglez l&apos;impression sur « Marges : aucune » et « Échelle : 100 % ».
          {actifs.length > paquets.length && ` Filtre : paquets ${du || 1} à ${au || actifs.length} (sur ${actifs.length}).`}
        </span>
      </div>

      {cartes.length === 0 ? (
        <p className="no-print py-10 text-center text-neutral-500">
          Aucun paquet à étiqueter. Les paquets naissent à la validation d&apos;une fiche de coupe.
        </p>
      ) : (
        <div className={`f-${format}`}>
          {format === "a4"
            ? pages.map((feuille, i) => (
                <div key={i} className="planche">
                  {feuille.map((c) => (
                    <Etiquette key={c.cle} c={c} />
                  ))}
                </div>
              ))
            : cartes.map((c) => <Etiquette key={c.cle} c={c} />)}
        </div>
      )}
    </div>
  );
}

/** 70 × 37 mm : le numéro de paquet en gros, la liasse juste dessous. Ce sont
 * les deux seules choses qu'on lit à un mètre, dans un atelier. */
function Etiquette({ c }: { c: Carte }) {
  return (
    <div className="etq flex gap-[1.5mm]">
      <div className="qr shrink-0" dangerouslySetInnerHTML={{ __html: c.svg }} />
      <div className="flex min-w-0 flex-1 flex-col leading-[1.1]">
        <div className="flex items-baseline justify-between">
          <span className="text-[5.5pt] font-bold tracking-[0.12em]">DBS FASHION</span>
          <span className="text-[5.5pt] font-bold">
            {c.rang}/{c.surTotal}
          </span>
        </div>
        {/* Les deux seules choses qu'on lit à un mètre, dans un atelier :
            le numéro du paquet, et de quelle liasse il s'agit. */}
        <div className="text-[19pt] font-black leading-none">{c.numero}</div>
        <div className="break-words text-[7.5pt] font-black uppercase leading-[1.05]">{c.liasse}</div>
        <div className="truncate text-[6.5pt] font-bold">
          {c.of}
          {c.taille ? ` · T. ${c.taille}` : ""} · {c.qte} pcs
        </div>
        <div className="truncate text-[6pt]">{c.modele}{c.couleur ? ` · ${c.couleur}` : ""}</div>
        <div className="mt-auto flex items-end justify-between text-[5.5pt]">
          <span>
            pièces {c.pieceDebut}–{c.pieceFin}
          </span>
          <span className="font-mono">{c.code}</span>
        </div>
      </div>
    </div>
  );
}
