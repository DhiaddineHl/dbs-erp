/* Atelier : registre du personnel et catalogue des opérations.
 *
 * Le rapprochement ouvrière ↔ personne est ici, en fonctions pures, parce que
 * c'est la partie qui se trompe : deux orthographes d'un même nom, un prénom
 * et un nom inversés, un accent perdu à l'export. */

export const STATUTS_PERSONNEL = {
  active: { label: "En poste", tone: "success" as const },
  absente: { label: "Absente", tone: "warning" as const },
  conge: { label: "Congé", tone: "info" as const },
  sortie: { label: "Sortie", tone: "neutral" as const },
};

export type StatutPersonnel = keyof typeof STATUTS_PERSONNEL;
export const estStatutPersonnel = (v: string): v is StatutPersonnel => v in STATUTS_PERSONNEL;

/** Une absence ou un congé sont temporaires : la personne reste proposée à la
 * saisie. Seule une sortie la retire des listes — sans effacer son historique. */
export const estDisponible = (statut: string) => statut !== "sortie";

/** Matricule attribué d'office à une personne créée depuis l'atelier, faute
 * d'en connaître un. Le préfixe est voulu visible : personne ne doit le
 * confondre avec un matricule de paie, et l'assistant de fusion s'en sert pour
 * proposer le rattachement à la vraie fiche. */
export const PREFIXE_PROVISOIRE = "PROV-";
export const estMatriculeProvisoire = (m: string) => m.startsWith(PREFIXE_PROVISOIRE);

/** Clé de rapprochement d'un nom : minuscules, sans accent, mots triés.
 * Distincte de `normaliserNom` de lib/domain/commande.ts, qui ne trie pas.
 * Le tri des mots fait correspondre « Ben Hayej Ikram » et « Ikram Ben Hayej ». */
export function cleNom(s: string): string {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}

/** Mots normalisés d'un nom, dans l'ordre de saisie (contrairement à `cleNom`,
 * qui les trie pour en faire une clé). */
export function motsDe(s: string): string[] {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Deux mots à une correction près : une lettre ajoutée, retirée ou changée.
 * C'est la tolérance juste suffisante pour « Souad » ⇄ « Souhad », et trop
 * étroite pour rapprocher deux prénoms différents. */
export function distanceUn(a: string, b: string): boolean {
  if (a === b) return true;
  const [court, long] = a.length <= b.length ? [a, b] : [b, a];
  if (long.length - court.length > 1) return false;
  let i = 0;
  let j = 0;
  let ecarts = 0;
  while (i < court.length && j < long.length) {
    if (court[i] === long[j]) {
      i++;
      j++;
      continue;
    }
    if (++ecarts > 1) return false;
    // Longueurs égales ⇒ substitution : les deux avancent. Sinon insertion :
    // seul le plus long avance.
    if (court.length === long.length) i++;
    j++;
  }
  return true;
}

/** Recouvrement de deux noms, mot à mot et à une lettre près.
 *
 * Le taux est rapporté au nom le plus COURT : « Ben Salem Hourya » couvre
 * entièrement « Hourya Ben Salem », et « Ben Salem » couvre entièrement les
 * deux — d'où le garde-fou sur le nombre de mots communs dans
 * `meilleurRapprochement`. */
export function couverture(a: string, b: string): { communs: number; taux: number } {
  const A = motsDe(a);
  const B = motsDe(b);
  if (!A.length || !B.length) return { communs: 0, taux: 0 };
  let communs = 0;
  for (const t of A) if (B.includes(t) || B.some((u) => distanceUn(t, u))) communs++;
  return { communs, taux: communs / Math.min(A.length, B.length) };
}

export type PersonneRapprochable = { id: number; nom: string; matricule: string };

/** Meilleure fiche du registre pour un nom saisi en atelier.
 *
 * Trois niveaux, du plus sûr au plus douteux :
 *   1. le matricule est donné et connu          → certain ;
 *   2. le nom normalisé coïncide exactement     → certain ;
 *   3. recouvrement partiel                     → suggestion à vérifier.
 * `sur` ne vaut vrai qu'aux deux premiers niveaux, ou lorsque tous les mots du
 * nom le plus court se retrouvent et qu'ils sont au moins deux — un prénom
 * seul ne suffit jamais à désigner quelqu'un. */
export function meilleurRapprochement(
  nom: string,
  matricule: string,
  personnes: PersonneRapprochable[],
): { personne: PersonneRapprochable | null; score: number; sur: boolean } {
  const mat = matricule.trim();
  if (mat) {
    const parMat = personnes.find((p) => p.matricule.trim() === mat);
    if (parMat) return { personne: parMat, score: 1, sur: true };
  }

  const cle = cleNom(nom);
  if (!cle) return { personne: null, score: 0, sur: false };

  const exacts = personnes.filter((p) => cleNom(p.nom) === cle);
  // Un homonyme au registre : on ne tranche pas à la place de l'humain.
  if (exacts.length === 1) return { personne: exacts[0], score: 1, sur: true };
  if (exacts.length > 1) return { personne: null, score: 0, sur: false };

  let meilleure: PersonneRapprochable | null = null;
  let taux = 0;
  let communs = 0;
  for (const p of personnes) {
    const r = couverture(nom, p.nom);
    if (r.taux > taux || (r.taux === taux && r.communs > communs)) {
      taux = r.taux;
      communs = r.communs;
      meilleure = p;
    }
  }
  const sur = !!meilleure && taux >= 1 && communs >= 2;
  if (meilleure && (sur || taux >= 0.5)) return { personne: meilleure, score: taux, sur };
  return { personne: null, score: 0, sur: false };
}

export type LigneFusion = {
  /** Nom tel qu'il a été saisi en atelier. */
  nom: string;
  /** Nombre de lignes (chaîne + journées) qui portent ce nom. */
  occurrences: number;
  /** Proposition retenue par défaut : seulement si elle est certaine. */
  personnelId: number | null;
  /** Proposition à vérifier, affichée mais pas pré-sélectionnée. */
  suggestionId: number | null;
  suggestionNom: string;
  suggestionMatricule: string;
  score: number;
  sur: boolean;
};

/** Une ligne par nom d'atelier non encore rattaché, avec sa meilleure
 * proposition. Les noms sont dédoublonnés : corriger « Ben Salm Ikram » une
 * fois corrige toutes ses occurrences. */
export function propositionsFusion(
  saisies: { nom: string; matricule?: string; occurrences?: number }[],
  personnes: PersonneRapprochable[],
): LigneFusion[] {
  const par = new Map<string, { nom: string; matricule: string; occurrences: number }>();
  for (const s of saisies) {
    const cle = cleNom(s.nom);
    if (!cle) continue;
    const n = s.occurrences ?? 1;
    const vu = par.get(cle);
    if (vu) {
      vu.occurrences += n;
      if (!vu.matricule && s.matricule) vu.matricule = s.matricule;
    } else par.set(cle, { nom: s.nom, matricule: s.matricule ?? "", occurrences: n });
  }

  return [...par.values()]
    .map(({ nom, matricule, occurrences }) => {
      const b = meilleurRapprochement(nom, matricule, personnes);
      return {
        nom,
        occurrences,
        personnelId: b.sur && b.personne ? b.personne.id : null,
        suggestionId: b.personne?.id ?? null,
        suggestionNom: b.personne?.nom ?? "",
        suggestionMatricule: b.personne?.matricule ?? "",
        score: b.score,
        sur: b.sur,
      };
    })
    .sort((a, b) => b.score - a.score || a.nom.localeCompare(b.nom, "fr"));
}

export type Rapprochement = {
  ouvriereId: number;
  personnelId: number | null;
  /** exact = les noms normalisés coïncident ; aucun = rien trouvé. */
  qualite: "exact" | "aucun";
};

/** Rapproche des ouvrières de chaîne avec le registre, par nom normalisé.
 *
 * Volontairement strict : pas de distance d'édition, pas de correspondance
 * partielle. Relier la mauvaise personne fausse un rendement individuel et
 * c'est invisible ; ne rien relier se voit tout de suite à l'écran. */
export function rapprocherParNom(
  ouvrieres: { id: number; nom: string; personnelId: number | null }[],
  personnes: { id: number; nom: string }[],
): Rapprochement[] {
  const index = new Map<string, number[]>();
  for (const p of personnes) {
    const cle = cleNom(p.nom);
    if (!cle) continue;
    const g = index.get(cle);
    if (g) g.push(p.id);
    else index.set(cle, [p.id]);
  }

  return ouvrieres
    .filter((o) => o.personnelId === null)
    .map((o) => {
      const trouves = index.get(cleNom(o.nom)) ?? [];
      // Un homonyme dans le registre : on refuse de choisir à la place de l'humain.
      return trouves.length === 1
        ? { ouvriereId: o.id, personnelId: trouves[0], qualite: "exact" as const }
        : { ouvriereId: o.id, personnelId: null, qualite: "aucun" as const };
    });
}

/* ─────────── catalogue d'opérations ─────────── */

/** Clé d'une opération : casse, accents et espaces neutralisés — mais l'ordre
 * des mots conservé. Contrairement à un nom de personne, « MONTAGE COL » et
 * « COL MONTAGE » ne désignent pas forcément le même geste : c'est à l'écran
 * des doublons de proposer le rapprochement, pas à la création de le décider. */
export function cleOperation(s: string): string {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Libellés qui ne méritent pas d'entrer au catalogue. */
export const libelleUtilisable = (s: string) => {
  const n = cleOperation(s);
  return n.length > 1 && n !== "—" && n !== "-";
};

/** Regroupe les libellés qui ne diffèrent que par la casse, les accents ou les
 * espaces. Les 509 lignes du client contiennent beaucoup de doublons de frappe. */
export function doublonsOperations(
  operations: { id: number; nom: string; sam: number }[],
): { cle: string; membres: { id: number; nom: string; sam: number }[] }[] {
  const par = new Map<string, { id: number; nom: string; sam: number }[]>();
  for (const o of operations) {
    const cle = cleNom(o.nom);
    if (!cle) continue;
    const g = par.get(cle);
    if (g) g.push(o);
    else par.set(cle, [o]);
  }
  return [...par.entries()]
    .filter(([, m]) => m.length > 1)
    .map(([cle, membres]) => ({ cle, membres }))
    .sort((a, b) => b.membres.length - a.membres.length);
}

/** Suggestions du catalogue pour une saisie en cours. */
export function chercherOperations(
  operations: { id: number; nom: string; sam: number; archive: boolean }[],
  saisie: string,
  max = 12,
) {
  const n = cleNom(saisie);
  const actives = operations.filter((o) => !o.archive);
  if (!n) return actives.slice(0, max);
  return actives
    .filter((o) => cleNom(o.nom).includes(n))
    .sort((a, b) => a.nom.length - b.nom.length)
    .slice(0, max);
}
