import Link from "next/link";
import { notFound } from "next/navigation";
import { Scissors } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { SectionPanel } from "@/components/shared/section-panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { requireUser, userRole } from "@/lib/auth/server";
import * as av from "@/lib/domain/aval";
import { motifEcartLabel } from "@/lib/domain/coupe";
import { lireFiche } from "@/lib/services/coupe";
import { ActionsFiche } from "./actions-fiche";

const nb = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const signe = (n: number) => (n > 0 ? `+${nb.format(n)}` : nb.format(n));
const dateFr = (iso: string) => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10).split("-").reverse().join("/") : iso || "—");
const dateHeure = (iso: string) => (iso ? new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—");

/* Fiche de coupe validée : figée. On la consulte, on génère (ou régénère)
 * son PV client, ou on l'annule avec un motif — jamais on ne la réécrit. */
export default async function FicheCoupePage({ params }: { params: Promise<{ numero: string }> }) {
  const user = await requireUser();
  const role = userRole(user);
  const f = await lireFiche(decodeURIComponent((await params).numero));
  if (!f) notFound();
  const peutSaisir = role === "admin" || av.ROLES_SAISIE_MAGASIN.includes(role);
  const plusieurs = f.ofs.length > 1;
  return (
    <>
      <PageHeader icon={Scissors} title={`Fiche de coupe ${f.numero}`} description={`${f.commande.client} · ${f.ofs.map((o) => o.of).join(" + ")} · ${f.commande.modele}`} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Link href="/coupe" className="inline-flex h-8 items-center rounded-md border px-2.5 text-[11px] font-semibold hover:bg-muted">
          ← Service coupe
        </Link>
        {f.statut === "annulee" ? (
          <StatusBadge tone="danger">Annulée le {dateHeure(f.annuleLe)} par {f.annulePar} — {f.motifAnnulation}</StatusBadge>
        ) : (
          <StatusBadge tone="success">Validée</StatusBadge>
        )}
        <span className="text-xs text-muted-foreground">
          Coupe {f.type === "soustraite" ? "sous-traitée" : "interne"} du {dateFr(f.date)} · saisie par {f.createdBy} le {dateHeure(f.createdAt)}
        </span>
      </div>

      <ActionsFiche id={f.id} numero={f.numero} annulee={f.statut === "annulee"} peutSaisir={peutSaisir} pvs={f.pvs} />

      <SectionPanel title="Quantités par taille — commandé / plan / coupé / écart" flush>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/40 text-[10.5px] uppercase text-muted-foreground">
                <th className="px-3 py-2 text-left">Taille</th>
                <th className="px-3 py-2 text-right">Commandé</th>
                <th className="px-3 py-2 text-right">Plan de coupe</th>
                <th className="px-3 py-2 text-right">Coupé</th>
                <th className="px-3 py-2 text-right">Écart</th>
                {plusieurs && <th className="px-3 py-2 text-left">Coupé par OF</th>}
              </tr>
            </thead>
            <tbody>
              {f.lignes.map((l) => (
                <tr key={l.taille} className="border-b">
                  <td className="px-3 py-1.5 font-bold">{l.taille}</td>
                  <td className="px-3 text-right tabular-nums">{nb.format(l.commande)}</td>
                  <td className="px-3 text-right tabular-nums">{nb.format(l.prevu)}</td>
                  <td className="px-3 text-right font-bold tabular-nums">{nb.format(l.coupe)}</td>
                  <td className={`px-3 text-right font-bold tabular-nums ${l.motifRequis ? "text-[var(--danger-d)]" : l.ecart ? "text-warning-foreground" : "text-success-foreground"}`}>
                    {signe(l.ecart)}
                    {l.pct != null && l.ecart !== 0 && <span className="ml-1 font-normal">({signe(l.pct)} %)</span>}
                  </td>
                  {plusieurs && (
                    <td className="px-3 text-[11px] text-muted-foreground">
                      {l.parOf.map((o) => `${o.of} : ${nb.format(o.coupe)}`).join(" · ")}
                    </td>
                  )}
                </tr>
              ))}
              <tr className="bg-muted/30 font-bold">
                <td className="px-3 py-2">TOTAL</td>
                <td className="px-3 text-right tabular-nums">{nb.format(f.totaux.commande)}</td>
                <td className="px-3 text-right tabular-nums">{nb.format(f.totaux.prevu)}</td>
                <td className="px-3 text-right tabular-nums">{nb.format(f.totaux.coupe)}</td>
                <td className="px-3 text-right tabular-nums">{signe(f.totaux.ecart)}</td>
                {plusieurs && <td />}
              </tr>
            </tbody>
          </table>
        </div>
        {(f.motifEcart || f.note) && (
          <div className="border-t px-3 py-2 text-xs">
            {f.motifEcart && (
              <span>
                <b>Motif de l&apos;écart :</b> {motifEcartLabel(f.motifEcart)}
                {f.precisionEcart ? ` — ${f.precisionEcart}` : ""}.{" "}
              </span>
            )}
            {f.note && <span className="text-muted-foreground">Note : {f.note}</span>}
          </div>
        )}
      </SectionPanel>

      <SectionPanel title={`Consommation tissu${f.matiere ? ` — ${f.matiere}` : ""}`} flush>
        {f.consommation.length === 0 ? (
          <p className="px-3 py-4 text-xs text-muted-foreground">Aucune consommation rattachée à cette fiche.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/40 text-[10.5px] uppercase text-muted-foreground">
                <th className="px-3 py-2 text-left">Tissu</th>
                <th className="px-3 py-2 text-left">Couleur</th>
                <th className="px-3 py-2 text-left">Lot</th>
                <th className="px-3 py-2 text-left">Rouleau</th>
                <th className="px-3 py-2 text-right">Consommé</th>
                <th className="px-3 py-2 text-right">Chute</th>
                <th className="px-3 py-2 text-right">Métrage</th>
              </tr>
            </thead>
            <tbody>
              {f.consommation.map((c) => (
                <tr key={`${c.lot}-${c.rouleau}`} className="border-b">
                  <td className="px-3 py-1.5">{c.tissu || "—"}</td>
                  <td className="px-3">{c.couleur || "—"}</td>
                  <td className="px-3">{c.lot}</td>
                  <td className="px-3 font-mono">
                    {c.rouleau.startsWith("R-") ? (
                      <Link href={`/magtissu/rouleaux/${c.rouleau}`} className="text-brand hover:underline">
                        {c.rouleau}
                      </Link>
                    ) : (
                      c.rouleau
                    )}
                  </td>
                  <td className="px-3 text-right tabular-nums">{nb.format(c.consomme)}</td>
                  <td className="px-3 text-right tabular-nums">{nb.format(c.chute)}</td>
                  <td className="px-3 text-right font-bold tabular-nums">
                    {nb.format(c.total)} {c.unite}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="grid grid-cols-2 gap-2 border-t px-3 py-3 text-center text-xs sm:grid-cols-4">
          <Bloc l={`Théorique${f.bilan.consoPiece ? ` (${nb.format(f.bilan.consoPiece)} m/pc)` : ""}`} v={f.bilan.theorique != null ? `${nb.format(f.bilan.theorique)} m` : "—"} />
          <Bloc l="Réel" v={`${nb.format(f.bilan.reel)} m`} />
          <Bloc l="Écart" v={f.bilan.ecart != null ? `${signe(f.bilan.ecart)} m` : "—"} />
          <Bloc l="Écart %" v={f.bilan.pct != null ? `${signe(f.bilan.pct)} %` : "—"} />
        </div>
      </SectionPanel>
    </>
  );
}

function Bloc({ l, v }: { l: string; v: string }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <div className="text-[10px] font-bold uppercase text-muted-foreground">{l}</div>
      <div className="text-base font-bold tabular-nums">{v}</div>
    </div>
  );
}
