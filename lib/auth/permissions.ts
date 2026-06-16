import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements } from "better-auth/plugins/admin/access";
import { NAV_STRUCTURE } from "@/lib/nav";

/** Every navigable module id (cockpit, factures, gpao_prod, parametres, …). */
export const MODULE_IDS = NAV_STRUCTURE.flatMap((g) => g.items.map((i) => i.id));

/** Modules a non-admin role may access by default (everything but settings). */
const DEFAULT_MODULES = MODULE_IDS.filter((id) => id !== "parametres");

/**
 * Access-control statements: the admin plugin's user/session management
 * (`defaultStatements`) plus a `module` resource whose "actions" are nav ids.
 */
export const statement = {
  ...defaultStatements,
  module: MODULE_IDS,
} as const;

export const ac = createAccessControl(statement);

/** Code-defined baseline roles. The editable DB matrix overrides module access
 * at runtime for navigation; these provide the server-enforceable defaults. */
export const roles = {
  admin: ac.newRole({ ...adminAc.statements, module: MODULE_IDS }),
  resp: ac.newRole({ module: DEFAULT_MODULES }),
  chef: ac.newRole({ module: DEFAULT_MODULES }),
  analyst: ac.newRole({ module: DEFAULT_MODULES }),
};

export type AppRole = keyof typeof roles;
export const ROLE_KEYS = Object.keys(roles) as AppRole[];

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Administrateur",
  resp: "Responsable Prod.",
  chef: "Chef de chaîne",
  analyst: "Analyste",
};

/** Default module → allowed map for a role (used to seed the DB matrix). */
export function defaultModuleAccess(role: AppRole): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const id of MODULE_IDS) out[id] = role === "admin" ? true : id !== "parametres";
  return out;
}
