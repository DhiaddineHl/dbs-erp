import { accesTissuPage } from "@/lib/auth/tissu";
import { commandesPourSortie, listBonsSortie, sousTraitants } from "@/lib/services/rouleaux";
import { Cadre, Entete } from "../ui";
import { SortieGroupee } from "./sortie-groupee";

/* Sortie GROUPÉE de rouleaux (ex. vers un sous-traitant) : on choisit une
 * fois le modèle et le lieu, on scanne les rouleaux, un bon BST s'imprime. */

export const dynamic = "force-dynamic";
export const metadata = { title: "Sortie groupée tissu", robots: { index: false, follow: false } };

export default async function SortieGroupeePage({ searchParams }: { searchParams: Promise<{ codes?: string }> }) {
  const sp = await searchParams;
  const { user, peutSaisir } = await accesTissuPage(`/m/tissu/sortie${sp.codes ? `?codes=${sp.codes}` : ""}`);
  const [commandes, soustraitants, bons] = await Promise.all([commandesPourSortie(null), sousTraitants(), listBonsSortie(5)]);
  return (
    <Cadre retour={{ href: "/m/tissu", label: "Scanner" }}>
      <Entete utilisateur={user.name} titre="Sortie groupée" />
      <h1 className="mb-3 text-3xl font-black">Sortie groupée</h1>
      {!peutSaisir ? (
        <div className="rounded-xl bg-white px-4 py-6 text-center text-sm text-slate-600">Consultation seule : ce compte ne peut pas sortir de tissu.</div>
      ) : (
        <SortieGroupee
          commandes={commandes}
          sousTraitants={soustraitants}
          codesInitiaux={(sp.codes ?? "").split(",").filter(Boolean)}
          bons={bons}
        />
      )}
    </Cadre>
  );
}
