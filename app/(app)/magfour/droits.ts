import "server-only";
import { requireUser, userRole } from "@/lib/auth/server";
import { peutModifier } from "@/lib/domain/feux";
import { getRoleModules } from "@/lib/services/permissions";

/** Même règle que les actions : rôle magasin fournitures, ou module ouvert. */
export async function droitFournitures(): Promise<boolean> {
  const user = await requireUser();
  const role = userRole(user);
  if (peutModifier("four", role)) return true;
  return (await getRoleModules(role)).magfour === true;
}
