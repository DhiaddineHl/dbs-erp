/* Saisie de production GPAO, case par case — logique pure (testable).
 *
 * Avant, l'écran GPAO renvoyait au serveur la matrice ENTIÈRE d'une journée à
 * chaque case tapée. Tant qu'une seule personne saisissait, ça allait. Avec la
 * tablette de l'agent de méthode en chaîne ET l'écran du bureau ouverts sur la
 * même journée, le dernier qui enregistrait écrasait les cases de l'autre.
 *
 * Désormais chaque geste est une SAISIE élémentaire (« H3 de Fadila = 42 »),
 * appliquée par le serveur sur la version à jour de la journée, sous verrou :
 * deux saisies simultanées sur des cases différentes s'additionnent au lieu de
 * s'écraser. La tablette et le bureau passent par le même chemin — il n'y a
 * qu'une saisie, faite une seule fois. */

export type Cellule = number | "RI" | "ABS";
export type OpDetail = { poste: string; sam: number; qte: number };
export type Arret = { motif: string; secondes: number };
export type Ligne = { id: number; nom: string; poste: string; sam: number };

/** Les matrices d'une journée que la saisie peut modifier. */
export type Matrices = {
  cols: string[];
  cloture: boolean;
  sortie: Record<string, number>;
  ops: Record<number, Record<string, Cellule>>;
  ret: Record<number, number>;
  opsSam: Record<number, Record<string, number>>;
  opsPoste: Record<number, Record<string, string>>;
  opsDetail: Record<number, Record<string, OpDetail[]>>;
  arrets: Record<number, Arret[]>;
};
export type ChampMatrice = Exclude<keyof Matrices, "cols">;

export type Saisie =
  /** Pièces d'une ouvrière dans l'heure, ou RI / ABS, ou null pour effacer. */
  | { type: "op"; ouvId: number; col: string; valeur: Cellule | null }
  /** Pièces sorties de chaîne dans l'heure (null = effacer). */
  | { type: "sortie"; col: string; valeur: number | null }
  /** Retouches de la journée pour une ouvrière (null = effacer). */
  | { type: "ret"; ouvId: number; valeur: number | null }
  /** Opérations réellement faites dans UNE heure (changement de poste) :
   *  0 ligne = heure vidée ; 1 ligne = poste / SAM de l'heure ; ≥ 2 = multi-postes. */
  | { type: "posteHeure"; ouvId: number; col: string; lignes: OpDetail[] }
  /** Toutes les heures d'une ouvrière d'un coup (fenêtre « ⚙ » du bureau). */
  | { type: "postesJour"; ouvId: number; heures: Record<string, OpDetail[]> }
  /** Remet l'ouvrière sur son poste habituel (efface postes et multi-postes). */
  | { type: "postesReset"; ouvId: number }
  | { type: "arretAjout"; ouvId: number; motif: string; secondes: number }
  | { type: "arretRetrait"; ouvId: number; index: number }
  /** Liste complète des arrêts d'une ouvrière (fenêtre du bureau). */
  | { type: "arrets"; ouvId: number; liste: Arret[] }
  /** Retire une ouvrière de la journée : sa saisie part avec elle. */
  | { type: "retirerOuvriere"; ouvId: number }
  | { type: "cloture"; valeur: boolean };

export const QTE_MAX = 100000;

/** Motifs d'arrêt proposés — la même liste au bureau et sur la tablette. */
export const MOTIFS_ARRET = [
  "Panne machine",
  "Attente pièces / alimentation",
  "Manque de fil",
  "Manque fourniture",
  "Changement de poste",
  "Réglage machine",
  "Problème qualité / retouche",
  "Coupure électricité",
  "Formation",
  "Absence pièce coupée",
  "Autre",
];
export const ARRET_MAX_SECONDES = 12 * 3600;

const r2 = (n: number) => Math.round(n * 100) / 100;
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x ?? {}));

/** Nombre saisi valide : fini, positif ou nul, borné. */
export function quantite(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(",", ".").trim());
  if (!Number.isFinite(n) || n < 0 || n > QTE_MAX) return null;
  return r2(n);
}

/** Lit ce que tape l'agent dans une case : « 42 », « 42,5 », « abs », « ri », vide. */
export function lireCellule(texte: string): { ok: true; valeur: Cellule | null } | { ok: false; error: string } {
  const t = (texte ?? "").trim().toUpperCase();
  if (!t) return { ok: true, valeur: null };
  if (t === "RI" || t === "ABS") return { ok: true, valeur: t };
  const n = quantite(t);
  return n == null ? { ok: false, error: `« ${texte} » n'est pas une quantité` } : { ok: true, valeur: n };
}

function sansCle<T>(m: Record<string | number, T>, k: string | number) {
  delete m[k as keyof typeof m];
}
/** Supprime une case d'une matrice par ouvrière, et la ligne si elle devient vide. */
function viderCase<T>(m: Record<number, Record<string, T>>, ouvId: number, col: string) {
  if (!m[ouvId]) return;
  delete m[ouvId][col];
  if (!Object.keys(m[ouvId]).length) delete m[ouvId];
}
function poserCase<T>(m: Record<number, Record<string, T>>, ouvId: number, col: string, v: T) {
  (m[ouvId] ??= {})[col] = v;
}

/** Écrit dans une heure ce que l'ouvrière y a réellement fait. */
function ecrireHeure(m: Matrices, o: Ligne, col: string, lignes: OpDetail[]) {
  const propres = lignes
    .map((l) => ({ poste: (l.poste ?? "").trim() || o.poste, sam: Number(l.sam) > 0 ? r2(Number(l.sam)) : o.sam, qte: quantite(l.qte) }))
    .filter((l): l is OpDetail => l.qte != null);
  viderCase(m.opsDetail, o.id, col);
  viderCase(m.opsSam, o.id, col);
  viderCase(m.opsPoste, o.id, col);
  if (!propres.length) {
    viderCase(m.ops, o.id, col);
    return;
  }
  if (propres.length >= 2) {
    poserCase(m.opsDetail, o.id, col, propres);
    poserCase(m.ops, o.id, col, r2(propres.reduce((t, x) => t + x.qte, 0)));
    return;
  }
  const [l] = propres;
  poserCase(m.ops, o.id, col, l.qte);
  if (l.sam !== o.sam) poserCase(m.opsSam, o.id, col, l.sam);
  if (l.poste && l.poste !== o.poste) poserCase(m.opsPoste, o.id, col, l.poste);
}

/** Applique une saisie à une journée. Renvoie les matrices modifiées et la
 * liste des champs touchés (seuls ceux-là sont réécrits en base), ou le refus. */
export function appliquerSaisie(
  depart: Matrices,
  roster: Ligne[],
  s: Saisie,
): { ok: true; matrices: Matrices; champs: ChampMatrice[] } | { ok: false; error: string } {
  if (depart.cloture && !(s.type === "cloture" && s.valeur === false)) {
    return { ok: false, error: "Journée clôturée : rouvrez-la au bureau pour la modifier." };
  }
  const m: Matrices = {
    cols: [...depart.cols],
    cloture: depart.cloture,
    sortie: clone(depart.sortie),
    ops: clone(depart.ops),
    ret: clone(depart.ret),
    opsSam: clone(depart.opsSam),
    opsPoste: clone(depart.opsPoste),
    opsDetail: clone(depart.opsDetail),
    arrets: clone(depart.arrets),
  };
  const heure = (col: string) => m.cols.includes(col);
  const ligne = (id: number) => roster.find((o) => o.id === id);
  const ok = (...champs: ChampMatrice[]) => ({ ok: true as const, matrices: m, champs });

  switch (s.type) {
    case "sortie": {
      if (!heure(s.col)) return { ok: false, error: `Heure ${s.col} inconnue pour cette journée.` };
      if (s.valeur == null) sansCle(m.sortie, s.col);
      else {
        const q = quantite(s.valeur);
        if (q == null) return { ok: false, error: "Quantité de sortie invalide." };
        m.sortie[s.col] = q;
      }
      return ok("sortie");
    }
    case "op": {
      const o = ligne(s.ouvId);
      if (!o) return { ok: false, error: "Ouvrière absente de cette journée." };
      if (!heure(s.col)) return { ok: false, error: `Heure ${s.col} inconnue pour cette journée.` };
      // Une valeur unique remplace un éventuel détail multi-postes de l'heure ;
      // le poste « du moment » (opsPoste / opsSam) est conservé.
      viderCase(m.opsDetail, o.id, s.col);
      if (s.valeur == null) viderCase(m.ops, o.id, s.col);
      else if (s.valeur === "RI" || s.valeur === "ABS") poserCase(m.ops, o.id, s.col, s.valeur);
      else {
        const q = quantite(s.valeur);
        if (q == null) return { ok: false, error: "Quantité invalide." };
        poserCase(m.ops, o.id, s.col, q);
      }
      return ok("ops", "opsDetail");
    }
    case "ret": {
      if (!ligne(s.ouvId)) return { ok: false, error: "Ouvrière absente de cette journée." };
      if (s.valeur == null) sansCle(m.ret, s.ouvId);
      else {
        const q = quantite(s.valeur);
        if (q == null) return { ok: false, error: "Nombre de retouches invalide." };
        m.ret[s.ouvId] = q;
      }
      return ok("ret");
    }
    case "posteHeure": {
      const o = ligne(s.ouvId);
      if (!o) return { ok: false, error: "Ouvrière absente de cette journée." };
      if (!heure(s.col)) return { ok: false, error: `Heure ${s.col} inconnue pour cette journée.` };
      ecrireHeure(m, o, s.col, s.lignes ?? []);
      return ok("ops", "opsSam", "opsPoste", "opsDetail");
    }
    case "postesJour": {
      const o = ligne(s.ouvId);
      if (!o) return { ok: false, error: "Ouvrière absente de cette journée." };
      for (const col of m.cols) {
        const avait = m.ops[o.id]?.[col] !== undefined || !!m.opsDetail[o.id]?.[col];
        const lignes = s.heures[col];
        // Une heure absente du formulaire mais saisie avant = vidée ;
        // RI / ABS ne sont pas des opérations : la fenêtre ne les touche pas.
        if (lignes) ecrireHeure(m, o, col, lignes);
        else if (avait && typeof m.ops[o.id]?.[col] === "number") ecrireHeure(m, o, col, []);
      }
      return ok("ops", "opsSam", "opsPoste", "opsDetail");
    }
    case "postesReset": {
      delete m.opsSam[s.ouvId];
      delete m.opsPoste[s.ouvId];
      // Le multi-postes redevient une quantité simple (la somme de l'heure).
      for (const [col, d] of Object.entries(m.opsDetail[s.ouvId] ?? {})) {
        poserCase(m.ops, s.ouvId, col, r2(d.reduce((t, x) => t + (Number(x.qte) || 0), 0)));
      }
      delete m.opsDetail[s.ouvId];
      return ok("ops", "opsSam", "opsPoste", "opsDetail");
    }
    case "arretAjout": {
      if (!ligne(s.ouvId)) return { ok: false, error: "Ouvrière absente de cette journée." };
      const sec = Math.round(Number(s.secondes));
      if (!(sec > 0) || sec > ARRET_MAX_SECONDES) return { ok: false, error: "Durée d'arrêt invalide." };
      const motif = (s.motif ?? "").trim();
      if (!motif) return { ok: false, error: "Choisissez le motif de l'arrêt." };
      (m.arrets[s.ouvId] ??= []).push({ motif: motif.slice(0, 80), secondes: sec });
      return ok("arrets");
    }
    case "arretRetrait": {
      const l = m.arrets[s.ouvId];
      if (!l || !l[s.index]) return { ok: false, error: "Arrêt introuvable (déjà retiré ?)." };
      l.splice(s.index, 1);
      if (!l.length) delete m.arrets[s.ouvId];
      return ok("arrets");
    }
    case "arrets": {
      const liste = (s.liste ?? [])
        .map((a) => ({ motif: (a.motif ?? "").trim().slice(0, 80), secondes: Math.round(Number(a.secondes)) }))
        .filter((a) => a.motif && a.secondes > 0 && a.secondes <= ARRET_MAX_SECONDES);
      if (liste.length) m.arrets[s.ouvId] = liste;
      else delete m.arrets[s.ouvId];
      return ok("arrets");
    }
    case "retirerOuvriere": {
      for (const k of ["ops", "ret", "opsSam", "opsPoste", "opsDetail", "arrets"] as const) delete (m[k] as Record<number, unknown>)[s.ouvId];
      return ok("ops", "ret", "opsSam", "opsPoste", "opsDetail", "arrets");
    }
    case "cloture":
      m.cloture = !!s.valeur;
      return ok("cloture");
  }
}

/* ─────────── suivi de saisie (tablette) ─────────── */

/** Une case est « faite » dès qu'elle porte une quantité, RI ou ABS. */
export const caseFaite = (m: Pick<Matrices, "ops" | "opsDetail">, ouvId: number, col: string) =>
  m.ops[ouvId]?.[col] !== undefined || !!m.opsDetail[ouvId]?.[col]?.length;

/** Avancement de la saisie d'une heure : ouvrières renseignées + sortie. */
export function avancementHeure(m: Pick<Matrices, "ops" | "opsDetail" | "sortie">, roster: { id: number }[], col: string) {
  const faites = roster.filter((o) => caseFaite(m, o.id, col)).length;
  return { faites, total: roster.length, sortie: m.sortie[col] !== undefined, complete: faites === roster.length && m.sortie[col] !== undefined };
}

/** L'heure à proposer en ouvrant la tablette : la première incomplète, sinon la dernière. */
export function heureASaisir(m: Pick<Matrices, "cols" | "ops" | "opsDetail" | "sortie">, roster: { id: number }[]): string {
  return m.cols.find((c) => !avancementHeure(m, roster, c).complete) ?? m.cols[m.cols.length - 1] ?? "H1";
}

/** Absente toute la journée : chaque heure est marquée ABS. */
export const absenteJour = (m: Pick<Matrices, "ops">, cols: string[], ouvId: number) =>
  cols.length > 0 && cols.every((c) => m.ops[ouvId]?.[c] === "ABS");
