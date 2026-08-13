import { CalendarRange } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { SectionPanel } from "@/components/shared/section-panel";
import { BoutonImprimer } from "@/components/shared/bouton-imprimer";
import { requireUser } from "@/lib/auth/server";
import { libelleMoisExport } from "@/lib/domain/aval";
import { getPlanFaconnier } from "@/lib/services/aval";
import { Kpi, Tuiles } from "../aval/ui";

const nb = new Intl.NumberFormat("fr-FR");
const eur = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

/* Plan façonnier mensuel : qui doit livrer quoi, et quand.
 *
 * La colonne qui compte est le « restant » — ce qui n'est pas encore produit.
 * Un façonnier chargé de 20 000 pièces dont 19 000 sont faites n'a pas de
 * problème de capacité ; l'inverse, si. */
export default async function PlanFaconPage() {
  await requireUser();
  const { plans, mois } = await getPlanFaconnier();

  const totalRestant = plans.reduce((s, p) => s + p.total.restant, 0);
  const totalQte = plans.reduce((s, p) => s + p.total.qte, 0);
  const totalCa = plans.reduce((s, p) => s + p.total.ca, 0);
  const nonAssigne = plans.find((p) => p.faconnier === "Non assigné");

  return (
    <>
      <div className="no-print">
        <PageHeader
          icon={CalendarRange}
          title="Plan façonnier"
          description="Charge mensuelle par façonnier, d'après les dates d'export prévues"
          actions={<BoutonImprimer label="Imprimer le plan" />}
        />
      </div>
      <style>{`@media print { .no-print { display: none !important } @page { margin: 12mm landscape } }`}</style>

      <Tuiles>
        <Kpi label="Façonniers / chaînes" valeur={String(plans.length)} />
        <Kpi label="Pièces planifiées" valeur={nb.format(totalQte)} tone="brand" />
        <Kpi label="Reste à produire" valeur={nb.format(totalRestant)} tone="warning" />
        <Kpi
          label="Non assigné"
          valeur={nonAssigne ? nb.format(nonAssigne.total.restant) : "0"}
          tone={nonAssigne ? "danger" : "neutral"}
          sub="pièces sans façonnier ni chaîne"
        />
      </Tuiles>

      <SectionPanel title={`Charge par mois — ${eur.format(totalCa)} € de CA planifié`} flush>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/40 text-[10.5px] uppercase text-muted-foreground">
                <th className="sticky left-0 z-10 bg-muted/40 px-3 py-2 text-left">Façonnier</th>
                {mois.map((m) => (
                  <th key={m || "sansdate"} className="px-3 py-2 text-right">
                    {libelleMoisExport(m)}
                  </th>
                ))}
                <th className="px-3 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {plans.length === 0 ? (
                <tr>
                  <td colSpan={mois.length + 2} className="py-10 text-center text-muted-foreground">
                    Aucune commande active à planifier.
                  </td>
                </tr>
              ) : (
                plans.map((p) => (
                  <tr key={p.faconnier} className="border-b last:border-0">
                    <td className="sticky left-0 z-10 bg-card px-3 py-2">
                      <b>{p.faconnier}</b>
                      <div className="text-[10px] text-muted-foreground">
                        {p.total.nbCommandes} commande(s) · {eur.format(p.total.ca)} €
                      </div>
                    </td>
                    {mois.map((m) => {
                      const c = p.parMois[m];
                      return (
                        <td key={m || "sansdate"} className="px-3 py-2 text-right">
                          {!c ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <>
                              <div className="font-semibold tabular-nums">{nb.format(c.qte)}</div>
                              <div
                                className={`text-[10px] tabular-nums ${c.restant > 0 ? "text-[var(--danger-d)]" : "text-success-foreground"}`}
                              >
                                {c.restant > 0 ? `reste ${nb.format(c.restant)}` : "à jour"}
                              </div>
                            </>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-right">
                      <div className="font-bold tabular-nums">{nb.format(p.total.qte)}</div>
                      <div className="text-[10px] tabular-nums text-muted-foreground">
                        reste {nb.format(p.total.restant)}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {plans.length > 0 && (
              <tfoot>
                <tr className="border-t-2 bg-muted/40 font-bold">
                  <td className="sticky left-0 z-10 bg-muted/40 px-3 py-2 uppercase">Total</td>
                  {mois.map((m) => {
                    const q = plans.reduce((s, p) => s + (p.parMois[m]?.qte ?? 0), 0);
                    const r = plans.reduce((s, p) => s + (p.parMois[m]?.restant ?? 0), 0);
                    return (
                      <td key={m || "sansdate"} className="px-3 py-2 text-right">
                        <div className="tabular-nums">{nb.format(q)}</div>
                        <div className="text-[10px] font-normal tabular-nums text-muted-foreground">
                          reste {nb.format(r)}
                        </div>
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-right">
                    <div className="tabular-nums">{nb.format(totalQte)}</div>
                    <div className="text-[10px] font-normal tabular-nums text-muted-foreground">
                      reste {nb.format(totalRestant)}
                    </div>
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </SectionPanel>

      <p className="mt-3 text-[11px] text-muted-foreground">
        Le mois retenu est celui de la prévision d&apos;export quand elle est saisie, sinon celui de la date
        contractuelle. Les commandes sans date figurent dans la colonne « sans date ».
      </p>
    </>
  );
}
