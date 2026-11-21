import { NAV_STRUCTURE, entreeAutorisee } from "@/lib/nav";

/* ACCÈS AUX MODULES — la règle unique, pure (sans base).
 *
 * La matrice « rôle × module » de Paramètres → Rôles ne décidait que du MENU :
 * une page décochée disparaissait du menu, mais restait ouverte à qui
 * connaissait son adresse (ou suivait un lien, comme le bouton « Application
 * complète » du téléphone, qui menait au Cockpit). Désormais la même matrice
 * garde chaque page, chaque export, et chaque action du serveur. */

/** Un module est ouvert à un rôle si sa case n'est pas décochée dans la
 * matrice. Même règle que le menu : ce qu'on voit dans le menu est
 * exactement ce qu'on ouvre. */
export function moduleOuvert(id: string, modules: Record<string, boolean>, role?: string): boolean {
  if (role === "admin") return true;
  // Paramètres : l'administrateur seul, quoi que dise la matrice.
  if (id === "parametres") return false;
  const item = NAV_STRUCTURE.flatMap((g) => g.items).find((i) => i.id === id);
  return item ? entreeAutorisee(item, modules) : modules[id] !== false;
}

/** Au moins un des modules est ouvert. */
export const unModuleOuvert = (ids: readonly string[], modules: Record<string, boolean>, role?: string) =>
  ids.some((id) => moduleOuvert(id, modules, role));

/** Écrans du téléphone (/m/…) → module du bureau qui les ouvre. */
export const MODULE_MOBILE: Record<string, string> = {
  tissu: "magtissu",
  paquets: "paquets",
  gpao: "gpao_prod",
  magasin: "magasin",
};

export const libelleModule = (id: string) => NAV_STRUCTURE.flatMap((g) => g.items).find((i) => i.id === id)?.label ?? id;
