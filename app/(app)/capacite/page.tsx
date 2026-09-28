import { redirect } from "next/navigation";

/* « Capacité & Costing » (chiffres écrits en dur) est supprimé : le coût usine,
 * le prix plancher et la marge par modèle sont dans GPAO › Rentabilité.
 * L'ancienne adresse y mène directement (favoris, liens déjà partagés). */
export default function CapacitePage() {
  redirect("/gpao_prod");
}
