import Link from "next/link";
import { requireUser } from "@/lib/auth/server";
import { qrSvg } from "@/lib/atelier/qr";
import { BoutonImprimer } from "@/components/shared/bouton-imprimer";
import { basePortail } from "@/lib/services/portail";
import { chargerRouleaux, type RouleauRow } from "@/lib/services/rouleaux";

const nb = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const dateFr = (iso: string) => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10).split("-").reverse().join("/") : iso || "—");

/* Étiquettes QR des ROULEAUX — une par rouleau physique. Le QR contient
 * l'adresse courte https://<app>/r/R-2026-000145 : n'importe quel téléphone
 * l'ouvre, la douchette la lit, et le code reste lisible en clair dessous.
 *
 * Quatre formats :
 *   - thermique 100 × 50 mm : imprimante d'étiquettes, une étiquette par page ;
 *   - standard  70 × 37 mm  : imprimante d'étiquettes, une par page ;
 *   - A4 × 4                : planche 2 × 2, grande étiquette lisible de loin ;
 *   - A4 24 étiquettes      : planche 3 × 8 (imprimante bureau).
 * Planches A4 : marges de la feuille DBS = 10 mm en haut et en bas, 4 mm à
 * gauche et à droite → zone utile 202 × 277 mm, partagée à parts égales :
 *   × 4  → 2 × 2 étiquettes de 101 × 138,5 mm ;
 *   × 24 → 3 × 8 étiquettes de 67,3 × 34,6 mm.
 * Les planches sont découpées page par page : une page ne déborde jamais sur
 * la suivante, quel que soit le nombre de rouleaux.
 *
 * Rouleau « à mesurer » (étiquette imprimée avant la mesure) : à la place du
 * métrage, une CASE VIDE « Métrage : ____ m » où le magasinier l'écrit au
 * stylo — trace papier de ce qu'il tape ensuite au scan. */

type Format = "thermique" | "standard" | "a4x4" | "a4";
const FORMATS: { value: Format; label: string }[] = [
  { value: "thermique", label: "Thermique 100 × 50 mm" },
  { value: "standard", label: "Standard 70 × 37 mm" },
  { value: "a4x4", label: "A4 — 4 étiquettes (101 × 138,5 mm)" },
  { value: "a4", label: "Planche A4 — 24 étiquettes (67,3 × 34,6 mm)" },
];
const PAR_PLANCHE: Partial<Record<Format, number>> = { a4x4: 4, a4: 24 };

/* Marges de la feuille A4 (imprimante / planche d'étiquettes). */
const MARGE_HAUT_BAS = 10; // mm
const MARGE_COTES = 4; // mm
const UTILE_L = 210 - 2 * MARGE_COTES; // 202 mm
const UTILE_H = 297 - 2 * MARGE_HAUT_BAS; // 277 mm
const mm = (n: number) => `${Math.floor(n * 1000) / 1000}mm`;

function parPages<T>(liste: T[], n: number): T[][] {
  const pages: T[][] = [];
  for (let i = 0; i < liste.length; i += n) pages.push(liste.slice(i, i + n));
  return pages;
}

export default async function EtiquettesRouleauxPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string; reception?: string; lot?: string; format?: string }>;
}) {
  await requireUser();
  const sp = await searchParams;
  const format: Format = FORMATS.some((f) => f.value === sp.format) ? (sp.format as Format) : "thermique";
  const ids = (sp.ids ?? "").split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0);
  const tous = ids.length
    ? await chargerRouleaux({ ids })
    : sp.reception
      ? await chargerRouleaux({ receptionId: Number(sp.reception) })
      : sp.lot
        ? await chargerRouleaux({ lotIds: [Number(sp.lot)] })
        : [];
  // Une étiquette annulée (rouleau en moins) ne se réimprime pas.
  const rouleaux = tous.filter((r) => r.statut !== "annule");
  const racine = (await basePortail()).replace(/\/+$/, "");
  const cartes = await Promise.all(rouleaux.map(async (r) => ({ r, svg: await qrSvg(`${racine}/r/${r.code}`, 220) })));

  const qs = (f: Format) => {
    const p = new URLSearchParams();
    if (sp.ids) p.set("ids", sp.ids);
    if (sp.reception) p.set("reception", sp.reception);
    if (sp.lot) p.set("lot", sp.lot);
    p.set("format", f);
    return `?${p.toString()}`;
  };

  const page =
    format === "a4" || format === "a4x4"
      ? "@page { size: A4 portrait; margin: 0 }"
      : format === "standard"
        ? "@page { size: 70mm 37mm; margin: 0 }"
        : "@page { size: 100mm 50mm; margin: 0 }";

  return (
    <div className="bg-white text-neutral-900">
      <style>{`
        ${page}
        @media print { .no-print { display: none !important } body { background: #fff } }
        .etq { box-sizing: border-box; overflow: hidden; break-inside: avoid; page-break-inside: avoid; font-family: Arial, Helvetica, sans-serif; color: #000 }
        .etq svg { width: 100%; height: 100% }
        .f-thermique .etq { width: 100mm; height: 50mm; padding: 2.5mm 3mm; break-after: page; page-break-after: always }
        .f-standard .etq { width: 70mm; height: 37mm; padding: 1.5mm 2mm; break-after: page; page-break-after: always }
        .f-thermique .etq:last-child, .f-standard .etq:last-child { break-after: auto; page-break-after: auto }
        .planche { box-sizing: border-box; width: 210mm; height: 296.5mm; overflow: hidden; display: grid; padding: ${MARGE_HAUT_BAS}mm ${MARGE_COTES}mm 0; break-after: page; page-break-after: always }
        .planche:last-child { break-after: auto; page-break-after: auto }
        .qr-petite { width: 33mm; height: 33mm }
        .f-a4 .planche { grid-template-columns: repeat(3, ${mm(UTILE_L / 3)}); grid-template-rows: repeat(8, ${mm(UTILE_H / 8)}) }
        .f-a4 .etq { width: ${mm(UTILE_L / 3)}; height: ${mm(UTILE_H / 8)}; padding: 1.5mm 2mm }
        .f-a4 .qr-petite { width: 30mm; height: 30mm }
        .f-a4x4 .planche { grid-template-columns: repeat(2, ${mm(UTILE_L / 2)}); grid-template-rows: repeat(2, ${mm(UTILE_H / 2)}) }
        .f-a4x4 .etq { width: ${mm(UTILE_L / 2)}; height: ${mm(UTILE_H / 2)}; padding: 4mm 5mm }
        .qr-a6 { width: 62mm; height: 62mm }
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
        <Link href="/magtissu?onglet=rouleaux" className="rounded-md border px-3 py-1.5 text-xs font-semibold">
          ← Magasin tissu
        </Link>
        <span className="w-full text-xs text-neutral-500">
          Réglez l&apos;impression sur « Marges : aucune » et « Échelle : 100 % » : les marges de la feuille A4 (10 mm haut et bas, 4 mm
          côtés) sont déjà prévues dans la mise en page. Une étiquette = un rouleau, pour toujours.
        </span>
      </div>

      {cartes.length === 0 ? (
        <p className="no-print py-10 text-center text-neutral-500">Aucun rouleau sélectionné.</p>
      ) : (
        <div className={`f-${format}`}>
          {PAR_PLANCHE[format] ? (
            parPages(cartes, PAR_PLANCHE[format]!).map((feuille, i) => (
              <div key={i} className="planche">
                {feuille.map(({ r, svg }) => (format === "a4x4" ? <A6 key={r.id} r={r} svg={svg} /> : <Petite key={r.id} r={r} svg={svg} />))}
              </div>
            ))
          ) : format === "standard" ? (
            cartes.map(({ r, svg }) => <Petite key={r.id} r={r} svg={svg} />)
          ) : (
            cartes.map(({ r, svg }) => <Grande key={r.id} r={r} svg={svg} />)
          )}
        </div>
      )}
    </div>
  );
}

const aRemplir = (r: RouleauRow) => r.aMesurer && r.statut === "a_mesurer";

/** Case à remplir au stylo sur une étiquette « à mesurer ». */
function Case({ label, unite, largeur, grand }: { label: string; unite: string; largeur: string; grand?: boolean }) {
  return (
    <span className={`inline-flex items-end gap-[1mm] ${grand ? "text-[11pt]" : "text-[7pt]"} font-bold`}>
      {label}
      <span className="inline-block border-b-[1.5px] border-black" style={{ width: largeur, height: grand ? "9mm" : "5mm" }} />
      {unite}
    </span>
  );
}

function tissu(r: RouleauRow) {
  return [r.lot.reference, r.lot.composition].filter(Boolean).join(" · ") || "—";
}
function couleur(r: RouleauRow) {
  return [r.lot.couleur, r.lot.codeCouleur].filter(Boolean).join(" · ") || "—";
}

/** 100 × 50 mm : QR 44 mm + toutes les informations. */
function Grande({ r, svg }: { r: RouleauRow; svg: string }) {
  return (
    <div className="etq flex gap-[3mm]">
      <div className="h-[44mm] w-[44mm] shrink-0" dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="flex min-w-0 flex-1 flex-col text-[8.5pt] leading-[1.25]">
        <div className="text-[8pt] font-bold tracking-[0.2em]">DBS FASHION</div>
        <div className="font-mono text-[15pt] font-black leading-tight">{r.code}</div>
        <div className="truncate font-bold">{tissu(r)}</div>
        <div className="truncate">Coul. {couleur(r)}</div>
        <div className="truncate">Lot fourn. {r.lot.lotFournisseur || "—"}</div>
        <div className="truncate">Lot {r.lot.identifiant}{r.reception.client ? ` · ${r.reception.client}` : ""}</div>
        {aRemplir(r) ? (
          <div className="mt-auto">
            <div className="text-[7.5pt]">Reçu {dateFr(r.reception.date)}</div>
            <Case label="Métrage" unite={r.lot.unite} largeur="28mm" />
          </div>
        ) : (
          <div className="mt-auto flex items-end justify-between">
            <span className="text-[13pt] font-black">
              {nb.format(r.metrageInitial)} {r.lot.unite}
            </span>
            <span className="text-[7.5pt]">Reçu {dateFr(r.reception.date)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/** 70 × 37 mm (seule ou en planche A4) : l'essentiel, QR 32 mm. */
function Petite({ r, svg }: { r: RouleauRow; svg: string }) {
  return (
    <div className="etq flex gap-[1.5mm]">
      <div className="qr-petite shrink-0" dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="flex min-w-0 flex-1 flex-col text-[6.5pt] leading-[1.2]">
        <div className="text-[6pt] font-bold tracking-[0.15em]">DBS FASHION</div>
        <div className="font-mono text-[8.5pt] font-black leading-tight">{r.code}</div>
        <div className="truncate font-bold">{tissu(r)}</div>
        <div className="truncate">{couleur(r)}</div>
        <div className="truncate">Lot f. {r.lot.lotFournisseur || "—"}</div>
        {aRemplir(r) ? (
          <div className="mt-auto">
            <Case label="Métr." unite={r.lot.unite} largeur="14mm" />
          </div>
        ) : (
          <div className="mt-auto text-[10pt] font-black">
            {nb.format(r.metrageInitial)} {r.lot.unite}
          </div>
        )}
        <div className="text-[6pt]">Reçu {dateFr(r.reception.date)}</div>
      </div>
    </div>
  );
}

/** 101 × 138,5 mm (4 par A4, marges de la feuille déduites) : QR 62 mm. */
function A6({ r, svg }: { r: RouleauRow; svg: string }) {
  const lignes: [string, string][] = [
    ["Tissu", r.lot.reference || "—"],
    ["Composition", r.lot.composition || "—"],
    ["Couleur", couleur(r)],
    ["Lot fournisseur", r.lot.lotFournisseur || "—"],
    ["Lot DBS", r.lot.identifiant],
    ["Client", r.reception.client || "—"],
    ["Fournisseur", r.reception.fournisseur || "—"],
    ["Laize", r.laize != null ? `${nb.format(r.laize)} cm` : aRemplir(r) ? "________ cm" : "—"],
    ["Réception", `${r.reception.numero} · ${dateFr(r.reception.date)}`],
  ];
  return (
    <div className="etq flex flex-col items-stretch">
      <div className="flex items-baseline justify-between border-b-2 border-black pb-[1.5mm]">
        <span className="text-[10pt] font-bold tracking-[0.25em]">DBS FASHION</span>
        <span className="text-[8pt]">Rouleau tissu</span>
      </div>
      <div className="mt-[2mm] text-center font-mono text-[21pt] font-black leading-none">{r.code}</div>
      <div className="qr-a6 mx-auto my-[2mm]" dangerouslySetInnerHTML={{ __html: svg }} />
      <table className="w-full text-[9pt] leading-[1.3]">
        <tbody>
          {lignes.map(([l, v]) => (
            <tr key={l}>
              <td className="w-[30mm] pr-[2mm] align-top text-[8pt] uppercase text-neutral-600">{l}</td>
              <td className="truncate font-semibold">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-auto flex items-end justify-between border-t-2 border-black pt-[1.5mm]">
        <span className="text-[8pt] uppercase text-neutral-600">{aRemplir(r) ? "Métrage mesuré — à écrire puis scanner" : "Métrage initial"}</span>
        {aRemplir(r) ? (
          <Case label="" unite={r.lot.unite} largeur="38mm" grand />
        ) : (
          <span className="text-[20pt] font-black leading-none">
            {nb.format(r.metrageInitial)} {r.lot.unite}
          </span>
        )}
      </div>
    </div>
  );
}
