import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { bonRetourFournitures } from "@/lib/services/fournitures";
import { Cadre, DocumentImprimable, dateFr, nbFr } from "@/components/shared/document-imprimable";
import { ENTREPRISE } from "@/lib/entreprise";

/* Bon de retour des restes de fournitures au client. */
export default async function BonRetourFournituresPage({ params }: { params: Promise<{ numero: string }> }) {
  await requireUser();
  const { numero } = await params;
  const b = await bonRetourFournitures(decodeURIComponent(numero));
  if (!b) notFound();
  return (
    <DocumentImprimable
      service="Magasin fournitures"
      titre="BON DE RETOUR — FOURNITURES"
      numero={b.numero}
      sousTitre={`du ${dateFr(b.date)}`}
      retour={{ href: "/magfour/restes", label: "Retour aux restes" }}
      signatures={[`${ENTREPRISE.nom} — remis par`, "Client / transporteur — reçu par"]}
      pied="Restes des fournitures confiées par le client, restitués en quantités."
    >
      <div className="grid grid-cols-2 gap-3">
        <Cadre titre="Client">
          <div className="text-[15px] font-bold">{b.client || "—"}</div>
        </Cadre>
        <Cadre titre="Nombre d'articles">
          <div className="text-[15px] font-bold">{b.restes.length}</div>
        </Cadre>
      </div>
      <table className="mt-4 w-full border-collapse text-[12px]">
        <thead>
          <tr className="border-y border-neutral-400 bg-neutral-100">
            <th className="py-1.5 pl-2 text-left">Fourniture</th>
            <th className="py-1.5 text-left">Commande d&apos;origine</th>
            <th className="py-1.5 pr-2 text-right">Quantité rendue</th>
          </tr>
        </thead>
        <tbody>
          {b.restes.map((r) => (
            <tr key={r.id} className="border-b border-neutral-200">
              <td className="py-1.5 pl-2 font-semibold">{r.designation}</td>
              <td className="py-1.5">{r.origineOf || "—"}</td>
              <td className="py-1.5 pr-2 text-right font-bold tabular-nums">
                {nbFr.format(r.qte)} {r.unite}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </DocumentImprimable>
  );
}
