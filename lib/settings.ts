"use client";

import { useSyncExternalStore } from "react";
import { NAV_STRUCTURE } from "./nav";

/* ═══════════════════ ROLES & TYPES ═══════════════════ */
export type RoleKey = "admin" | "resp" | "chef" | "analyst";
export const ROLES: Record<RoleKey, { label: string; color: string }> = {
  admin: { label: "Administrateur", color: "#7c3aed" },
  resp: { label: "Responsable Prod.", color: "#1d4ed8" },
  chef: { label: "Chef de chaîne", color: "#16a34a" },
  analyst: { label: "Analyste", color: "#d97706" },
};

export type User = { id: number; login: string; pass: string; name: string; role: RoleKey };
/** rolePerms[role][navItemId] = accessible? (admin implicitly true everywhere) */
export type RolePerms = Record<string, Record<string, boolean>>;

export type Settings = {
  prixFacon: number;
  users: User[];
  rolePerms: RolePerms;
  currentRole: RoleKey;
};

const KEY = "dbs_pilotpro_settings_v1";

const DEFAULT_USERS: User[] = [
  { id: 1, login: "admin", pass: "admin123", name: "Administrateur", role: "admin" },
  { id: 2, login: "resp", pass: "resp123", name: "Responsable Prod.", role: "resp" },
  { id: 3, login: "dbs", pass: "dbs123", name: "Chef DBS", role: "chef" },
];

export const allModuleIds = () => NAV_STRUCTURE.flatMap((g) => g.items.map((i) => i.id));

/** Fill in any missing role/module permission with the default (everything but
 * /parametres is allowed by default for non-admin roles). */
export function ensureRolePerms(perms: RolePerms): RolePerms {
  const next: RolePerms = { ...perms };
  (Object.keys(ROLES) as RoleKey[]).forEach((rk) => {
    if (rk === "admin") return;
    if (!next[rk]) next[rk] = {};
    for (const id of allModuleIds()) {
      if (typeof next[rk][id] !== "boolean") next[rk][id] = id !== "parametres";
    }
  });
  return next;
}

export function canAccess(s: Settings, id: string): boolean {
  if (s.currentRole === "admin") return true;
  const p = ensureRolePerms(s.rolePerms)[s.currentRole];
  return !!(p && p[id]);
}

function makeDefault(): Settings {
  return { prixFacon: 3.5, users: DEFAULT_USERS, rolePerms: ensureRolePerms({}), currentRole: "admin" };
}

/* ═══════════════════ EXTERNAL STORE (SSR-safe) ═══════════════════ */
const SERVER_SNAPSHOT = makeDefault();
let state: Settings = SERVER_SNAPSHOT;
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}
function ensureLoaded() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Settings>;
      state = { ...makeDefault(), ...parsed, rolePerms: ensureRolePerms(parsed.rolePerms || {}) };
      emit();
    }
  } catch {
    /* ignore */
  }
}
function persist(next: Settings) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  emit();
}

function subscribe(l: () => void) {
  listeners.add(l);
  ensureLoaded();
  return () => listeners.delete(l);
}

export function useSettings() {
  const snap = useSyncExternalStore(
    subscribe,
    () => state,
    () => SERVER_SNAPSHOT,
  );
  return {
    settings: snap,
    setPrixFacon: (v: number) => persist({ ...state, prixFacon: v }),
    setCurrentRole: (r: RoleKey) => persist({ ...state, currentRole: r }),
    togglePerm: (role: RoleKey, id: string, val: boolean) => {
      const perms = ensureRolePerms(state.rolePerms);
      persist({ ...state, rolePerms: { ...perms, [role]: { ...perms[role], [id]: val } } });
    },
    saveUser: (u: Omit<User, "id"> & { id?: number }) => {
      if (u.id) {
        persist({
          ...state,
          users: state.users.map((x) =>
            x.id === u.id ? (x.login === "admin" ? { ...x, pass: u.pass, name: u.name } : { ...x, ...u, id: x.id }) : x,
          ),
        });
      } else {
        const nid = Math.max(0, ...state.users.map((x) => x.id)) + 1;
        persist({ ...state, users: [...state.users, { ...u, id: nid }] });
      }
    },
    deleteUser: (id: number) => persist({ ...state, users: state.users.filter((x) => x.id !== id) }),
  };
}

/* ═══════════════════ FULL BACKUP / RESTORE / RESET ═══════════════════
   Bundles every dbs_* localStorage key (settings, GPAO, facturation…). */
export function exportBackup() {
  const data: Record<string, unknown> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && (k.startsWith("dbs_") || k.startsWith("dbs-"))) {
      try {
        data[k] = JSON.parse(localStorage.getItem(k) || "null");
      } catch {
        data[k] = localStorage.getItem(k);
      }
    }
  }
  const blob = new Blob([JSON.stringify({ exported: new Date().toISOString(), data }, null, 2)], {
    type: "application/json",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "PilotPro_sauvegarde_" + new Date().toISOString().slice(0, 10) + ".json";
  a.click();
}

export function restoreBackup(file: File, onDone: (ok: boolean) => void) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const parsed = JSON.parse(String(e.target?.result));
      const data = parsed.data ?? parsed;
      Object.entries(data).forEach(([k, v]) => {
        if (k.startsWith("dbs_") || k.startsWith("dbs-")) {
          localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v));
        }
      });
      loaded = false;
      ensureLoaded();
      onDone(true);
    } catch {
      onDone(false);
    }
  };
  reader.readAsText(file);
}

export function resetAll() {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && (k.startsWith("dbs_") || k.startsWith("dbs-"))) keys.push(k);
  }
  keys.forEach((k) => localStorage.removeItem(k));
  persist(makeDefault());
}
