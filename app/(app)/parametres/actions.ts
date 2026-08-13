"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin } from "@/lib/auth/server";
import { CLE_ROLE, estRoleBuiltin, type AppRole } from "@/lib/auth/permissions";
import * as users from "@/lib/services/users";
import * as perm from "@/lib/services/permissions";
import { setPermission, setSetting } from "@/lib/services/permissions";
import { journaliser } from "@/lib/services/activite";

type ActionResult = { ok: true } | { ok: false; error: string };

function fail(e: unknown): ActionResult {
  return { ok: false, error: e instanceof Error ? e.message : "Erreur" };
}

export async function createUserAction(input: {
  email: string;
  password: string;
  name: string;
  role: AppRole;
}): Promise<ActionResult> {
  try {
    await assertAdmin();
    await users.createUser(input);
    revalidatePath("/parametres");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function updateUserAction(input: {
  userId: string;
  name: string;
  role: AppRole;
  password?: string;
}): Promise<ActionResult> {
  try {
    await assertAdmin();
    await users.updateUserInfo(input.userId, { name: input.name });
    await users.setUserRole(input.userId, input.role);
    if (input.password) await users.setUserPassword(input.userId, input.password);
    revalidatePath("/parametres");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteUserAction(userId: string): Promise<ActionResult> {
  try {
    await assertAdmin();
    await users.removeUser(userId);
    revalidatePath("/parametres");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function togglePermissionAction(
  role: string,
  moduleId: string,
  allowed: boolean,
): Promise<ActionResult> {
  try {
    await assertAdmin();
    await setPermission(role, moduleId, allowed);
    revalidatePath("/parametres");
    // Permissions affect navigation for the impacted role across the app.
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setPrixFaconAction(value: number): Promise<ActionResult> {
  try {
    await assertAdmin();
    await setSetting("prixFacon", value);
    await journaliser("modification", "Paramètres", `prix façon par défaut → ${value} €`);
    revalidatePath("/parametres");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/* ─────────── rôles personnalisés ─────────── */

export async function creerRoleAction(input: {
  key: string;
  label: string;
  color: string;
}): Promise<ActionResult> {
  try {
    await assertAdmin();
    const key = input.key.trim().toLowerCase();
    if (!CLE_ROLE.test(key)) {
      return { ok: false, error: "Identifiant invalide : lettres minuscules, chiffres et _ (2 à 24 caractères)" };
    }
    if (estRoleBuiltin(key)) return { ok: false, error: "Cet identifiant est réservé" };
    if (!input.label.trim()) return { ok: false, error: "Le libellé est requis" };

    const existants = await perm.listRoles();
    if (existants.some((r) => r.key === key)) return { ok: false, error: "Ce rôle existe déjà" };

    await perm.creerRole({ key, label: input.label.trim(), color: input.color || "#64748b" });
    await journaliser("creation", "Rôles", `rôle « ${input.label.trim()} » (${key})`);
    revalidatePath("/parametres");
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function majRoleAction(input: {
  key: string;
  label: string;
  color: string;
}): Promise<ActionResult> {
  try {
    await assertAdmin();
    if (!input.label.trim()) return { ok: false, error: "Le libellé est requis" };
    await perm.majRole(input.key, { label: input.label.trim(), color: input.color || "#64748b" });
    await journaliser("modification", "Rôles", `rôle ${input.key} renommé « ${input.label.trim()} »`);
    revalidatePath("/parametres");
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function supprimerRoleAction(key: string): Promise<ActionResult> {
  try {
    await assertAdmin();
    // Un rôle encore porté par un compte ne peut pas disparaître : ces comptes
    // se retrouveraient sans aucun accès, sans que rien ne l'explique.
    const comptes = await users.listUsers();
    const portes = comptes.filter((u) => u.role === key);
    if (portes.length) {
      return {
        ok: false,
        error: `${portes.length} compte(s) utilisent encore ce rôle : ${portes.map((u) => u.name).join(", ")}`,
      };
    }
    await perm.supprimerRole(key);
    await journaliser("suppression", "Rôles", `rôle ${key}`);
    revalidatePath("/parametres");
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
