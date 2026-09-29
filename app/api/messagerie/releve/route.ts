import { getUser } from "@/lib/auth/server";
import { releve } from "@/lib/services/messagerie";

/* Relève de la messagerie, appelée toutes les quelques secondes par chaque
 * page ouverte : non lus, nouveaux messages (alerte à l'écran), et — si une
 * discussion est ouverte — ses nouveaux messages et accusés de lecture. */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = await getUser();
  if (!u) return Response.json({ error: "Non authentifié" }, { status: 401 });
  const q = new URL(req.url).searchParams;
  const num = (k: string) => {
    const v = q.get(k);
    const n = v == null || v === "" ? NaN : Number(v);
    return Number.isInteger(n) && n >= 0 ? n : undefined;
  };
  try {
    const r = await releve({ id: u.id, nom: u.name }, { depuis: num("depuis"), conversationId: num("conv"), apres: num("apres") });
    return Response.json(r, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Erreur" }, { status: 500 });
  }
}
