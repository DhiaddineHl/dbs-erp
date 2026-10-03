import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { recapSortie } from "@/lib/services/rouleaux";
import { DocumentSortie } from "../../sortie/document-sortie";

/* Bon RÉCAPITULATIF (BSR-AAAA-NNN) : un seul document, pour signature, des
 * rouleaux partis chez un même destinataire — même s'ils ont été sortis un à
 * un, chacun sur son propre bon BST (rappelé sur chaque ligne). */
export default async function BonRecapPage({ params }: { params: Promise<{ numero: string }> }) {
  await requireUser();
  const b = await recapSortie(decodeURIComponent((await params).numero));
  if (!b) notFound();
  return <DocumentSortie b={b} recap={{ bonsOrigine: b.bonsOrigine, emisLe: b.emisLe, emisPar: b.emisPar }} />;
}
