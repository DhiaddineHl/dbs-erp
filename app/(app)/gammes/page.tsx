import { redirect } from "next/navigation";

/* « Gammes & SAM » (table de démonstration à chiffres écrits en dur) est supprimé :
 * les temps standards vivent dans Opérations & SAM et les modèles GPAO.
 * L'ancienne adresse y mène directement (favoris, liens déjà partagés). */
export default function GammesPage() {
  redirect("/operations");
}
