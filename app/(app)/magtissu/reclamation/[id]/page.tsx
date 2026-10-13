import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { listReceptions } from "@/lib/services/tissu";
import { Cadre, DocumentImprimable, dateFr, nbFr } from "@/components/shared/document-imprimable";
import { ENTREPRISE } from "@/lib/entreprise";

/* Réclamation client — tissu : ce qui manque ou ne va pas à la RÉCEPTION,
 * face au bon de livraison du client. À envoyer avant la coupe : après, plus
 * rien ne prouve que l'écart était là à l'arrivée. */
export default async function ReclamationPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const r = (await listReceptions()).find((x) => x.id === Number(id));
  if (!r) notFound();
  const lots = r.lots;
  const litiges = lots.filter((l) => l.ecarts.aReclamer);
  const totalManque = litiges.reduce((s, l) => s + l.ecarts.manque, 0);

  return (
    <DocumentImprimable
      service="Magasin tissu"
      titre="RÉCLAMATION CLIENT — TISSU"
      numero={`${r.numero}`}
      sousTitre={`Réception du ${dateFr(r.date)}`}
      retour={{ href: "/magtissu?onglet=lots", label: "Retour au magasin tissu" }}
      signatures={[`Magasin ${ENTREPRISE.nomCourt} — nom, date, signature`, "Visa responsable"]}
      pied="Écarts constatés à la réception, avant toute coupe. Les métrages mesurés font foi pour la mise en stock."
    >
      <div className="grid grid-cols-3 gap-3">
        <Cadre titre="Client">
          <div className="text-[15px] font-bold">{r.client || "—"}</div>
        </Cadre>
        <Cadre titre="Bon de livraison client">
          <div className="text-[15px] font-bold">{r.blClient || "non indiqué"}</div>
          {r.fournisseur && <div className="text-[11px] text-neutral-600">Expédié par {r.fournisseur}</div>}
        </Cadre>
        <Cadre titre="Synthèse">
          <div className="text-[13px]">
            <b>{litiges.length}</b> lot(s) en écart sur {lots.length}
            {totalManque > 0 && (
              <>
                {" "}
                · manque total <b>{nbFr.format(totalManque)} m</b>
              </>
            )}
          </div>
        </Cadre>
      </div>

      <table className="mt-4 w-full border-collapse text-[11.5px]">
        <thead>
          <tr className="border-y border-neutral-400 bg-neutral-100">
            <th className="py-1.5 pl-2 text-left">Lot</th>
            <th className="py-1.5 text-left">Référence · couleur</th>
            <th className="py-1.5 text-right">Annoncé</th>
            <th className="py-1.5 text-right">Mesuré</th>
            <th className="py-1.5 text-right">Écart</th>
            <th className="py-1.5 text-right">Laize ann. / réelle</th>
            <th className="py-1.5 pl-3 text-left">Motifs</th>
          </tr>
        </thead>
        <tbody>
          {lots.map((l) => (
            <tr key={l.id} className={`border-b border-neutral-200 align-top ${l.ecarts.aReclamer ? "" : "text-neutral-400"}`}>
              <td className="py-1.5 pl-2 font-mono font-bold">{l.identifiant}</td>
              <td className="py-1.5">{[l.reference, l.couleur].filter(Boolean).join(" · ") || "—"}</td>
              <td className="py-1.5 text-right tabular-nums">{l.quantiteAnnoncee != null ? `${nbFr.format(l.quantiteAnnoncee)} ${l.unite}` : "—"}</td>
              <td className="py-1.5 text-right tabular-nums">
                {nbFr.format(l.quantiteRecue)} {l.unite}
              </td>
              <td className={`py-1.5 text-right font-bold tabular-nums ${l.ecarts.manque > 0 ? "text-red-700" : ""}`}>
                {l.ecarts.ecartMetrage != null ? `${l.ecarts.ecartMetrage > 0 ? "+" : ""}${nbFr.format(l.ecarts.ecartMetrage)}` : "—"}
              </td>
              <td className={`py-1.5 text-right tabular-nums ${l.ecarts.laizeNonConforme ? "font-bold text-red-700" : ""}`}>
                {l.laizeAnnoncee ?? "—"} / {l.laize ?? "—"}
              </td>
              <td className="py-1.5 pl-3">
                {l.ecarts.motifs.length ? (
                  <ul className="list-disc pl-4">
                    {l.ecarts.motifs.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                ) : (
                  "conforme"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 rounded border border-neutral-300 px-3 py-2 text-[12px]">
        <b>Demande :</b> merci de nous confirmer sous 48 h le complément à expédier (manques) ou le remplacement des rouleaux
        défectueux / hors laize, afin de ne pas retarder la coupe. Sans retour de votre part, la coupe sera réalisée sur le
        métrage mesuré ci-dessus.
      </div>
    </DocumentImprimable>
  );
}
