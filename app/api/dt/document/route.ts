import { getUser, userRole } from "@/lib/auth/server";
import { peutModifier } from "@/lib/domain/feux";
import { MIMES_MESSAGERIE, mimeDe } from "@/lib/domain/messagerie";
import { DOCUMENT_MAX } from "@/lib/domain/documents-modele";
import { enregistrerFichier } from "@/lib/services/fichiers";
import { ajouterDocument } from "@/lib/services/documents-modele";
import { journaliser } from "@/lib/services/activite";

/* Dépôt d'une fiche du modèle (direction technique). Route plutôt qu'action
 * serveur : une action refuse les corps de plus d'un mégaoctet, et un
 * dossier technique en PDF pèse souvent plusieurs Mo. */
export async function POST(req: Request) {
  const u = await getUser();
  if (!u) return Response.json({ error: "Non authentifié" }, { status: 401 });
  if (!peutModifier("tds", userRole(u))) return Response.json({ error: "Réservé à la direction technique." }, { status: 403 });
  try {
    const fd = await req.formData();
    const f = fd.get("fichier");
    if (!(f instanceof File) || !f.size) return Response.json({ error: "Choisissez un fichier." }, { status: 400 });
    const mime = mimeDe(f.name, f.type);
    const r = await enregistrerFichier(Buffer.from(await f.arrayBuffer()), mime, {
      mimes: new Set(Object.keys(MIMES_MESSAGERIE)),
      max: DOCUMENT_MAX,
      libelle: "PDF, photo, Excel ou Word",
    });
    const id = await ajouterDocument(
      {
        commandeId: Number(fd.get("commandeId")),
        nature: String(fd.get("nature") ?? ""),
        nom: f.name,
        hash: r.hash,
        mime,
        taille: r.taille,
        note: String(fd.get("note") ?? ""),
        visibleAtelier: fd.get("visible") !== "0",
      },
      { id: u.id, nom: u.name },
    );
    await journaliser("creation", "Direction technique", `fiche « ${f.name} » déposée sur la commande ${fd.get("commandeId")}`);
    return Response.json({ id });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Erreur" }, { status: 400 });
  }
}
