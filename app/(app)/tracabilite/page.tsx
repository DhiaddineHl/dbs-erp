import { SearchCheck } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { BoutonImprimer } from "@/components/shared/bouton-imprimer";
import { requireUser } from "@/lib/auth/server";
import { getFrise, listCommandesTracables } from "@/lib/services/tracabilite";
import { Selecteur } from "./selecteur";

const nb = new Intl.NumberFormat("fr-FR");
const dateFr = (iso: string | null) =>
  iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split("-").reverse().join("/") : "—";

/* Traçabilité : toute la vie d'une commande sur une page, reconstituée depuis
 * les faits enregistrés par les autres modules. Rien n'est saisi ici. */
export default async function TracabilitePage({
  searchParams,
}: {
  searchParams: Promise<{ of?: string }>;
}) {
  await requireUser();
  const { of } = await searchParams;
  const id = of ? Number(of) : null;
  const [commandes, frise] = await Promise.all([
    listCommandesTracables(),
    id ? getFrise(id) : Promise.resolve(null),
  ]);

  return (
    <>
      <div className="no-print">
        <PageHeader
          icon={SearchCheck}
          title="Traçabilité"
          description="Le parcours complet d'une commande, de l'enregistrement à la facture"
          actions={frise && <BoutonImprimer label="Imprimer la frise" />}
        />
      </div>
      <style>{`@media print { .no-print { display: none !important } @page { margin: 12mm } }`}</style>

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <div className="no-print">
          <Selecteur commandes={commandes} actif={id} />
        </div>

        {!frise ? (
          <div className="flex min-h-64 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
            Choisissez une commande pour afficher sa frise.
          </div>
        ) : (
          <div className="space-y-4">
            {/* identité */}
            <div className="rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-extrabold tracking-tight text-brand">{frise.commande.of}</div>
                  <div className="text-sm font-semibold">{frise.commande.modele}</div>
                  <div className="text-xs text-muted-foreground">
                    {frise.commande.client}
                    {frise.commande.refArticle && ` · réf. ${frise.commande.refArticle}`}
                    {frise.commande.couleur && ` · ${frise.commande.couleur}`}
                    {frise.commande.saison && ` · ${frise.commande.saison}`}
                  </div>
                </div>
                <div className="text-right text-xs">
                  <div>
                    Production : <b>{frise.commande.faconnier || frise.commande.chaine || "non assignée"}</b>
                  </div>
                  {frise.cycle && (
                    <div className="text-muted-foreground">
                      Cycle : {dateFr(frise.cycle.debut)} → {dateFr(frise.cycle.fin)} ·{" "}
                      <b className="text-foreground">{frise.cycle.jours} j</b>
                    </div>
                  )}
                  {frise.commande.archived && <StatusBadge tone="neutral">Archivée</StatusBadge>}
                </div>
              </div>

              <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-2">
                {[
                  ["Commandé", frise.commande.qte],
                  ["Coupé", frise.commande.coupeQte],
                  ["Produit", frise.commande.produit],
                  ["Magasin", frise.commande.magasinQte],
                  ["Facturé", frise.commande.factureQte],
                ].map(([l, v]) => (
                  <div key={l} className="rounded-lg bg-muted px-3 py-2 text-center">
                    <div className="text-[10px] font-semibold uppercase text-muted-foreground">{l}</div>
                    <div className="text-base font-bold tabular-nums">{nb.format(Number(v))}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* jalons */}
            <div className="overflow-x-auto rounded-xl border bg-card p-4">
              <div className="flex min-w-max items-start gap-1">
                {frise.jalons.map((j, i) => (
                  <div key={j.cle} className="flex items-start">
                    <div className="w-[92px] text-center">
                      <div
                        className={`mx-auto flex size-9 items-center justify-center rounded-full border-2 text-sm ${
                          j.etat === "fait"
                            ? "border-[var(--success-d)] bg-[var(--success-l)]"
                            : j.etat === "encours"
                              ? "border-brand bg-accent"
                              : "border-dashed border-border bg-muted opacity-50"
                        }`}
                      >
                        {j.icone}
                      </div>
                      <div
                        className={`mt-1 text-[10.5px] font-semibold ${j.etat === "avenir" ? "text-muted-foreground" : ""}`}
                      >
                        {j.label}
                      </div>
                      <div className="text-[9.5px] text-muted-foreground">
                        {j.date ? dateFr(j.date) : j.etat === "avenir" ? "—" : `${j.nb} fait(s)`}
                      </div>
                    </div>
                    {i < frise.jalons.length - 1 && (
                      <div
                        className={`mt-4 h-0.5 w-3 ${j.etat === "fait" ? "bg-[var(--success-d)]" : "bg-border"}`}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* journal */}
            <div className="rounded-xl border bg-card">
              <div className="border-b px-4 py-2.5 text-xs font-bold uppercase tracking-wide">
                Journal — {frise.evenements.length} événement(s)
              </div>
              <div className="divide-y">
                {frise.evenements.map((e, i) => (
                  <div key={i} className="flex gap-3 px-4 py-2.5">
                    <div className="w-20 shrink-0 pt-0.5 text-[11px] tabular-nums text-muted-foreground">
                      {e.date ? dateFr(e.date) : "sans date"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge tone={e.tone}>{e.titre}</StatusBadge>
                        <span className="text-[10px] uppercase text-muted-foreground">{e.etape}</span>
                      </div>
                      {e.detail && <div className="mt-0.5 text-[11.5px] text-muted-foreground">{e.detail}</div>}
                    </div>
                    {e.acteur && (
                      <div className="shrink-0 self-center text-[10.5px] text-muted-foreground">{e.acteur}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
