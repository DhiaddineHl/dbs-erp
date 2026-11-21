import { getUser, utilisateurAvecModule } from "@/lib/auth/server";
import { resultatAEnvoyer } from "@/lib/services/pv-client";
import { excelPvClient } from "@/lib/coupe/pv-client-excel";

/* Télécharge le « Résultat de coupe » au format des clients (Excel), pour
 * une fiche de coupe validée : …/coupe/fiche/CP-2026-003/pv-client[?v=2].
 * C'est la version générée AUTOMATIQUEMENT à la validation de la fiche. */
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ numero: string }> }) {
  if (!(await getUser())) return new Response("Non authentifié", { status: 401 });
  if (!(await utilisateurAvecModule("coupe"))) return new Response("Accès refusé", { status: 403 });
  const numero = decodeURIComponent((await params).numero);
  const v = Number(new URL(req.url).searchParams.get("v")) || undefined;
  // La version FIGÉE générée à la validation (ou celle demandée).
  const r = await resultatAEnvoyer(numero, v);
  if (!r) return new Response("Fiche de coupe introuvable ou annulée", { status: 404 });
  const d = r.donnees;
  const fichier = await excelPvClient(d);
  const nom = `Resultat_de_coupe_${[d.modele, d.reference].filter(Boolean).join("_").replace(/[^\w-]+/g, "_")}_${numero}.xlsx`;
  return new Response(new Uint8Array(fichier), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nom}"`,
      "Cache-Control": "no-store",
    },
  });
}
