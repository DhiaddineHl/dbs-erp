import { notFound } from "next/navigation";
import { PackageCheck } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { requireUser, userRole } from "@/lib/auth/server";
import { ROLES_SAISIE_MAGASIN } from "@/lib/domain/aval";
import { livraisonBureau } from "@/lib/services/suivi-soustraitants";
import { ReceptionLivraison } from "./reception";

/* Réception d'une livraison annoncée — ouverte depuis la notification ou en
 * scannant le QR du bon de l'atelier. On compte, on corrige si besoin, on
 * valide : le bon de réception (BR) se crée par le circuit habituel. */

export const dynamic = "force-dynamic";

export default async function ReceptionLivraisonPage({ params }: { params: Promise<{ numero: string }> }) {
  const user = await requireUser();
  const role = userRole(user);
  const { numero } = await params;
  const d = await livraisonBureau(decodeURIComponent(numero));
  if (!d) notFound();
  return (
    <>
      <PageHeader icon={PackageCheck} title={`Livraison ${d.livraison.numero}`} description={`${d.livraison.atelier} · ${d.livraison.of} · ${d.livraison.modele} ${d.livraison.couleur}`} />
      <ReceptionLivraison d={d} peutValider={role === "admin" || ROLES_SAISIE_MAGASIN.includes(role)} />
    </>
  );
}
