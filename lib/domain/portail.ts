/* PORTAILS EXTÉRIEURS — logique pure (testable sans base).
 *
 * Le portail client montre l'avancement de SES commandes, son tissu et la
 * preuve de ce qu'on en a fait. Deux règles le gouvernent :
 *
 *   1. LISTE FERMÉE : ce module ne reçoit et ne rend que des champs choisis
 *      un par un. Aucun nom de sous-traitant, de chaîne ou d'ouvrière, aucun
 *      prix, aucune marge n'y entre (un test le vérifie).
 *   2. MÊME RYTHME POUR TOUTES LES COMMANDES : un point par jour, les mêmes
 *      étapes, que la commande soit faite chez nous ou ailleurs. Une
 *      commande ne doit pas « bouger à l'heure » quand une autre bouge une
 *      fois par jour : la différence se verrait. */

export type EtatEtape = "fait" | "en_cours" | "a_venir";
export type Etape = { cle: string; label: string; etat: EtatEtape; detail: string; date: string };

/** Ce que l'on sait d'une commande pour tracer sa frise (liste fermée). */
export type FaitsCommandeClient = {
  qte: number;
  /** Tissu : date prévue (planning) et date d'arrivée réelle (lots), "" sinon. */
  tissuPrevu: string;
  tissuRecu: string;
  coupe: number;
  /** Pièces confectionnées (sortie de chaîne ou retours contrôlés). */
  confection: number;
  /** Contrôle qualité : aucun / en cours / final passé. */
  controle: "" | "en_cours" | "fait";
  controleLe: string;
  /** Pièces entrées au magasin produits finis (emballées). */
  emballe: number;
  /** Expédition : date réelle, "" sinon. */
  expedieLe: string;
  exportPrevu: string;
};

const pct = (n: number, d: number) => (d > 0 ? Math.min(100, Math.round((n / d) * 100)) : 0);
const fr = (iso: string) => (/^\d{4}-\d{2}-\d{2}/.test(iso ?? "") ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "");

function etapeQuantite(cle: string, label: string, n: number, qte: number): Etape {
  const etat: EtatEtape = qte > 0 && n >= qte ? "fait" : n > 0 ? "en_cours" : "a_venir";
  return { cle, label, etat, detail: n > 0 ? `${n.toLocaleString("fr-FR")} / ${qte.toLocaleString("fr-FR")} (${pct(n, qte)} %)` : "", date: "" };
}

/** Les six étapes d'une commande, telles que le client les voit. */
export function etapesCommande(f: FaitsCommandeClient): Etape[] {
  const tissu: Etape = f.tissuRecu
    ? { cle: "tissu", label: "Tissu reçu", etat: "fait", detail: `reçu le ${fr(f.tissuRecu)}`, date: f.tissuRecu }
    : { cle: "tissu", label: "Tissu reçu", etat: "a_venir", detail: f.tissuPrevu ? `attendu le ${fr(f.tissuPrevu)}` : "", date: "" };
  const controle: Etape =
    f.controle === "fait"
      ? { cle: "controle", label: "Contrôle qualité", etat: "fait", detail: f.controleLe ? `contrôle final le ${fr(f.controleLe)}` : "contrôle final passé", date: f.controleLe }
      : { cle: "controle", label: "Contrôle qualité", etat: f.controle === "en_cours" ? "en_cours" : "a_venir", detail: f.controle === "en_cours" ? "contrôles en cours" : "", date: "" };
  const expedition: Etape = f.expedieLe
    ? { cle: "expedition", label: "Expédition", etat: "fait", detail: `expédiée le ${fr(f.expedieLe)}`, date: f.expedieLe }
    : { cle: "expedition", label: "Expédition", etat: "a_venir", detail: f.exportPrevu ? `prévue le ${fr(f.exportPrevu)}` : "", date: "" };
  return [
    tissu,
    etapeQuantite("coupe", "Coupe", f.coupe, f.qte),
    etapeQuantite("confection", "Confection", f.confection, f.qte),
    controle,
    etapeQuantite("emballage", "Emballage", f.emballe, f.qte),
    expedition,
  ];
}

export type FeuClient = { ton: "vert" | "orange" | "rouge" | "bleu"; label: string };

/** Dans les temps / à surveiller / en retard — vu du client.
 * `avancement` = part confectionnée (0..100). */
export function feuClient(v: { exportPrevu: string; expedieLe: string; avancement: number; aujourdhui: string }): FeuClient {
  if (v.expedieLe) return { ton: "bleu", label: "Expédiée" };
  if (!/^\d{4}-\d{2}-\d{2}/.test(v.exportPrevu ?? "")) return { ton: "vert", label: "En cours" };
  const jours = Math.round((Date.parse(v.exportPrevu.slice(0, 10)) - Date.parse(v.aujourdhui.slice(0, 10))) / 86_400_000);
  if (jours < 0) return { ton: "rouge", label: "En retard" };
  // Moins de 10 jours et moins des trois quarts faits : à surveiller.
  if (jours <= 10 && v.avancement < 75) return { ton: "orange", label: "À surveiller" };
  return { ton: "vert", label: "Dans les temps" };
}

/* ─────────── suivi des colis ─────────── */

/** Page de suivi du transporteur pour un numéro, ou "" si inconnu. Le lien
 * suffit : aucun abonnement ni clé n'est nécessaire. */
export function urlSuivi(transporteur: string, numero: string): string {
  const n = (numero ?? "").trim().replace(/\s+/g, "");
  if (!n) return "";
  const t = (transporteur ?? "").trim().toLowerCase();
  const e = encodeURIComponent(n);
  if (!t || t.includes("dhl")) return `https://www.dhl.com/fr-fr/home/tracking/tracking-express.html?submit=1&tracking-id=${e}`;
  if (t.includes("ups")) return `https://www.ups.com/track?loc=fr_FR&tracknum=${e}`;
  if (t.includes("fedex") || t.includes("tnt")) return `https://www.fedex.com/fedextrack/?trknbr=${e}`;
  if (t.includes("aramex")) return `https://www.aramex.com/fr/track/results?ShipmentNumber=${e}`;
  if (t.includes("chronopost")) return `https://www.chronopost.fr/tracking-no-cms/suivi-page?listeNumerosLT=${e}`;
  return "";
}

/* ─────────── PIN ─────────── */

export const PIN_LONGUEUR = 6;
export const PIN_ESSAIS = 5;
export const PIN_BLOCAGE_MIN = 15;
/** Un téléphone qui a donné le bon PIN est retenu 30 jours. */
export const PIN_MEMOIRE_JOURS = 30;

export const pinValide = (pin: string) => new RegExp(`^\\d{${PIN_LONGUEUR}}$`).test((pin ?? "").trim());

/** Après un échec : nombre d'échecs et, au-delà du seuil, la fin du blocage. */
export function apresEchec(echecs: number, maintenant: Date): { echecs: number; bloqueJusqua: Date | null } {
  const n = echecs + 1;
  if (n >= PIN_ESSAIS) return { echecs: 0, bloqueJusqua: new Date(maintenant.getTime() + PIN_BLOCAGE_MIN * 60_000) };
  return { echecs: n, bloqueJusqua: null };
}

export function refusBlocage(bloqueJusqua: Date | null, maintenant: Date): string | null {
  if (!bloqueJusqua || bloqueJusqua.getTime() <= maintenant.getTime()) return null;
  const min = Math.ceil((bloqueJusqua.getTime() - maintenant.getTime()) / 60_000);
  return `Trop d'essais : réessayez dans ${min} minute${min > 1 ? "s" : ""}.`;
}

/* ─────────── décisions en un clic ─────────── */

export const DECISIONS = {
  complement: "J'envoie le tissu manquant",
  rendre: "Rendez-moi ce reste de tissu",
  garder: "Gardez ce reste pour une prochaine commande",
} as const;
export type Decision = keyof typeof DECISIONS;
export const estDecision = (v: string): v is Decision => v in DECISIONS;
