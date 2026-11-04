/* Génère les icônes de l'application (placeholder « PC ») à partir d'un SVG.
 * À relancer — ou remplacer par le vrai logo — quand l'identité visuelle de
 * l'entreprise sera disponible : node scripts/generer-icones.mjs */
import sharp from "sharp";

const svg = (taille, marge) => {
  const r = taille / 2 - marge;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${taille}" height="${taille}">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <circle cx="${taille / 2}" cy="${taille / 2}" r="${r}" fill="#1d4ed8"/>
  <text x="50%" y="50%" dy=".35em" text-anchor="middle" font-family="Arial, Helvetica, sans-serif"
    font-weight="700" font-size="${r * 0.9}" fill="#ffffff">PC</text>
</svg>`);
};

const sorties = [
  ["public/icon-192.png", 192, 8],
  ["public/icon-512.png", 512, 20],
  ["public/icon-maskable-512.png", 512, 90],
  ["public/apple-touch-icon.png", 180, 8],
  ["public/logo.png", 256, 4],
];
for (const [fichier, taille, marge] of sorties) {
  await sharp(svg(taille, marge)).png().toFile(fichier);
  console.log("✓", fichier);
}
