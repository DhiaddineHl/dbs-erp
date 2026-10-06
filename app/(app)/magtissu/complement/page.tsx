import { requireUser } from "@/lib/auth/server";
import { demandeComplementTissu } from "@/lib/services/matiere-tissu";
import { Cadre, DocumentImprimable, dateFr, nbFr } from "@/components/shared/document-imprimable";
import { ENTREPRISE } from "@/lib/entreprise";

/* Demande de complément tissu au client : pour chacune de ses commandes, le
 * besoin (sa conso × pièces × chute) que ni le tissu reçu ni son stock libre
 * ne couvrent. Il reste à lui envoyer. */
export default async function ComplementPage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  await requireUser();
  const { client = "" } = await searchParams;
  const lignes = await demandeComplementTissu(client);
  const total = lignes.reduce((s, l) => s + l.etat.aDemander, 0);

  return (
    <DocumentImprimable
      service="Magasin tissu"
      titre="DEMANDE DE COMPLÉMENT TISSU"
      sousTitre={client}
      retour={{ href: "/magtissu", label: "Retour au magasin tissu" }}
      signatures={[`${ENTREPRISE.nom} — nom, date, signature`]}
      pied="Besoin calculé depuis la consommation et le taux de chute de la nomenclature, pour les quantités commandées."
    >
      <div className="grid grid-cols-2 gap-3">
        <Cadre titre="À l'attention de">
          <div className="text-[15px] font-bold">{client || "—"}</div>
        </Cadre>
        <Cadre titre="Total à nous faire parvenir">
          <div className="text-[15px] font-bold">{nbFr.format(total)} m</div>
        </Cadre>
      </div>
      {lignes.length === 0 ? (
        <p className="mt-6 text-center text-neutral-500">Aucun complément à demander : toutes les commandes de ce client sont couvertes.</p>
      ) : (
        <table className="mt-4 w-full border-collapse text-[11.5px]">
          <thead>
            <tr className="border-y border-neutral-400 bg-neutral-100">
              <th className="py-1.5 pl-2 text-left">Commande</th>
              <th className="py-1.5 text-left">Modèle · réf · couleur</th>
              <th className="py-1.5 text-right">Pièces</th>
              <th className="py-1.5 text-right">Conso</th>
              <th className="py-1.5 text-right">Besoin</th>
              <th className="py-1.5 text-right">Reçu / réservé</th>
              <th className="py-1.5 pr-2 text-right">À envoyer</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => (
              <tr key={l.id} className="border-b border-neutral-200">
                <td className="py-1.5 pl-2 font-bold">
                  {l.of}
                  <div className="text-[10px] font-normal text-neutral-500">export {dateFr(l.dateExport)}</div>
                </td>
                <td className="py-1.5">{[l.modele, l.refArticle, l.couleur].filter(Boolean).join(" · ")}</td>
                <td className="py-1.5 text-right tabular-nums">{nbFr.format(l.qte)}</td>
                <td className="py-1.5 text-right tabular-nums">{l.consoTheo ? `${nbFr.format(l.consoTheo)} m/pc` : "—"}</td>
                <td className="py-1.5 text-right tabular-nums">{nbFr.format(l.etat.besoin)} m</td>
                <td className="py-1.5 text-right tabular-nums">{nbFr.format(l.etat.affecte + l.etat.couvrableEnStock)} m</td>
                <td className="py-1.5 pr-2 text-right text-[13px] font-extrabold tabular-nums">{nbFr.format(l.etat.aDemander)} m</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </DocumentImprimable>
  );
}
