"use server";

import { revalidatePath } from "next/cache";
import { assertUser, userRole } from "@/lib/auth/server";
import { cleAleatoire } from "@/lib/atelier/cle";
import { getSetting, setSetting } from "@/lib/services/permissions";
import { journaliser } from "@/lib/services/activite";

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

const fail = (e: unknown): Result<never> => ({
  ok: false,
  error: e instanceof Error ? e.message : "Erreur",
});

const ATELIER = ["admin", "resp", "chef"];

async function exiger() {
  const user = await assertUser();
  if (!ATELIER.includes(userRole(user))) throw new Error("Réservé à la direction de production");
}

/** URL publique du portail. En atelier, les téléphones ne voient pas le serveur
 * sous la même adresse que le navigateur du bureau : l'administrateur doit
 * pouvoir la fixer lui-même. */
export async function majBasePortail(base: string): Promise<Result> {
  try {
    await exiger();
    const v = base.trim().replace(/\/+$/, "");
    if (v && !/^https?:\/\/.+/.test(v)) {
      return { ok: false, error: "Indiquez une adresse complète, commençant par http:// ou https://" };
    }
    await setSetting("basePortail", v);
    await journaliser("modification", "QR rendement", `adresse du portail → ${v || "(vide)"}`);
    revalidatePath("/qrouv");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Génère (ou remplace) le jeton du QR direction. Remplacer invalide les QR
 * déjà imprimés — c'est précisément l'intérêt. */
export async function regenererJetonDirection(): Promise<Result<string>> {
  try {
    await exiger();
    const jeton = cleAleatoire(28);
    await setSetting("jetonDirection", jeton);
    await journaliser("modification", "QR rendement", "nouveau jeton direction — anciens QR invalidés");
    revalidatePath("/qrouv");
    return { ok: true, data: jeton };
  } catch (e) {
    return fail(e);
  }
}

export async function supprimerJetonDirection(): Promise<Result> {
  try {
    await exiger();
    await setSetting("jetonDirection", "");
    await journaliser("modification", "QR rendement", "QR direction désactivé");
    revalidatePath("/qrouv");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function lireBasePortail() {
  return getSetting<string>("basePortail", "");
}
