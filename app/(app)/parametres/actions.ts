"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin } from "@/lib/auth/server";
import type { AppRole } from "@/lib/auth/permissions";
import * as users from "@/lib/services/users";
import { setPermission, setSetting } from "@/lib/services/permissions";

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
    revalidatePath("/parametres");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
