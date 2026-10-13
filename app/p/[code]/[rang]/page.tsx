import { redirect } from "next/navigation";
import { lireScanPaquet } from "@/lib/domain/paquet";

/* QR d'une LIASSE : …/p/PQ-2026-000145/3 → la fiche du paquet, déjà
 * positionnée sur la 3ᵉ liasse. Un seul geste pour la responsable. */
export default async function LiasseCourte({ params }: { params: Promise<{ code: string; rang: string }> }) {
  const { code, rang } = await params;
  const lu = lireScanPaquet(code);
  if (!lu) redirect("/m/paquets");
  const n = Number(rang);
  redirect(`/m/paquets?code=${lu.code}${Number.isInteger(n) && n > 0 ? `&liasse=${n}` : ""}`);
}
