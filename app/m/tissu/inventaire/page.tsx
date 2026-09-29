import { accesTissuPage } from "@/lib/auth/tissu";
import { listInventaires } from "@/lib/services/rouleaux";
import { Cadre, Entete } from "../ui";
import { InventaireMobile, OuvrirInventaire } from "./inventaire-mobile";

/* Inventaire par scan, au téléphone : on scanne l'étiquette du rayon, puis
 * chaque rouleau qui s'y trouve. Le bureau voit en direct les manquants, les
 * inconnus et les écarts, et décide des corrections à la clôture. */

export const dynamic = "force-dynamic";
export const metadata = { title: "Inventaire tissu", robots: { index: false, follow: false } };

export default async function InventaireMobilePage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { user, peutSaisir } = await accesTissuPage("/m/tissu/inventaire");
  const sp = await searchParams;
  const ouverts = (await listInventaires()).filter((i) => i.statut === "ouvert");
  const inv = ouverts.find((i) => String(i.id) === sp.id) ?? ouverts[0];
  return (
    <Cadre retour={{ href: "/m/tissu", label: "Scanner" }}>
      <Entete utilisateur={user.name} titre="Inventaire tissu" />
      {!peutSaisir ? (
        <div className="mt-4 rounded-xl bg-white px-4 py-6 text-center text-sm text-slate-600">Consultation seule : ce compte ne peut pas faire l&apos;inventaire.</div>
      ) : !inv ? (
        <OuvrirInventaire />
      ) : (
        <InventaireMobile
          inventaire={{
            id: inv.id,
            numero: inv.numero,
            zone: inv.zone,
            attendus: inv.resultat.attendus,
            trouves: inv.resultat.trouves,
            manquants: inv.resultat.manquants.length,
            inconnus: inv.resultat.nonEnregistres.length,
            ecarts: inv.resultat.ecarts.length,
            scans: inv.scans.slice(0, 30).map((s) => ({ id: s.id, code: s.code, connu: s.rouleauId != null, metrage: s.metrageConstate, emplacement: s.emplacementCode })),
          }}
          autres={ouverts.filter((o) => o.id !== inv.id).map((o) => ({ id: o.id, numero: o.numero, zone: o.zone }))}
        />
      )}
    </Cadre>
  );
}
