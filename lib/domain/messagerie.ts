/* Messagerie interne — règles pures (testables sans base). */

export const TEXTE_MAX = 4000;
export const FICHIER_MAX = 10 * 1024 * 1024; // 10 Mo
export const NOM_GROUPE_MAX = 60;

/** Pièces jointes acceptées : photos, PDF, bureautique courante. */
export const MIMES_MESSAGERIE: Record<string, string> = {
  "image/jpeg": "Photo",
  "image/png": "Image",
  "image/webp": "Image",
  "application/pdf": "PDF",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel",
  "application/vnd.ms-excel": "Excel",
  "text/csv": "CSV",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word",
  "application/msword": "Word",
};
export const estImage = (mime: string) => mime.startsWith("image/");

/** Type d'un fichier : celui du navigateur, sinon déduit de l'extension
 * (Windows envoie parfois un .xlsx sans type). */
export function mimeDe(nom: string, type: string): string {
  if (type && MIMES_MESSAGERIE[type]) return type;
  const ext = (nom.split(".").pop() ?? "").toLowerCase();
  const parExt: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    pdf: "application/pdf",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    xls: "application/vnd.ms-excel",
    csv: "text/csv",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    doc: "application/msword",
  };
  return parExt[ext] ?? type ?? "";
}

/** Une seule discussion directe par paire de personnes, quel que soit l'ordre. */
export const cleDirect = (a: string, b: string) => [a, b].sort().join("|");

/** Nettoie un texte de message ; null s'il est vide. */
export function texteMessage(brut: string): string | null {
  const t = (brut ?? "").replace(/\r\n/g, "\n").replace(/\n{4,}/g, "\n\n\n").trim();
  if (!t) return null;
  return t.slice(0, TEXTE_MAX);
}

export type EtatLecture = "envoye" | "lu_partiel" | "lu";

/** ✓ envoyé · ✓✓ gris : lu par une partie du groupe · ✓✓ bleu : lu par tous.
 * `destinataires` = membres actifs autres que l'auteur au moment du calcul. */
export function etatLecture(lecteurs: string[], destinataires: string[]): EtatLecture {
  if (!destinataires.length) return "lu";
  const lus = destinataires.filter((d) => lecteurs.includes(d)).length;
  if (lus === 0) return "envoye";
  return lus === destinataires.length ? "lu" : "lu_partiel";
}

/** Nom affiché d'une conversation : le groupe, ou l'autre personne. */
export function nomConversation(c: { type: string; nom: string }, membres: { userId: string; nom: string }[], moi: string): string {
  if (c.type === "groupe") return c.nom || "Groupe";
  return membres.find((m) => m.userId !== moi)?.nom ?? "Moi";
}

/** Aperçu d'un message pour la liste et l'alerte à l'écran. */
export function apercu(m: { genre: string; texte: string; fichierNom: string; fichierMime: string; commandeLabel: string; supprime: boolean }): string {
  if (m.supprime) return "🚫 Message supprimé";
  if (m.texte) return m.texte.length > 90 ? `${m.texte.slice(0, 90)}…` : m.texte;
  if (m.fichierNom) return `${estImage(m.fichierMime) ? "📷" : "📎"} ${estImage(m.fichierMime) ? "Photo" : m.fichierNom}`;
  if (m.commandeLabel) return `📦 ${m.commandeLabel}`;
  return "";
}

/** Initiales pour l'avatar : « Yomna Ben Ali » → « YB ». */
export function initiales(nom: string): string {
  const mots = (nom ?? "").trim().split(/\s+/).filter(Boolean);
  if (!mots.length) return "?";
  return (mots[0][0] + (mots.length > 1 ? mots[mots.length - 1][0] : "")).toUpperCase();
}

/** Couleur stable par personne (avatar, nom dans un groupe). */
const COULEURS = ["#0e7490", "#7c3aed", "#b45309", "#be123c", "#15803d", "#1d4ed8", "#a21caf", "#c2410c", "#0f766e", "#4d7c0f"];
export function couleurDe(id: string): string {
  let h = 0;
  for (const c of id ?? "") h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COULEURS[h % COULEURS.length];
}

/** « en ligne » si vu dans les 90 dernières secondes. */
export const EN_LIGNE_MS = 90_000;
export function presenceTexte(vuLe: string | null, maintenant: number): string {
  if (!vuLe) return "";
  const d = new Date(vuLe);
  const ecart = maintenant - d.getTime();
  if (ecart < EN_LIGNE_MS) return "en ligne";
  const hm = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const jour = new Date(maintenant);
  const memeJour = d.toDateString() === jour.toDateString();
  const hier = new Date(maintenant - 86_400_000).toDateString() === d.toDateString();
  if (memeJour) return `vu aujourd'hui à ${hm}`;
  if (hier) return `vu hier à ${hm}`;
  return `vu le ${d.toLocaleDateString("fr-FR")} à ${hm}`;
}

/** Libellé de séparateur de jour dans le fil : Aujourd'hui, Hier, ou la date. */
export function libelleJour(iso: string, maintenant: number): string {
  const d = new Date(iso);
  if (d.toDateString() === new Date(maintenant).toDateString()) return "Aujourd'hui";
  if (d.toDateString() === new Date(maintenant - 86_400_000).toDateString()) return "Hier";
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

export const tailleLisible = (o: number) => (o < 1024 ? `${o} o` : o < 1024 * 1024 ? `${Math.round(o / 1024)} Ko` : `${(o / 1024 / 1024).toFixed(1).replace(".", ",")} Mo`);
