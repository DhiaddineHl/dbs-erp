import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // xlsx (SheetJS) is a CommonJS lib used only in server actions — keep it out
  // of the bundler so it loads at runtime on the server.
  serverExternalPackages: ["xlsx"],

  /* Adresses d'écrans supprimés depuis longtemps, encore citées par d'anciens
   * liens : elles mènent à l'écran qui fait désormais le travail. (Les écrans
   * retirés récemment ont leur propre page de redirection, comme /br.) */
  /* En-têtes de sécurité, sur toutes les pages (bureau ET portails) :
   *  · pas d'affichage de l'application dans le cadre d'un autre site
   *    (anti « clickjacking ») ;
   *  · l'adresse de la page — qui contient la clé d'un portail — n'est jamais
   *    transmise aux autres sites (Referrer-Policy) ;
   *  · le navigateur ne devine pas le type d'un fichier ;
   *  · caméra pour ce site seulement (scan des QR), ni micro ni position. */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
        ],
      },
    ];
  },

  async redirects() {
    return [
      { source: "/tissus", destination: "/magtissu", permanent: false },
      { source: "/fournitures", destination: "/magfour", permanent: false },
      { source: "/be", destination: "/dt", permanent: false },
    ];
  },
};

export default nextConfig;
