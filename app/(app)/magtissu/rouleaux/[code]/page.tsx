import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, userRole } from "@/lib/auth/server";
import { peutModifier } from "@/lib/domain/feux";
import { lireScan, statutLabel } from "@/lib/domain/rouleau";
import { getRoleModules } from "@/lib/services/permissions";
import { qrSvg } from "@/lib/atelier/qr";
import { basePortail } from "@/lib/services/portail";
import { commandesPourSortie, getRouleau, listEmplacements, sousTraitants } from "@/lib/services/rouleaux";
import { SectionPanel } from "@/components/shared/section-panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { ActionsRouleau } from "@/app/m/tissu/r/[code]/actions-rouleau";
import { MesureFiche } from "@/app/m/tissu/mesure/mesure-fiche";
import { lireRouleauAMesurer } from "@/lib/actions/rouleaux";
import { TimelineRouleau } from "./timeline";

const q2 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const dateFr = (iso: string) => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10).split("-").reverse().join("/") : iso || "—");

/* Fiche d'un rouleau au bureau : identité (figée), bilan calculé depuis les
 * mouvements, historique complet (avec annulation motivée) et les mêmes
 * gestes qu'au téléphone. */
export default async function FicheRouleauPage({ params }: { params: Promise<{ code: string }> }) {
  const user = await requireUser();
  const role = userRole(user);
  const brut = decodeURIComponent((await params).code);
  const fiche = await getRouleau(lireScan(brut)?.code ?? brut);
  if (!fiche) notFound();
  const { rouleau: r, mouvements } = fiche;
  const [modules, commandes, emplacements, base, soustraitants] = await Promise.all([
    getRoleModules(role),
    commandesPourSortie(r.lot.id),
    listEmplacements(),
    basePortail(),
    sousTraitants(),
  ]);
  const peutSaisir = peutModifier("tissu", role) || modules.magtissu === true;
  const svg = await qrSvg(`${base.replace(/\/+$/, "")}/r/${r.code}`, 140);
  const st = statutLabel(r.statut);
  const b = r.bilan;
  const u = r.lot.unite;
  // Étiquette « à mesurer » : on peut aussi taper son métrage d'ici.
  const aMesurer = r.statut === "a_mesurer" && peutSaisir ? await lireRouleauAMesurer(r.code) : null;

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/magtissu?onglet=rouleaux" className="text-xs font-semibold text-muted-foreground hover:underline">
          ← Rouleaux
        </Link>
        <h1 className="font-mono text-xl font-black">{r.code}</h1>
        <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
        <StatusBadge tone="neutral">📍 {r.emplacement || "non rangé"}</StatusBadge>
        {r.chez && (
          <StatusBadge tone="warning">
            🚚 {q2.format(b.enCoupe)} {u} {r.chez}
          </StatusBadge>
        )}
        <Link href={`/magtissu/etiquettes/rouleaux?ids=${r.id}`} target="_blank" className="ml-auto rounded-md border px-2.5 py-1.5 text-[11px] font-semibold hover:bg-muted">
          🏷 Imprimer l&apos;étiquette
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <SectionPanel title="Identité du rouleau (non modifiable)">
            <div className="flex gap-4">
              <div className="size-[120px] shrink-0 [&_svg]:size-full" dangerouslySetInnerHTML={{ __html: svg }} />
              <dl className="grid flex-1 grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-3">
                <Ligne l="Tissu" v={[r.lot.reference, r.lot.composition].filter(Boolean).join(" · ")} />
                <Ligne l="Couleur" v={[r.lot.couleur, r.lot.codeCouleur].filter(Boolean).join(" · ")} />
                <Ligne l="Lot DBS" v={r.lot.identifiant} />
                <Ligne l="Lot fournisseur" v={r.lot.lotFournisseur} />
                <Ligne l="Laize" v={r.laize != null ? `${r.laize} cm` : ""} />
                <Ligne l="Poids" v={r.poids != null ? `${r.poids} kg` : ""} />
                <Ligne
                  l="Métrage initial"
                  v={r.statut === "annule" ? "étiquette annulée" : r.aMesurer ? "à mesurer — saisi au scan du magasin" : `${q2.format(r.metrageInitial)} ${u}`}
                />
                <Ligne l="Annoncé (étiquette fourn.)" v={r.metrageAnnonce != null ? `${q2.format(r.metrageAnnonce)} ${u}` : ""} />
                <Ligne l="Réception" v={`${r.reception.numero} du ${dateFr(r.reception.date)}`} />
                <Ligne l="Fournisseur / client" v={[r.reception.fournisseur, r.reception.client].filter(Boolean).join(" / ")} />
                <Ligne l="BL · commande fourn." v={[r.reception.blClient, r.reception.commandeFournisseur].filter(Boolean).join(" · ")} />
                <Ligne l="Validé au magasin" v={r.valide ? `${dateFr(r.valideLe)} · ${r.validePar}` : "en attente"} />
                <Ligne l="Réservé pour" v={r.commandes.map((c) => c.label).join(", ")} />
                <Ligne l="Observations" v={r.observations} />
              </dl>
            </div>
          </SectionPanel>

          <div className="grid grid-cols-3 gap-2 text-center text-xs sm:grid-cols-7">
            {(
              [
                ["Initial", r.metrageInitial],
                ["Sorti", b.sorti],
                ["Revenu", b.retour],
                ["Consommé", b.consomme],
                ["Chute", b.chute],
                ["En coupe", b.enCoupe],
                ["En stock", b.disponible],
              ] as const
            ).map(([l, v]) => (
              <div key={l} className={`rounded border px-2 py-1.5 ${l === "En stock" ? "bg-foreground text-background" : "bg-card"}`}>
                <div className="text-[10px] uppercase opacity-70">{l}</div>
                <div className="text-base font-bold tabular-nums">
                  {q2.format(v)} {u}
                </div>
              </div>
            ))}
          </div>
          {(b.rendu > 0 || b.retourFournisseur > 0 || b.corrections !== 0) && (
            <div className="text-xs text-muted-foreground">
              {b.rendu > 0 && `Rendu client ${q2.format(b.rendu)} ${u} · `}
              {b.retourFournisseur > 0 && `Retour fournisseur ${q2.format(b.retourFournisseur)} ${u} · `}
              {b.corrections !== 0 && `Corrections ${b.corrections > 0 ? "+" : ""}${q2.format(b.corrections)} ${u}`}
            </div>
          )}

          <SectionPanel title={`Historique (${mouvements.length})`} flush>
            <TimelineRouleau mouvements={mouvements} unite={u} peutSaisir={peutSaisir} />
          </SectionPanel>
        </div>

        <div>
          <div className="mb-2 text-[11px] font-bold uppercase text-muted-foreground">Mouvements</div>
          {aMesurer?.ok ? (
            <MesureFiche rouleau={aMesurer.rouleau} emplacements={emplacements.filter((e) => e.actif).map((e) => e.code)} />
          ) : r.aMesurer ? (
            <div className="rounded-lg border bg-card px-3 py-4 text-center text-xs text-muted-foreground">
              {r.statut === "annule" ? "Étiquette annulée." : "Rouleau à mesurer : son métrage se saisit au scan."}
            </div>
          ) : (
            <ActionsRouleau
              rouleau={r}
              commandes={commandes}
              sousTraitants={soustraitants}
              emplacements={emplacements.filter((e) => e.actif).map((e) => ({ code: e.code, libelle: e.libelle, zone: e.zone }))}
              peutSaisir={peutSaisir}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function Ligne({ l, v }: { l: string; v: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase text-muted-foreground">{l}</dt>
      <dd className="font-medium">{v || "—"}</dd>
    </div>
  );
}
