import { notFound } from "next/navigation";
import { accesParCle, noterVisite, telephoneReconnu } from "@/lib/services/portail-acces";
import { vueSt } from "@/lib/services/portail-soustraitant";
import { MOTIFS_LIVRAISON } from "@/lib/domain/soustraitant";
import { EcranPinSt, PortailSt } from "./portail-st";

/* PORTAIL SOUS-TRAITANT — …/portail/s/<clé>
 *
 * Hors du groupe (app) : ni menu, ni compte. Clé de l'URL + PIN obligatoire.
 * Tout ce qui s'affiche vient de lib/services/portail-soustraitant.ts (liste
 * fermée) : cette page ne lit jamais la base elle-même. */

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return { title: "Espace atelier — DBS Fashion", robots: { index: false, follow: false } };
}

export default async function PortailStPage({ params }: { params: Promise<{ cle: string }> }) {
  const { cle } = await params;
  const a = await accesParCle(cle, "soustraitant");
  if (!a) notFound();
  if (!(await telephoneReconnu(a))) return <EcranPinSt cle={cle} nom={a.nom} />;
  await noterVisite(a);
  const vue = await vueSt(a);
  if (!vue) notFound();
  return <PortailSt cle={cle} vue={vue} motifs={MOTIFS_LIVRAISON.map((m) => ({ value: m.value, label: m.label }))} />;
}
