import "server-only";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { activityLog, user } from "@/lib/db/schema";
import { getUser, userRole } from "@/lib/auth/server";

/* Journal d'activité.
 *
 * Écrit côté serveur à partir de la session : le client ne choisit ni l'auteur,
 * ni le rôle, ni l'horodatage. L'original les envoyait depuis le navigateur,
 * ce qui rendait le journal aussi crédible que le poste qui l'écrivait. */

export type Action =
  | "connexion"
  | "deconnexion"
  | "creation"
  | "modification"
  | "suppression"
  | "validation"
  | "impression"
  | "import"
  | "export"
  /* Actes métier qu'on veut pouvoir isoler dans le journal : émettre une
   * facture engage l'entreprise, ranger une commande la retire des écrans. */
  | "facturation"
  | "archivage";

/** Enregistre une action. Ne lève jamais : un journal en panne ne doit pas
 * faire échouer l'opération métier qu'il observe. */
export async function journaliser(action: Action, cible: string, detail = "") {
  try {
    const user = await getUser();
    await db.insert(activityLog).values({
      userId: user?.id ?? null,
      userName: user?.name ?? "",
      role: user ? userRole(user) : "",
      action,
      cible,
      detail: detail.slice(0, 500),
    });
  } catch {
    /* silencieux par conception */
  }
}

/** Variante pour les contextes où l'utilisateur est déjà connu (l'auth, par
 * exemple, où la session n'est pas encore lisible via les cookies). */
export async function journaliserPour(
  auteur: { id?: string | null; name?: string | null; role?: string | null },
  action: Action,
  cible: string,
  detail = "",
) {
  try {
    await db.insert(activityLog).values({
      userId: auteur.id ?? null,
      userName: auteur.name ?? "",
      role: auteur.role ?? "",
      action,
      cible,
      detail: detail.slice(0, 500),
    });
  } catch {
    /* silencieux par conception */
  }
}

/** Connexion / déconnexion : appelé depuis les hooks Better Auth, où seule
 * l'identifiant de session est disponible. */
export async function journaliserSession(userId: string, action: "connexion" | "deconnexion") {
  try {
    const [u] = await db.select({ name: user.name, role: user.role }).from(user).where(eq(user.id, userId));
    await db.insert(activityLog).values({
      userId,
      userName: u?.name ?? "",
      role: u?.role ?? "",
      action,
      cible: "Authentification",
    });
  } catch {
    /* silencieux par conception */
  }
}

export type EntreeJournal = {
  id: number;
  ts: string;
  userName: string;
  role: string;
  action: string;
  cible: string;
  detail: string;
};

export type FiltreJournal = {
  action?: string;
  role?: string;
  /** Fenêtre en jours ; 0 = tout l'historique. */
  jours?: number;
  limite?: number;
};

export async function listActivite(f: FiltreJournal = {}): Promise<EntreeJournal[]> {
  const conditions = [];
  if (f.action) conditions.push(eq(activityLog.action, f.action));
  if (f.role) conditions.push(eq(activityLog.role, f.role));
  if (f.jours && f.jours > 0) {
    conditions.push(gte(activityLog.ts, new Date(Date.now() - f.jours * 86_400_000)));
  }

  const rows = await db
    .select()
    .from(activityLog)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(activityLog.ts))
    .limit(Math.min(f.limite ?? 300, 1000));

  return rows.map((r) => ({
    id: r.id,
    ts: r.ts.toISOString(),
    userName: r.userName,
    role: r.role,
    action: r.action,
    cible: r.cible,
    detail: r.detail,
  }));
}

export type StatsJournal = {
  total: number;
  parAction: { action: string; n: number }[];
  parUtilisateur: { nom: string; n: number }[];
};

export async function statsActivite(jours = 30): Promise<StatsJournal> {
  const depuis = new Date(Date.now() - jours * 86_400_000);
  const [total, parAction, parUtilisateur] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(activityLog)
      .where(gte(activityLog.ts, depuis)),
    db
      .select({ action: activityLog.action, n: sql<number>`count(*)::int` })
      .from(activityLog)
      .where(gte(activityLog.ts, depuis))
      .groupBy(activityLog.action)
      .orderBy(desc(sql`count(*)`)),
    db
      .select({ nom: activityLog.userName, n: sql<number>`count(*)::int` })
      .from(activityLog)
      .where(gte(activityLog.ts, depuis))
      .groupBy(activityLog.userName)
      .orderBy(desc(sql`count(*)`))
      .limit(10),
  ]);

  return {
    total: Number(total[0]?.n ?? 0),
    parAction: parAction.map((r) => ({ action: r.action, n: Number(r.n) })),
    parUtilisateur: parUtilisateur.map((r) => ({ nom: r.nom || "—", n: Number(r.n) })),
  };
}

/** Purge des entrées trop anciennes. L'original tronquait à 3000 lignes ;
 * ici on garde une fenêtre de temps, plus lisible pour un audit. */
export async function purgerActivite(joursConserves = 365) {
  const limite = new Date(Date.now() - joursConserves * 86_400_000);
  const r = await db.delete(activityLog).where(sql`${activityLog.ts} < ${limite}`).returning({ id: activityLog.id });
  return r.length;
}
