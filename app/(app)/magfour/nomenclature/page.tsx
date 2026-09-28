import { ClipboardList } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { listCatalogueFournitures } from "@/lib/services/preparation";
import { listNomenclatures } from "@/lib/services/fournitures";
import { droitFournitures } from "../droits";
import { NavMagfour } from "../nav-magfour";
import { NomenclatureClient } from "./nomenclature-client";

export default async function NomenclatureFournituresPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const [peutSaisir, modeles, catalogue, sp] = await Promise.all([droitFournitures(), listNomenclatures(), listCatalogueFournitures(), searchParams]);
  return (
    <>
      <PageHeader icon={ClipboardList} title="Nomenclature fournitures par modèle" description="Ce qu'il faut par pièce : le « prévu » de chaque commande se calcule tout seul" />
      <NavMagfour actif="/magfour/nomenclature" />
      <NomenclatureClient modeles={modeles} catalogue={catalogue} peutSaisir={peutSaisir} rechercheInitiale={sp.q ?? ""} />
    </>
  );
}
