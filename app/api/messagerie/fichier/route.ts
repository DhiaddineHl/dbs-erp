import { getUser } from "@/lib/auth/server";
import { FICHIER_MAX, MIMES_MESSAGERIE, mimeDe } from "@/lib/domain/messagerie";
import { enregistrerFichier } from "@/lib/services/fichiers";

/* Dépôt d'une pièce jointe de la messagerie (photo, PDF, Excel, Word).
 * Route plutôt qu'action serveur : une action refuse les corps de plus d'un
 * mégaoctet, un PDF ou un classeur les dépasse facilement. */
export async function POST(req: Request) {
  const u = await getUser();
  if (!u) return Response.json({ error: "Non authentifié" }, { status: 401 });
  try {
    const fd = await req.formData();
    const f = fd.get("fichier");
    if (!(f instanceof File)) return Response.json({ error: "Aucun fichier" }, { status: 400 });
    const mime = mimeDe(f.name, f.type);
    const r = await enregistrerFichier(Buffer.from(await f.arrayBuffer()), mime, {
      mimes: new Set(Object.keys(MIMES_MESSAGERIE)),
      max: FICHIER_MAX,
      libelle: "photo, PDF, Excel, Word ou CSV",
    });
    return Response.json({ hash: r.hash, nom: f.name.slice(0, 200), mime, taille: r.taille });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Erreur" }, { status: 400 });
  }
}
