import { requireUser } from "@/lib/auth/server";
import { manques } from "@/lib/domain/fournitures";
import { lignesEnManque } from "@/lib/services/fournitures";
import { Cadre, DocumentImprimable, dateFr, nbFr } from "@/components/shared/document-imprimable";

/* Demande de complément de fournitures au client (lignes « fourni client »). */
export default async function DemandeFournituresPage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  await requireUser();
  const { client = "" } = await searchParams;
  const { demandes } = manques(await lignesEnManque());
  const d = demandes.find((x) => x.client.toLowerCase() === client.toLowerCase());
  const lignes = d?.lignes ?? [];
  return (
    <DocumentImprimable
      service="Magasin fournitures"
      titre="DEMANDE DE COMPLÉMENT FOURNITURES"
      sousTitre={client}
      retour={{ href: "/magfour/manques", label: "Retour aux manques" }}
      signatures={["DBS Fashion — nom, date, signature"]}
      pied="Quantités calculées depuis la nomenclature (qté par pièce × pièces commandées + casse) ou le prévu de la commande, moins ce qui est déjà reçu."
    >
      <div className="grid grid-cols-2 gap-3">
        <Cadre titre="À l'attention de">
          <div className="text-[15px] font-bold">{client || "—"}</div>
        </Cadre>
        <Cadre titre="Objet">
          <div className="text-[13px]">
            Fournitures manquantes pour <b>{new Set(lignes.map((l) => l.of)).size}</b> commande(s) — merci de nous les faire parvenir au plus vite.
          </div>
        </Cadre>
      </div>
      {lignes.length === 0 ? (
        <p className="mt-6 text-center text-neutral-500">Aucune fourniture manquante pour ce client.</p>
      ) : (
        <table className="mt-4 w-full border-collapse text-[11.5px]">
          <thead>
            <tr className="border-y border-neutral-400 bg-neutral-100">
              <th className="py-1.5 pl-2 text-left">Commande</th>
              <th className="py-1.5 text-left">Modèle</th>
              <th className="py-1.5 text-left">Fourniture</th>
              <th className="py-1.5 text-right">Nécessaire</th>
              <th className="py-1.5 text-right">Reçu</th>
              <th className="py-1.5 pr-2 text-right">À envoyer</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => (
              <tr key={l.ligneId} className="border-b border-neutral-200">
                <td className="py-1.5 pl-2 font-bold">
                  {l.of}
                  <div className="text-[10px] font-normal text-neutral-500">export {dateFr(l.dateExport)}</div>
                </td>
                <td className="py-1.5">{l.modele}</td>
                <td className="py-1.5">{l.designation || "—"}</td>
                <td className="py-1.5 text-right tabular-nums">
                  {nbFr.format(l.qtePrevue)} {l.unite}
                </td>
                <td className="py-1.5 text-right tabular-nums">{nbFr.format(l.qteRecue)}</td>
                <td className="py-1.5 pr-2 text-right text-[13px] font-extrabold tabular-nums">
                  {nbFr.format(l.manque)} {l.unite}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </DocumentImprimable>
  );
}
