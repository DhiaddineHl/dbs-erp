import type { MetadataRoute } from "next";

/* Manifeste de l'application installable.
 *
 * « Ajouter à l'écran d'accueil » depuis le navigateur du téléphone : PilotPro
 * s'ouvre alors en plein écran, avec son icône et sans barre d'adresse. Pour
 * l'atelier, c'est une quinzaine de pixels de hauteur regagnés et surtout
 * plus personne qui tape une adresse à la main.
 *
 * Les raccourcis mènent directement aux écrans conçus pour le téléphone : un
 * appui long sur l'icône les propose. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PilotPro — DBS Fashion",
    short_name: "PilotPro",
    description: "Pilotage de production — de la commande à la facture",
    lang: "fr",
    dir: "ltr",
    start_url: "/m",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#f1f5f9",
    theme_color: "#1d4ed8",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Magasin tissu", short_name: "Tissu", url: "/m/tissu" },
      { name: "Tournée des paquets", short_name: "Paquets", url: "/m/paquets" },
      { name: "Saisie production", short_name: "GPAO", url: "/m/gpao" },
      { name: "Magasin produits finis", short_name: "Magasin", url: "/m/magasin" },
    ],
  };
}
