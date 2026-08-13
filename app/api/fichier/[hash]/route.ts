import { getUser } from "@/lib/auth/server";
import { lireFichier } from "@/lib/services/fichiers";

/** Sert un fichier par son hash. Adressé par contenu, donc immuable : le cache
 * peut le garder indéfiniment. Réservé aux utilisateurs connectés — un hash
 * n'est pas un secret et ne doit pas servir de jeton d'accès. */
export async function GET(_req: Request, { params }: { params: Promise<{ hash: string }> }) {
  if (!(await getUser())) return new Response("Non authentifié", { status: 401 });

  const { hash } = await params;
  if (!/^[a-f0-9]{64}$/.test(hash)) return new Response("Hash invalide", { status: 400 });

  const f = await lireFichier(hash);
  if (!f) return new Response("Introuvable", { status: 404 });

  return new Response(new Uint8Array(f.data), {
    headers: {
      "Content-Type": f.mime,
      "Content-Length": String(f.taille),
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
