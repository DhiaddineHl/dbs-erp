import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/* Identifiant de la version en ligne : le BUILD_ID que Next écrit à chaque
 * construction. Un onglet resté ouvert pendant un déploiement garde les
 * identifiants d'actions serveur de l'ANCIENNE version : ses enregistrements
 * partent en 404 sans rien dire. La veille de version (components/shared/
 * veille-version.tsx) compare cet identifiant à celui de la page pour le
 * repérer. "" = inconnu (développement) : la veille ne fait alors rien. */
let cache: string | null = null;

export function versionApp(): string {
  if (cache != null) return cache;
  try {
    const id = readFileSync(join(process.cwd(), ".next", "BUILD_ID"), "utf8").trim();
    cache = id === "development" ? "" : id;
  } catch {
    cache = "";
  }
  return cache;
}
