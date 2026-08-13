"use server";

import { journaliser } from "@/lib/services/activite";

/** Trace la déconnexion pendant que la session est encore lisible.
 * Better Auth n'expose pas de hook « après suppression de session » : on
 * l'écrit donc juste avant l'appel à signOut, depuis la barre supérieure. */
export async function journaliserDeconnexion() {
  await journaliser("deconnexion", "Authentification");
}
