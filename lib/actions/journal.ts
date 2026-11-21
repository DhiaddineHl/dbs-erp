"use server";

import { journaliser } from "@/lib/services/activite";
import { getUser } from "@/lib/auth/server";

/** Trace la déconnexion pendant que la session est encore lisible.
 * Better Auth n'expose pas de hook « après suppression de session » : on
 * l'écrit donc juste avant l'appel à signOut, depuis la barre supérieure. */
export async function journaliserDeconnexion() {
  // Sans session (appel de l'extérieur) : rien à écrire au journal.
  if (!(await getUser())) return;
  await journaliser("deconnexion", "Authentification");
}
