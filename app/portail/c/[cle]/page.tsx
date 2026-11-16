import { notFound } from "next/navigation";
import { accesParCle, noterVisite, telephoneReconnu } from "@/lib/services/portail-acces";
import { vueClient } from "@/lib/services/portail-client";
import { EcranPin, PortailClient } from "./portail-client";

/* PORTAIL CLIENT — …/portail/c/<clé>
 *
 * Hors du groupe (app) : ni menu, ni compte. L'accès tient à la clé de
 * l'URL (et au PIN quand l'accès en a un). Tout ce qui s'affiche vient de
 * lib/services/portail-client.ts, construit champ par champ : cette page ne
 * lit jamais la base elle-même. */

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return { title: "Suivi de vos commandes — DBS Fashion", robots: { index: false, follow: false } };
}

export default async function PortailClientPage({ params }: { params: Promise<{ cle: string }> }) {
  const { cle } = await params;
  const a = await accesParCle(cle, "client");
  if (!a) notFound();
  if (!(await telephoneReconnu(a))) return <EcranPin cle={cle} nom={a.nom} />;
  await noterVisite(a);
  const vue = await vueClient(a);
  if (!vue) notFound();
  return <PortailClient cle={cle} vue={vue} />;
}
