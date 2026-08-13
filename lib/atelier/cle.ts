import { randomBytes } from "node:crypto";

/* Clé opaque du portail de rendement.
 *
 * Vit hors de lib/services/* — qui est marqué "server-only" — parce que le
 * script de seed en a besoin et s'exécute en dehors de Next.
 *
 * 22 caractères d'un alphabet de 32 : ~110 bits, tirés du CSPRNG. Le portail
 * est accessible sans compte, la clé est donc le seul secret ; le matricule,
 * lui, se devine en comptant. */

const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

export function cleAleatoire(longueur = 22): string {
  // Rejet des octets qui déborderaient du dernier multiple complet de 32,
  // sinon les premières lettres de l'alphabet sortiraient plus souvent.
  const limite = 256 - (256 % ALPHABET.length);
  let out = "";
  while (out.length < longueur) {
    for (const o of randomBytes(longueur)) {
      if (o >= limite) continue;
      out += ALPHABET[o % ALPHABET.length];
      if (out.length === longueur) break;
    }
  }
  return out;
}
