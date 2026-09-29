import { redirect } from "next/navigation";
import { normaliserEmplacement } from "@/lib/domain/rouleau";

/* Adresse courte du QR d'un emplacement de rayon : https://<app>/e/A03-12. */
export default async function EmplacementCourt({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  redirect(`/m/tissu/e/${encodeURIComponent(normaliserEmplacement(decodeURIComponent(code)))}`);
}
