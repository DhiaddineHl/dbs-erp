import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { bonRetourTissu } from "@/lib/services/matiere-tissu";
import { Cadre, DocumentImprimable, dateFr, nbFr } from "@/components/shared/document-imprimable";

/* Bon de retour tissu. Deux flux distincts, même document :
 *   - RT-  : reliquats rendus au CLIENT (matière qu'il nous a confiée) ;
 *   - RTF- : rouleaux renvoyés au FOURNISSEUR (défaut, erreur de livraison). */
export default async function BonRetourPage({ params }: { params: Promise<{ numero: string }> }) {
  await requireUser();
  const { numero } = await params;
  const b = await bonRetourTissu(decodeURIComponent(numero));
  if (!b) notFound();
  const totaux = new Map<string, number>();
  for (const l of b.lignes) totaux.set(l.unite, (totaux.get(l.unite) ?? 0) + l.quantite);
  const fournisseur = b.genre === "retour_fournisseur";
  const avecRouleaux = b.lignes.some((l) => l.rouleau);

  return (
    <DocumentImprimable
      service="Magasin tissu"
      titre={fournisseur ? "BON DE RETOUR FOURNISSEUR — TISSU" : "BON DE RETOUR — RELIQUATS TISSU"}
      numero={b.numero}
      sousTitre={`du ${dateFr(b.date)}`}
      retour={fournisseur ? { href: "/magtissu?onglet=rouleaux", label: "Retour aux rouleaux" } : { href: "/magtissu?onglet=reliquats", label: "Retour aux reliquats" }}
      signatures={fournisseur ? ["DBS Fashion — remis par", "Fournisseur / transporteur — reçu par"] : ["DBS Fashion — remis par", "Client / transporteur — reçu par"]}
      pied={fournisseur ? `Motif du retour : ${b.motif || "—"}` : "Reliquats de la matière confiée par le client, restitués après coupe."}
    >
      <div className="grid grid-cols-3 gap-3">
        <Cadre titre={fournisseur ? "Fournisseur" : "Client"}>
          <div className="text-[15px] font-bold">{(fournisseur ? b.fournisseur : b.client) || "—"}</div>
          {fournisseur && b.motif && <div className="text-[12px]">Motif : {b.motif}</div>}
        </Cadre>
        <Cadre titre="Préparé par">
          <div className="text-[14px] font-bold">{b.par || "—"}</div>
        </Cadre>
        <Cadre titre={fournisseur ? "Total retourné" : "Total rendu"}>
          <div className="text-[14px] font-bold">
            {[...totaux.entries()].map(([u, q]) => `${nbFr.format(q)} ${u}`).join(" · ")}
          </div>
        </Cadre>
      </div>
      <table className="mt-4 w-full border-collapse text-[12px]">
        <thead>
          <tr className="border-y border-neutral-400 bg-neutral-100">
            <th className="py-1.5 pl-2 text-left">Lot</th>
            {avecRouleaux && <th className="py-1.5 text-left">Rouleau</th>}
            <th className="py-1.5 text-left">Référence</th>
            <th className="py-1.5 text-left">Couleur</th>
            <th className="py-1.5 text-left">Saison</th>
            <th className="py-1.5 text-left">Dernière commande</th>
            <th className="py-1.5 pr-2 text-right">{fournisseur ? "Quantité retournée" : "Quantité rendue"}</th>
          </tr>
        </thead>
        <tbody>
          {b.lignes.map((l, i) => (
            <tr key={i} className="border-b border-neutral-200">
              <td className="py-1.5 pl-2 font-mono font-bold">{l.identifiant}</td>
              {avecRouleaux && <td className="py-1.5 font-mono">{l.rouleau || "—"}</td>}
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
