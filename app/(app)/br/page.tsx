import { redirect } from "next/navigation";

/* « Réception ST » est désormais un onglet du Magasin produits finis :
 * l'ancienne adresse y mène directement (favoris, liens déjà partagés). */
export default function BrPage() {
  redirect("/magasin?onglet=receptions");
}
