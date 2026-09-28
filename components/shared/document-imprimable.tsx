import Link from "next/link";
import { BoutonImprimer } from "@/components/shared/bouton-imprimer";

/* Coquille commune des documents imprimables (réclamation, demande de
 * complément, bilan matière, bon de retour, liste d'achat…) : même en-tête
 * DBS FASHION, même bandeau d'actions masqué à l'impression, mêmes
 * signatures. Page normale : l'impression du navigateur produit le PDF. */
export function DocumentImprimable({
  service,
  titre,
  numero,
  sousTitre,
  retour,
  children,
  signatures,
  pied,
}: {
  service: string;
  titre: string;
  numero?: string;
  sousTitre?: string;
  retour: { href: string; label: string };
  children: React.ReactNode;
  signatures?: string[];
  pied?: string;
}) {
  return (
    <div className="mx-auto max-w-4xl bg-white p-8 text-[12px] text-neutral-900 print:p-0">
      <style>{`@media print { .no-print { display: none !important } @page { margin: 12mm; size: A4 portrait } }`}</style>
      <div className="no-print mb-4 flex items-center gap-2">
        <BoutonImprimer label="Imprimer / PDF" />
        <Link href={retour.href} className="rounded-md border px-3 py-1.5 text-xs font-semibold">
          ← {retour.label}
        </Link>
      </div>

      <div className="flex items-start justify-between border-b-2 border-neutral-900 pb-3">
        <div>
          <div className="text-xl font-extrabold tracking-tight">DBS FASHION</div>
          <div className="text-[11px] uppercase tracking-widest text-neutral-500">{service}</div>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold">{titre}</div>
          {numero && <div className="text-[15px] font-extrabold">{numero}</div>}
          <div className="text-[11px] text-neutral-500">
            {sousTitre ? `${sousTitre} · ` : ""}Édité le {new Date().toLocaleDateString("fr-FR")}
          </div>
        </div>
      </div>

      <div className="mt-4">{children}</div>

      {signatures && signatures.length > 0 && (
        <div className="mt-10 grid gap-8 text-[11px]" style={{ gridTemplateColumns: `repeat(${signatures.length}, minmax(0, 1fr))` }}>
          {signatures.map((l) => (
            <div key={l}>
              <div className="font-semibold text-neutral-500">{l}</div>
              <div className="mt-1 h-16 rounded border border-dashed border-neutral-400" />
            </div>
          ))}
        </div>
      )}
      <div className="mt-6 border-t border-neutral-300 pt-2 text-[10.5px] text-neutral-500">
        Document généré par PilotPro — DBS Fashion.{pied ? ` ${pied}` : ""}
      </div>
    </div>
  );
}

export function Cadre({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div className="rounded border border-neutral-300 px-3 py-2">
      <div className="text-[9.5px] font-bold uppercase text-neutral-500">{titre}</div>
      {children}
    </div>
  );
}

export const nbFr = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
export const dateFr = (iso: string | null | undefined) =>
  iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10).split("-").reverse().join("/") : iso || "—";
