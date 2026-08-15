/* Colonnes affichables du carnet de commandes.
 *
 * La liste vit à part parce que deux consommateurs doivent s'accorder dessus :
 * le tableau à l'écran et l'impression de la sélection. Masquer les prix pour
 * l'atelier ne vaudrait rien si la version imprimée les remettait. */

export const COLONNES_COMMANDE = [
  { cle: "of", label: "N° OF" },
  { cle: "modele", label: "Modèle" },
  { cle: "client", label: "Client" },
  { cle: "assigne", label: "Assigné" },
  { cle: "qte", label: "Qté" },
  { cle: "prixVente", label: "P. vente" },
  { cle: "prixFacon", label: "P. façon" },
  { cle: "margeTotale", label: "Marge" },
  { cle: "dateExport", label: "Export" },
  { cle: "retard", label: "Retard" },
  { cle: "av", label: "Avancement" },
  { cle: "statut", label: "Statut" },
] as const;

export type CleColonne = (typeof COLONNES_COMMANDE)[number]["cle"];

/** Ce que « Vue équipe » masque : tout ce qui touche à l'argent. */
export const COLONNES_ARGENT: CleColonne[] = ["prixVente", "prixFacon", "margeTotale"];

/* ─────────── mémoire du réglage ───────────
   Le choix des colonnes appartient au poste, pas au compte : le PC de
   l'atelier masque les prix en permanence, celui du bureau ne les masque
   jamais. C'est donc du localStorage, exposé en store externe pour que React
   le lise sans risquer un écart entre le rendu serveur et le client. */

const STOCKAGE = "dbs_cmd_colonnes_masquees";
const VIDE: ReadonlySet<CleColonne> = new Set();

let cache: ReadonlySet<CleColonne> = VIDE;
let cacheBrut: string | null = null;
const abonnes = new Set<() => void>();

function lire(): ReadonlySet<CleColonne> {
  let brut: string | null = null;
  try {
    brut = window.localStorage.getItem(STOCKAGE);
  } catch {
    return VIDE;
  }
  // getSnapshot doit renvoyer une valeur stable tant que rien ne change,
  // sinon React re-rend en boucle.
  if (brut === cacheBrut) return cache;
  cacheBrut = brut;
  try {
    const connues = new Set<string>(COLONNES_COMMANDE.map((c) => c.cle));
    const arr = JSON.parse(brut || "[]");
    cache = new Set((Array.isArray(arr) ? arr : []).filter((c): c is CleColonne => connues.has(c)));
  } catch {
    cache = VIDE;
  }
  return cache;
}

export const storeColonnes = {
  subscribe(cb: () => void) {
    abonnes.add(cb);
    // Deux onglets ouverts sur le même poste restent d'accord.
    window.addEventListener("storage", cb);
    return () => {
      abonnes.delete(cb);
      window.removeEventListener("storage", cb);
    };
  },
  getSnapshot: lire,
  /** Rendu serveur : aucune colonne masquée, donc aucun écart d'hydratation. */
  getServerSnapshot: () => VIDE,
  ecrire(masquees: ReadonlySet<CleColonne>) {
    try {
      window.localStorage.setItem(STOCKAGE, JSON.stringify([...masquees]));
    } catch {
      /* navigation privée, quota plein : le réglage est un confort, pas une donnée */
    }
    for (const cb of abonnes) cb();
  },
};
