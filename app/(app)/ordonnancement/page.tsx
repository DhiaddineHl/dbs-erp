import { redirect } from "next/navigation";

/* « Ordonnancement » (tableau de démonstration) est supprimé : l'ordre de
 * lancement se pilote dans le Planning général.
 * L'ancienne adresse y mène directement (favoris, liens déjà partagés). */
export default function OrdonnancementPage() {
  redirect("/planning");
}
