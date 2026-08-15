import { getUser } from "@/lib/auth/server";
import { lireFichier } from "@/lib/services/fichiers";

/** Sert un fichier par son hash. Adressé par contenu, donc immuable : le cache
 * peut le garder indéfiniment. Réservé aux utilisateurs connectés — un hash
 * n'est pas un secret et ne doit pas servir de jeton d'accès.
 *
 * Les octets sont relayés depuis le stockage objet plutôt que servis par une
 * URL signée : une URL signée est un porteur de droit déguisé, qui circule et
 * survit au partage. Le contrôle d'accès reste ici, où la session est connue.
 * Le flux traverse sans être mis en mémoire. */
export async function GET(_req: Request, { params }: { params: Promise<{ hash: string }> }) {
  if (!(await getUser())) return new Response("Non authentifié", { status: 401 });

  const { hash } = await params;
  if (!/^[a-f0-9]{64}$/.test(hash)) return new Response("Hash invalide", { status: 400 });

  const f = await lireFichier(hash);
  if (!f) return new Response("Introuvable", { status: 404 });
  // Ligne présente mais objet absent du bucket : l'index ment, on ne sert rien.
  if (!f.corps) return new Response("Introuvable", { status: 404 });

  return new Response(f.corps, {
    headers: {
      "Content-Type": f.mime,
      "Content-Length": String(f.taille),
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
