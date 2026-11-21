import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { commandeDocument } from "@/lib/db/schema";
import { getUser, utilisateurAvecModule } from "@/lib/auth/server";
import { nomTelechargement } from "@/lib/domain/documents-modele";
import { lireFichier } from "@/lib/services/fichiers";

/* Ouvre une fiche du modèle dans le navigateur (consulter, imprimer), avec
 * son vrai nom de fichier. ?telecharger=1 force le téléchargement. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getUser())) return new Response("Non authentifié", { status: 401 });
  // Fiches du modèle : ouvertes depuis la Direction technique (et ses écrans frères de préparation).
  if (!(await utilisateurAvecModule("dt", "modelisme", "nomen", "magfour", "magtissu", "coupe")))
    return new Response("Accès refusé", { status: 403 });
  const [d] = await db.select().from(commandeDocument).where(eq(commandeDocument.id, Number((await params).id)));
  if (!d) return new Response("Introuvable", { status: 404 });
  const f = await lireFichier(d.fichierHash);
  if (!f?.corps) return new Response("Introuvable", { status: 404 });
  const mode = new URL(req.url).searchParams.get("telecharger") ? "attachment" : "inline";
  return new Response(f.corps, {
    headers: {
      "Content-Type": d.mime || f.mime,
      "Content-Disposition": `${mode}; filename="${nomTelechargement(d.nom)}"; filename*=UTF-8''${encodeURIComponent(d.nom)}`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
