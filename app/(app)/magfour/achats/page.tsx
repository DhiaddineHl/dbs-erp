import { requireUser } from "@/lib/auth/server";
import { manques } from "@/lib/domain/fournitures";
import { lignesEnManque } from "@/lib/services/fournitures";
import { DocumentImprimable, nbFr } from "@/components/shared/document-imprimable";
import { ENTREPRISE } from "@/lib/entreprise";

/* Liste d'achat DBS (commandes CMT) : les manques des lignes « acheté DBS »,
 * cumulés par article et regroupés par fournisseur — en quantités. */
export default async function ListeAchatPage() {
  await requireUser();
  const { achats } = manques(await lignesEnManque());
  return (
    <DocumentImprimable
      service="Magasin fournitures"
      titre={`LISTE D'ACHAT — FOURNITURES ${ENTREPRISE.nomMaj}`}
      retour={{ href: "/magfour/manques", label: "Retour aux manques" }}
      signatures={["Établie par", "Visa responsable"]}
      pied={`Uniquement les lignes « acheté par ${ENTREPRISE.nomCourt} » (CMT). Les fournitures du client font l'objet d'une demande de complément.`}
    >
      {achats.length === 0 ? (
        <p className="mt-6 text-center text-neutral-500">Rien à acheter.</p>
      ) : (
        achats.map((f) => (
          <div key={f.fournisseur} className="mb-5">
            <div className="border-b-2 border-neutral-800 pb-1 text-[14px] font-extrabold">{f.fournisseur}</div>
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr className="border-b border-neutral-300 text-[10.5px] uppercase text-neutral-500">
                  <th className="py-1 pl-2 text-left">Article</th>
                  <th className="py-1 text-right">Quantité</th>
                  <th className="py-1 pl-4 text-left">Pour les commandes</th>
                  <th className="w-24 py-1 text-center">Commandé ✓</th>
                </tr>
              </thead>
              <tbody>
                {f.articles.map((a) => (
                  <tr key={`${a.designation}-${a.unite}`} className="border-b border-neutral-200">
                    <td className="py-1.5 pl-2 font-semibold">{a.designation}</td>
                    <td className="py-1.5 text-right font-bold tabular-nums">
                      {nbFr.format(a.qte)} {a.unite}
                    </td>
                    <td className="py-1.5 pl-4 text-neutral-600">{a.ofs.join(", ")}</td>
                    <td className="py-1.5 text-center">☐</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}
    </DocumentImprimable>
  );
}
