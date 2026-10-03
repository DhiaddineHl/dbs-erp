import { accesTissuPage } from "@/lib/auth/tissu";
import { chargerRouleaux, listEmplacements } from "@/lib/services/rouleaux";
import { Cadre, Entete } from "../ui";
import { MesureRafale } from "./mesure-rafale";

/* Mesure des rouleaux au magasin : étiquettes collées à la réception (case
 * « Métrage : ____ m »), le magasinier scanne chaque rouleau et tape son
 * métrage. La caméra reste ouverte d'un rouleau à l'autre. */

export const dynamic = "force-dynamic";
export const metadata = { title: "Mesurer les rouleaux", robots: { index: false, follow: false } };

export default async function MesurePage() {
  const { user, peutSaisir } = await accesTissuPage("/m/tissu/mesure");
  const [rouleaux, emplacements] = await Promise.all([chargerRouleaux(), listEmplacements()]);
  const parLot = new Map<string, number>();
  for (const r of rouleaux) if (r.statut === "a_mesurer") parLot.set(r.lot.identifiant, (parLot.get(r.lot.identifiant) ?? 0) + 1);
  return (
    <Cadre retour={{ href: "/m/tissu", label: "Scanner" }}>
      <Entete utilisateur={user.name} titre="Mesure" />
      <h1 className="mb-3 text-3xl font-black">📏 Mesurer les rouleaux</h1>
      {!peutSaisir ? (
        <div className="rounded-xl bg-white px-4 py-6 text-center text-sm text-slate-600">Consultation seule : ce compte ne peut pas saisir de métrage.</div>
      ) : (
        <MesureRafale
          emplacements={emplacements.filter((e) => e.actif).map((e) => e.code)}
          aMesurer={[...parLot.entries()].map(([lot, n]) => ({ lot, n }))}
        />
      )}
    </Cadre>
  );
}
