import { redirect } from "next/navigation";

/* « Ordres de fabrication » (tableau de démonstration) est supprimé : le suivi
 * de production par OF et par chaîne est dans la GPAO.
 * L'ancienne adresse y mène directement (favoris, liens déjà partagés). */
export default function OfsPage() {
  redirect("/gpao_prod");
}
