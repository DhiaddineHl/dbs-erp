import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { bonSortie } from "@/lib/services/rouleaux";
import { Cadre, DocumentImprimable, dateFr, nbFr } from "@/components/shared/document-imprimable";

/* Bon de sortie groupée de tissu (BST-AAAA-NNN). Vers un sous-traitant, c'est
 * le bon de livraison qui accompagne les rouleaux et qu'il signe à réception. */
export default async function BonSortiePage({ params }: { params: Promise<{ numero: string }> }) {
  await requireUser();
  const b = await bonSortie(decodeURIComponent((await params).numero));
  if (!b) notFound();
  const actives = b.lignes.filter((l) => !l.annule);
  const totaux = new Map<string, number>();
  for (const l of actives) totaux.set(l.unite, (totaux.get(l.unite) ?? 0) + l.quantite);
  const st = b.destination === "soustraitant";
  return (
    <DocumentImprimable
      service="Magasin tissu"
      titre={st ? "BON DE LIVRAISON TISSU — SOUS-TRAITANCE" : "BON DE SORTIE TISSU"}
      numero={b.numero}
      sousTitre={`du ${dateFr(b.date.slice(0, 10))}`}
      retour={{ href: "/magtissu?onglet=rouleaux", label: "Retour aux rouleaux" }}
      signatures={st ? ["DBS Fashion — remis par", `${b.faconnierNom || "Sous-traitant"} — reçu par`] : ["Magasin tissu — remis par", "Coupe — reçu par"]}
      pied={b.motif ? `Motif : ${b.motif}` : "Tissu confié pour la coupe du modèle indiqué. Tout reliquat revient au magasin tissu avec son étiquette QR."}
    >
      <div className="grid grid-cols-3 gap-3">
        <Cadre titre={st ? "Sous-traitant" : "Destination"}>
          <div className="text-[15px] font-bold">{st ? b.faconnierNom || "—" : b.lieu}</div>
        </Cadre>
        <Cadre titre="Modèle / commande">
          <div className="text-[14px] font-bold">{b.commandeLabel || "—"}</div>
        </Cadre>
        <Cadre titre="Total">
          <div className="text-[14px] font-bold">
            {actives.length} rouleau(x) · {[...totaux.entries()].map(([u, q]) => `${nbFr.format(q)} ${u}`).join(" · ")}
          </div>
        </Cadre>
      </div>
      <table className="mt-4 w-full border-collapse text-[11.5px]">
        <thead>
          <tr className="border-y border-neutral-400 bg-neutral-100">
            <th className="py-1.5 pl-2 text-left">Rouleau</th>
            <th className="py-1.5 text-left">Lot</th>
            <th className="py-1.5 text-left">Tissu</th>
            <th className="py-1.5 text-left">Couleur</th>
            <th className="py-1.5 text-left">Lot fourn.</th>
            <th className="py-1.5 text-right">Laize</th>
            <th className="py-1.5 pr-2 text-right">Métrage</th>
          </tr>
        </thead>
        <tbody>
          {b.lignes.map((l) => (
            <tr key={l.code} className={`border-b border-neutral-200 ${l.annule ? "text-neutral-400 line-through" : ""}`}>
              <td className="py-1.5 pl-2 font-mono font-bold">{l.code}</td>
              <td className="py-1.5">{l.lot}</td>
              <td className="py-1.5">{l.tissu || "—"}</td>
              <td className="py-1.5">{l.couleur || "—"}</td>
              <td className="py-1.5">{l.lotFournisseur || "—"}</td>
              <td className="py-1.5 text-right">{l.laize != null ? `${nbFr.format(l.laize)} cm` : "—"}</td>
              <td className="py-1.5 pr-2 text-right font-bold tabular-nums">
                {nbFr.format(l.quantite)} {l.unite}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {b.lignes.some((l) => l.annule) && <p className="mt-2 text-[11px] text-neutral-500">Lignes barrées : sortie annulée depuis.</p>}
      <p className="mt-2 text-[11px] text-neutral-500">Préparé par {b.par}.</p>
    </DocumentImprimable>
  );
}
