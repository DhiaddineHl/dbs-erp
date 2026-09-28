import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { bonRetourTissu } from "@/lib/services/matiere-tissu";
import { Cadre, DocumentImprimable, dateFr, nbFr } from "@/components/shared/document-imprimable";

/* Bon de retour des reliquats de tissu au client. */
export default async function BonRetourPage({ params }: { params: Promise<{ numero: string }> }) {
  await requireUser();
  const { numero } = await params;
  const b = await bonRetourTissu(decodeURIComponent(numero));
  if (!b) notFound();
  const totaux = new Map<string, number>();
  for (const l of b.lignes) totaux.set(l.unite, (totaux.get(l.unite) ?? 0) + l.quantite);

  return (
    <DocumentImprimable
      service="Magasin tissu"
      titre="BON DE RETOUR — RELIQUATS TISSU"
      numero={b.numero}
      sousTitre={`du ${dateFr(b.date)}`}
      retour={{ href: "/magtissu?onglet=reliquats", label: "Retour aux reliquats" }}
      signatures={["DBS Fashion — remis par", "Client / transporteur — reçu par"]}
      pied="Reliquats de la matière confiée par le client, restitués après coupe."
    >
      <div className="grid grid-cols-3 gap-3">
        <Cadre titre="Client">
          <div className="text-[15px] font-bold">{b.client || "—"}</div>
        </Cadre>
        <Cadre titre="Préparé par">
          <div className="text-[14px] font-bold">{b.par || "—"}</div>
        </Cadre>
        <Cadre titre="Total rendu">
          <div className="text-[14px] font-bold">
            {[...totaux.entries()].map(([u, q]) => `${nbFr.format(q)} ${u}`).join(" · ")}
          </div>
        </Cadre>
      </div>
      <table className="mt-4 w-full border-collapse text-[12px]">
        <thead>
          <tr className="border-y border-neutral-400 bg-neutral-100">
            <th className="py-1.5 pl-2 text-left">Lot</th>
            <th className="py-1.5 text-left">Référence</th>
            <th className="py-1.5 text-left">Couleur</th>
            <th className="py-1.5 text-left">Saison</th>
            <th className="py-1.5 text-left">Dernière commande</th>
            <th className="py-1.5 pr-2 text-right">Quantité rendue</th>
          </tr>
        </thead>
        <tbody>
          {b.lignes.map((l, i) => (
            <tr key={i} className="border-b border-neutral-200">
              <td className="py-1.5 pl-2 font-mono font-bold">{l.identifiant}</td>
              <td className="py-1.5">{l.reference || "—"}</td>
              <td className="py-1.5">{l.couleur || "—"}</td>
              <td className="py-1.5">{l.saison || "—"}</td>
              <td className="py-1.5">{l.of || "—"}</td>
              <td className="py-1.5 pr-2 text-right font-bold tabular-nums">
                {nbFr.format(l.quantite)} {l.unite}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </DocumentImprimable>
  );
}
