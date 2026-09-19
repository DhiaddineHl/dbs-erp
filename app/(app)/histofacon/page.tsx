import { ScrollText } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { SectionPanel } from "@/components/shared/section-panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { bilansFaconniersNommes } from "@/lib/services/faconnier-histo";
import { SEUILS_QUALITE } from "@/lib/domain/seuils";

/* Historique factuel par façonnier (§14) — des faits, pas un score.
 *
 * Lecture seule : tout est dérivé des confiages et des réceptions (BR). La
 * direction lit et décide ; l'application ne juge pas. */
const nb = new Intl.NumberFormat("fr-FR");
const euro = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

export default async function HistoFaconPage() {
  const bilans = await bilansFaconniersNommes();

  return (
    <>
      <PageHeader
        icon={ScrollText}
        title="Historique façonniers"
        description="Confié, reçu, conforme, retards et coût façon — des données objectives, sans note arbitraire"
      />

      {bilans.length === 0 ? (
        <SectionPanel title="Historique">
          <div className="py-10 text-center text-sm text-muted-foreground">
            Aucun confiage ni réception enregistrés pour l&apos;instant. L&apos;historique se construit au fil des
            confiages façonnier et des bons de réception.
          </div>
        </SectionPanel>
      ) : (
        <SectionPanel title={`Façonniers (${bilans.length})`} flush>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2">Façonnier</th>
                  <th className="px-3 py-2 text-center">OF</th>
                  <th className="px-3 py-2 text-right">Confié</th>
                  <th className="px-3 py-2 text-right">Reçu</th>
                  <th className="px-3 py-2 text-right">Conforme</th>
                  <th className="px-3 py-2 text-right">Non conforme</th>
                  <th className="px-3 py-2 text-right">En cours</th>
                  <th className="px-3 py-2 text-center">Taux conf.</th>
                  <th className="px-3 py-2 text-center">Retard moyen</th>
                  <th className="px-3 py-2 text-right">CA façon confié</th>
                </tr>
              </thead>
              <tbody>
                {bilans.map((b) => (
                  <tr key={b.faconnierId} className="border-b">
                    <td className="px-3 py-2 font-semibold">{b.nom}</td>
                    <td className="px-3 py-2 text-center tabular-nums">{b.ofConfies}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{nb.format(b.qteConfiee)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{nb.format(b.qteRecue)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{nb.format(b.qteConforme)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{b.qteNonConforme ? nb.format(b.qteNonConforme) : "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{b.qteEnCours ? nb.format(b.qteEnCours) : "—"}</td>
                    <td className="px-3 py-2 text-center">
                      {b.tauxConformite === null ? (
                        "—"
                      ) : (
                        <StatusBadge
                          tone={
                            b.tauxConformite >= SEUILS_QUALITE.bon
                              ? "success"
                              : b.tauxConformite >= SEUILS_QUALITE.alerte
                                ? "warning"
                                : "danger"
                          }
                        >
                          {b.tauxConformite}%
                        </StatusBadge>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center tabular-nums">
                      {b.retardMoyenJours === null
                        ? "—"
                        : b.retardMoyenJours > 0
                          ? `+${b.retardMoyenJours} j`
                          : `${b.retardMoyenJours} j`}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{euro.format(b.caConfie)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionPanel>
      )}
    </>
  );
}
