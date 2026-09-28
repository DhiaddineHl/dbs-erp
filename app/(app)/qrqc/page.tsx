import { redirect } from "next/navigation";

/* « QRQC / 5M » est désormais l'onglet « Actions & QRQC » du contrôle qualité
 * (registre unique des actions, relié aux commandes et aux contrôles).
 * L'ancienne adresse y mène directement (favoris, liens déjà partagés). */
export default function QrqcPage() {
  redirect("/qc?onglet=actions&origine=qrqc");
}
