import type { BonSortie } from "@/lib/services/rouleaux";
import { Cadre, DocumentImprimable, dateFr, nbFr } from "@/components/shared/document-imprimable";

/* Mise en page commune du bon de sortie groupée (BST) et du bon
 * récapitulatif (BSR) : destinataire, modèle(s), total, une ligne par rouleau,
 * signatures « remis par / reçu par ». Le récapitulatif ajoute la colonne du
 * bon d'origine de chaque rouleau et le rappel des bons qu'il regroupe. */
export function DocumentSortie({
  b,
  recap,
}: {
  b: BonSortie;
  /** Bon récapitulatif : bons d'origine regroupés, date d'émission. */
  recap?: { bonsOrigine: string[]; emisLe: string; emisPar: string };
}) {
  const actives = b.lignes.filter((l) => !l.annule);
  const totaux = new Map<string, number>();
  for (const l of actives) totaux.set(l.unite, (totaux.get(l.unite) ?? 0) + l.quantite);
  const nbRouleaux = new Set(actives.map((l) => l.code)).size;
  const st = b.destination === "soustraitant";
  // Rouleaux de plusieurs commandes : la commande de chaque rouleau apparaît sur sa ligne.
  const parLigne = b.plusieursCommandes;
  const j1 = b.date.slice(0, 10);
  const j2 = b.dateFin.slice(0, 10);
  const periode = j1 === j2 ? `du ${dateFr(j1)}` : `du ${dateFr(j1)} au ${dateFr(j2)}`;
  return (
    <DocumentImprimable
      service="Magasin tissu"
      titre={
        recap
          ? st
            ? "BON RÉCAPITULATIF — LIVRAISON TISSU SOUS-TRAITANCE"
            : "BON RÉCAPITULATIF — SORTIE TISSU"
          : st
            ? "BON DE LIVRAISON TISSU — SOUS-TRAITANCE"
            : "BON DE SORTIE TISSU"
      }
      numero={b.numero}
      sousTitre={recap ? `émis le ${dateFr(recap.emisLe.slice(0, 10))} · sorties ${periode}` : j1 === j2 ? periode : `sorties ${periode}`}
      retour={{ href: "/magtissu?onglet=rouleaux", label: "Retour aux rouleaux" }}
      signatures={st ? ["DBS Fashion — remis par", `${b.faconnierNom || "Sous-traitant"} — reçu par`] : ["Magasin tissu — remis par", "Coupe — reçu par"]}
      pied={
        b.motif
          ? `Motif : ${b.motif}`
          : recap
            ? "Ce récapitulatif regroupe, pour signature, des rouleaux déjà sortis ; les bons d'origine restent valables. Tout reliquat revient au magasin tissu avec son étiquette QR."
            : "Tissu confié pour la coupe du modèle indiqué. Tout reliquat revient au magasin tissu avec son étiquette QR."
      }
    >
      <div className="grid grid-cols-3 gap-3">
        <Cadre titre={st ? "Sous-traitant" : "Destination"}>
          <div className="text-[15px] font-bold">{st ? b.faconnierNom || "—" : b.lieu}</div>
        </Cadre>
        <Cadre titre="Modèle / commande">
          <div className="text-[14px] font-bold">{parLigne ? "Plusieurs — voir le détail" : b.commandeLabel || "—"}</div>
        </Cadre>
        <Cadre titre="Total">
          <div className="text-[14px] font-bold">
            {nbRouleaux} rouleau(x) · {[...totaux.entries()].map(([u, q]) => `${nbFr.format(q)} ${u}`).join(" · ")}
          </div>
        </Cadre>
      </div>
      {recap && recap.bonsOrigine.length > 0 && (
        <p className="mt-3 text-[11px]">
          <b>Regroupe les bons :</b> {recap.bonsOrigine.join(", ")}
        </p>
      )}
      <table className="mt-4 w-full border-collapse text-[11.5px]">
        <thead>
          <tr className="border-y border-neutral-400 bg-neutral-100">
            <th className="py-1.5 pl-2 text-left">Rouleau</th>
            {parLigne && <th className="py-1.5 text-left">Modèle / OF</th>}
            {recap && <th className="py-1.5 text-left">Bon d&apos;origine</th>}
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
            <tr key={l.id} className={`border-b border-neutral-200 ${l.annule ? "text-neutral-400 line-through" : ""}`}>
              <td className="py-1.5 pl-2 font-mono font-bold">{l.code}</td>
              {parLigne && <td className="py-1.5">{l.commande || "—"}</td>}
              {recap && <td className="py-1.5 font-mono">{l.bon || "—"}</td>}
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
      <p className="mt-2 text-[11px] text-neutral-500">
        Sorti par {b.sortiPar.join(", ") || b.par}
        {recap ? ` · récapitulatif établi par ${recap.emisPar || "—"}` : ""}.
      </p>
    </DocumentImprimable>
  );
}
