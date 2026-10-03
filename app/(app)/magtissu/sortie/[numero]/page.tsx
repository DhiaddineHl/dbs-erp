import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { bonSortie } from "@/lib/services/rouleaux";
import { DocumentSortie } from "../document-sortie";

/* Bon de sortie groupée de tissu (BST-AAAA-NNN). Vers un sous-traitant, c'est
 * le bon de livraison qui accompagne les rouleaux et qu'il signe à réception. */
export default async function BonSortiePage({ params }: { params: Promise<{ numero: string }> }) {
  await requireUser();
  const b = await bonSortie(decodeURIComponent((await params).numero));
  if (!b) notFound();
  return <DocumentSortie b={b} />;
}
