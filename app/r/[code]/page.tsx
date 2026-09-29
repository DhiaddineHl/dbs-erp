import { redirect } from "next/navigation";
import { lireScan } from "@/lib/domain/rouleau";

/* Adresse courte imprimée dans le QR d'un rouleau : https://<app>/r/R-2026-000145.
 * Courte = QR moins dense, lisible même petit et un peu froissé. Elle mène à
 * la fiche mobile du rouleau (connexion demandée si besoin, puis retour ici). */
export default async function RouleauCourt({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const lu = lireScan(code);
  redirect(lu?.type === "rouleau" ? `/m/tissu/r/${lu.code}` : "/m/tissu");
}
