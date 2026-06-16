import type { Tone } from "@/components/shared/status-badge";

/* Row shapes for the operational modules — these mirror exactly what each page
 * renders, so wiring a page to the DB is just `const X = await listX()`.
 * Status-style fields keep their `[Tone, label]` tuple (the service rebuilds it
 * from the stored `*Tone` / `*Label` columns). */

export type ClientRow = { code: string; nom: string; contact: string; email: string; ville: string; cmd: number; ca: string };

export type CommandeRow = {
  of: string; modele: string; client: string; assigne: string;
  qte: number; pv: string; pf: string; marge: string;
  export: string; retard: [Tone, string]; av: number; statut: [Tone, string];
};

export type FaconnierRow = { nom: string; spec: string; contact: string; tel: string; prix: string; cmd: number; charge: number };

export type TissuRow = {
  date: string; cmd: string; design: string; recue: number; prevue: number;
  ecart: [Tone, string]; controle: [Tone, string]; statut: [Tone, string];
};

export type FournitureRow = {
  date: string; cmd: string; type: string; design: string; qte: string;
  controle: [Tone, string]; statut: [Tone, string];
};

export type CoupeRow = { of: string; mc: string; qte: number; coupee: number; planif: string; fin: string; statut: [Tone, string] };

export type BeRow = { of: string; mc: string; envoi: string; ok: string; ref: string; statut: [Tone, string] };

export type GammeRow = { modele: string; ops: number; sam: string; cout: string; cap: string };

export type CapaciteChaineRow = { ch: string; eff: number; min: string; modele: string; cap: string; cout: string };

export type CostingRow = {
  of: string; modele: string; qte: number; sam: string; coutP: string;
  coutT: string; pf: string; ecart: [Tone, string]; delai: string;
};

export type OrdoRow = {
  rang: number; prio: [Tone, string]; of: string; mc: string; qte: number;
  sam: string; charge: string; assigne: string; export: string; crit: [Tone, string];
};

export type OfRow = { of: string; article: string; chaine: string; qte: number; prod: number; debut: string; fin: string };

export type BrRow = { br: string; date: string; facon: string; cmd: string; recu: number; oknc: string; controle: [Tone, string] };

export type MagasinRow = { of: string; mc: string; source: [Tone, string]; cmd: number; recu: number; statut: [Tone, string] };

export type BlRow = { bl: string; date: string; client: string; lignes: number; qte: number; total: string; statut: [Tone, string] };

export type ArchiveRow = { of: string; modele: string; client: string; qte: number; ca: string; marge: string; livre: string; retard: [Tone, string] };

export type AlertRow = { iconName: string; tone: Tone; title: string; detail: string; level: [Tone, string] };

export type QrqcRow = { date: string; pb: string; cause: string; cmd: string; action: string; statut: [Tone, string] };

export type ActionRow = { action: string; resp: string; echeance: string; prio: [Tone, string]; statut: [Tone, string] };
