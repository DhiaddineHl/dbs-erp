import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { bilanMatiereCommande } from "@/lib/services/matiere-tissu";
import { Cadre, DocumentImprimable, nbFr } from "@/components/shared/document-imprimable";

/* Bilan matière de fin de commande : reçu du client, consommé, chute, reste,
 * rendu — et la consommation réelle face à celle que le client a donnée.
 * C'est la pièce à produire s'il conteste une surconsommation ou réclame du
 * tissu. */
export default async function BilanMatierePage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const d = await bilanMatiereCommande(Number(id));
  if (!d) notFound();
  const { commande: c, bilan: b } = d;
  const signe = (n: number | null) => (n == null ? "—" : `${n > 0 ? "+" : ""}${nbFr.format(n)}`);

  return (
    <DocumentImprimable
      service="Magasin tissu"
      titre="BILAN MATIÈRE"
      numero={c.of}
      sousTitre={c.client}
      retour={{ href: "/magtissu", label: "Retour au magasin tissu" }}
      signatures={["DBS Fashion — nom, date, signature", "Client — visa"]}
      pied="Consommé = sorties de magasin vers la coupe. Pièces = pièces coupées (ou produites à défaut). Conso client = celle de la nomenclature."
    >
      <div className="grid grid-cols-3 gap-3">
        <Cadre titre="Commande">
          <div className="text-[14px] font-bold">{c.modele}</div>
          <div className="text-[11px] text-neutral-600">{[c.refArticle, c.couleur, c.saison].filter(Boolean).join(" · ")}</div>
        </Cadre>
        <Cadre titre="Pièces">
          <div className="text-[14px] font-bold">{nbFr.format(b.pieces)} coupées</div>
          <div className="text-[11px] text-neutral-600">sur {nbFr.format(c.qte)} commandées</div>
        </Cadre>
        <Cadre titre="Consommation / pièce">
          <div className="text-[14px] font-bold">
            réelle {b.consoReelle != null ? `${b.consoReelle} m` : "—"} · client {b.consoClient != null ? `${b.consoClient} m` : "—"}
          </div>
          <div className={`text-[11px] ${b.ecartConsoPct != null && b.ecartConsoPct > 0 ? "text-red-700" : "text-neutral-600"}`}>
            écart {b.ecartConsoPct != null ? `${signe(b.ecartConsoPct)} %` : "—"}
          </div>
        </Cadre>
      </div>

      <table className="mt-4 w-full border-collapse text-[12px]">
        <thead>
          <tr className="border-y border-neutral-400 bg-neutral-100">
            <th className="py-1.5 pl-2 text-left">Bilan</th>
            <th className="py-1.5 text-right">Reçu du client</th>
            <th className="py-1.5 text-right">Consommé</th>
            <th className="py-1.5 text-right">Théorique (conso client × pièces)</th>
            <th className="py-1.5 text-right">Chute / surconso</th>
            <th className="py-1.5 text-right">Rendu</th>
            <th className="py-1.5 pr-2 text-right">Reste en magasin</th>
          </tr>
        </thead>
        <tbody>
          <tr className="text-[14px] font-bold">
            <td className="py-2 pl-2">Total (m)</td>
            <td className="py-2 text-right tabular-nums">{nbFr.format(b.recu)}</td>
            <td className="py-2 text-right tabular-nums">{nbFr.format(b.consomme)}</td>
            <td className="py-2 text-right tabular-nums">{b.theorique != null ? nbFr.format(b.theorique) : "—"}</td>
            <td className={`py-2 text-right tabular-nums ${b.chute != null && b.chute > 0 ? "text-red-700" : ""}`}>
              {signe(b.chute)}
              {b.chutePct != null && <span className="text-[11px] font-normal"> ({signe(b.chutePct)} %)</span>}
            </td>
            <td className="py-2 text-right tabular-nums">{nbFr.format(b.rendu)}</td>
            <td className="py-2 pr-2 text-right tabular-nums">{nbFr.format(b.reste)}</td>
          </tr>
        </tbody>
      </table>
      {c.chutePct != null && (
        <div className="mt-1 text-[11px] text-neutral-500">Chute prévue à la nomenclature : {nbFr.format(c.chutePct)} %.</div>
      )}

      <table className="mt-4 w-full border-collapse text-[11.5px]">
        <thead>
          <tr className="border-y border-neutral-400 bg-neutral-100">
            <th className="py-1.5 pl-2 text-left">Lot</th>
            <th className="py-1.5 text-left">Référence · couleur</th>
            <th className="py-1.5 text-right">Reçu (lot dédié) / réservé</th>
            <th className="py-1.5 text-right">Consommé</th>
            <th className="py-1.5 text-right">Rendu</th>
            <th className="py-1.5 pr-2 text-right">Encore en stock (lot)</th>
          </tr>
        </thead>
        <tbody>
          {d.lots.length === 0 ? (
            <tr>
              <td colSpan={6} className="py-4 text-center text-neutral-500">
                Aucun lot affecté à cette commande dans le magasin tissu.
              </td>
            </tr>
          ) : (
            d.lots.map((l) => (
              <tr key={l.identifiant} className="border-b border-neutral-200">
                <td className="py-1.5 pl-2 font-mono font-bold">{l.identifiant}</td>
                <td className="py-1.5">{[l.reference, l.couleur].filter(Boolean).join(" · ")}</td>
                <td className="py-1.5 text-right tabular-nums">
                  {nbFr.format(l.recu)} {l.unite}
                  <div className="text-[10px] text-neutral-500">{l.exclusif ? "lot dédié à la commande" : "part réservée d'un lot partagé"}</div>
                </td>
                <td className="py-1.5 text-right tabular-nums">{nbFr.format(l.consomme)}</td>
                <td className="py-1.5 text-right tabular-nums">{nbFr.format(l.rendu)}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{nbFr.format(l.resteLot)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </DocumentImprimable>
  );
}
