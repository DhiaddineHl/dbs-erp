import { accesParCle, telephoneReconnu } from "@/lib/services/portail-acces";
import { documentPourAtelier } from "@/lib/services/documents-modele";
import { nomTelechargement } from "@/lib/domain/documents-modele";
import { lireFichier } from "@/lib/services/fichiers";

/* L'atelier ouvre une fiche du modèle (consulter, imprimer) depuis son
 * portail : clé du lien + PIN reconnu, et la fiche doit concerner une
 * commande qui lui est confiée et être marquée « visible par l'atelier ». */
export async function GET(req: Request, { params }: { params: Promise<{ cle: string; id: string }> }) {
  const { cle, id } = await params;
  const a = await accesParCle(cle, "soustraitant");
  if (!a || !(await telephoneReconnu(a)) || a.faconnierId == null) return new Response("Accès refusé", { status: 403 });
  const d = await documentPourAtelier(a.faconnierId, Number(id));
  if (!d) return new Response("Introuvable", { status: 404 });
  const f = await lireFichier(d.hash);
  if (!f?.corps) return new Response("Introuvable", { status: 404 });
  const mode = new URL(req.url).searchParams.get("telecharger") ? "attachment" : "inline";
  return new Response(f.corps, {
    headers: {
      "Content-Type": d.mime || f.mime,
      "Content-Disposition": `${mode}; filename="${nomTelechargement(d.nom)}"; filename*=UTF-8''${encodeURIComponent(d.nom)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
