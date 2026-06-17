import type { Tone } from "@/components/shared/status-badge";

/* Row shapes for the operational modules — these mirror exactly what each page
 * renders, so wiring a page to the DB is just `const X = await listX()`.
 * Status-style fields keep their `[Tone, label]` tuple (the service rebuilds it
 * from the stored `*Tone` / `*Label` columns). */

export type ClientRow = { id: number; code: string; nom: string; contact: string; email: string; ville: string; cmd: number; ca: string };

export type Taille = { taille: string; qte: number };

export type CommandeRow = {
  id: number; of: string; modele: string; refArticle: string; couleur: string;
  client: string; faconnier: string; chaineId: number | null;
  assigne: string; qte: number; tailles: Taille[]; pv: string; pf: string; marge: string;
  receptTissu: string; export: string; dateExportReel: string; note: string;
  retard: [Tone, string]; av: number; statut: [Tone, string];
};

export type FaconnierRow = { id: number; nom: string; spec: string; contact: string; tel: string; prix: string; cmd: number; charge: number };

export type TissuRow = {
  id: number; date: string; cmd: string; design: string; recue: number; prevue: number;
  ecart: [Tone, string]; controle: [Tone, string]; statut: [Tone, string];
};

export type FournitureRow = {
  id: number; date: string; cmd: string; type: string; design: string; qte: string;
  controle: [Tone, string]; statut: [Tone, string];
};

export type CoupeRow = { id: number; of: string; mc: string; qte: number; coupee: number; planif: string; fin: string; statut: [Tone, string] };

export type BeRow = { id: number; of: string; mc: string; envoi: string; ok: string; ref: string; statut: [Tone, string] };

export type GammeRow = { id: number; modele: string; ops: number; sam: string; cout: string; cap: string };

export type CapaciteChaineRow = { id: number; ch: string; eff: number; min: string; modele: string; cap: string; cout: string };

export type CostingRow = {
  id: number; of: string; modele: string; qte: number; sam: string; coutP: string;
  coutT: string; pf: string; ecart: [Tone, string]; delai: string;
};

export type OrdoRow = {
  id: number; rang: number; prio: [Tone, string]; of: string; mc: string; qte: number;
  sam: string; charge: string; assigne: string; export: string; crit: [Tone, string];
};

export type OfRow = { id: number; of: string; article: string; chaine: string; qte: number; prod: number; debut: string; fin: string };

export type BrRow = { id: number; br: string; date: string; facon: string; cmd: string; recu: number; oknc: string; controle: [Tone, string] };

export type MagasinRow = { id: number; of: string; mc: string; source: [Tone, string]; cmd: number; recu: number; statut: [Tone, string] };

export type BlRow = { id: number; bl: string; date: string; client: string; lignes: number; qte: number; total: string; statut: [Tone, string] };

export type ArchiveRow = { id: number; of: string; modele: string; client: string; qte: number; ca: string; marge: string; livre: string; retard: [Tone, string] };

export type AlertRow = { id: number; iconName: string; tone: Tone; title: string; detail: string; level: [Tone, string] };

export type QrqcRow = { id: number; date: string; pb: string; cause: string; cmd: string; action: string; statut: [Tone, string] };

export type ActionRow = { id: number; action: string; resp: string; echeance: string; prio: [Tone, string]; statut: [Tone, string] };
