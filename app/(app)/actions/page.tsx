import { redirect } from "next/navigation";

/* « Plans d'actions » est désormais l'onglet « Actions & QRQC » du contrôle
 * qualité (registre unique des actions).
 * L'ancienne adresse y mène directement (favoris, liens déjà partagés). */
export default function ActionsPage() {
  redirect("/qc?onglet=actions");
}
