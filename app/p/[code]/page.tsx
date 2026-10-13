import { redirect } from "next/navigation";
import { lireScanPaquet } from "@/lib/domain/paquet";

/* Adresse courte imprimée dans le QR d'un paquet : https://<app>/p/PQ-2026-000145.
 * Courte = QR moins dense, lisible même petit et froissé par l'atelier. */
export default async function PaquetCourt({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const lu = lireScanPaquet(code);
  redirect(lu ? `/m/paquets?code=${lu.code}` : "/m/paquets");
}
