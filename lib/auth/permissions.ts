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

/* ─────────── rôles ───────────
 *
 * Better Auth fige ses rôles à la compilation : `roles` ne peut donc contenir
 * que les quatre rôles historiques, qui pilotent l'administration des comptes.
 * L'accès aux modules, lui, ne passe pas par là — il vient de la table `role`
 * et de la matrice `role_permission`, toutes deux éditables en production.
 * C'est ce qui permet à DBS d'avoir un rôle « Magasin tissu » ou « Modéliste »
 * sans qu'une ligne de code les mentionne. */

export const roles = {
  admin: ac.newRole({ ...adminAc.statements, module: MODULE_IDS }),
  resp: ac.newRole({ module: DEFAULT_MODULES }),
  chef: ac.newRole({ module: DEFAULT_MODULES }),
  analyst: ac.newRole({ module: DEFAULT_MODULES }),
};

/** Rôles adossés au plugin Better Auth. Ils ne sont pas supprimables. */
export type BuiltinRole = keyof typeof roles;
export const BUILTIN_ROLE_KEYS = Object.keys(roles) as BuiltinRole[];

/** Un rôle applicatif est une chaîne libre : les rôles créés en production
 * n'existent pas dans les types. */
export type AppRole = string;

export const BUILTIN_ROLES: { key: BuiltinRole; label: string; color: string }[] = [
  { key: "admin", label: "Administrateur", color: "#7c3aed" },
  { key: "resp", label: "Responsable Prod.", color: "#1d4ed8" },
  { key: "chef", label: "Chef de chaîne", color: "#16a34a" },
  { key: "analyst", label: "Analyste", color: "#d97706" },
];

export const estRoleBuiltin = (key: string): key is BuiltinRole =>
  (BUILTIN_ROLE_KEYS as string[]).includes(key);

/** Clé de rôle acceptable : minuscules, chiffres et tirets bas, non vide. */
export const CLE_ROLE = /^[a-z][a-z0-9_]{1,23}$/;

/** Default module → allowed map for a role (used to seed the DB matrix). */
export function defaultModuleAccess(role: string): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const id of MODULE_IDS) out[id] = role === "admin" ? true : id !== "parametres";
  return out;
}
