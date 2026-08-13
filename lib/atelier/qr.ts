import "server-only";
import QRCode from "qrcode";

/* Génération des QR côté serveur.
 *
 * Le SVG est inséré directement dans la page : pas de requête réseau, pas de
 * script client, et l'impression fonctionne hors ligne — l'atelier n'a pas
 * toujours de connexion. */

/** SVG d'un QR, sans en-tête XML ni marge superflue. */
export async function qrSvg(texte: string, taille = 128): Promise<string> {
  const svg = await QRCode.toString(texte, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 1,
    width: taille,
  });
  // `qrcode` émet un doctype et une déclaration XML ; on ne garde que le <svg>.
  const i = svg.indexOf("<svg");
  return i >= 0 ? svg.slice(i) : svg;
}

/** URL absolue du portail. Priorité à la valeur enregistrée par
 * l'administrateur : en atelier, les téléphones ne sont pas sur le même réseau
 * que le serveur, et l'origine vue par Next n'est pas celle qu'ils atteignent. */
export function urlPortail(base: string, cle: string): string {
  const racine = (base || "").trim().replace(/\/+$/, "");
  return `${racine}/portail/${cle}`;
}

export function urlDirection(base: string, jeton: string): string {
  const racine = (base || "").trim().replace(/\/+$/, "");
  return `${racine}/portail/direction?t=${encodeURIComponent(jeton)}`;
}
