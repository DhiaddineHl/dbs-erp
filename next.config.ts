import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // xlsx (SheetJS) is a CommonJS lib used only in server actions — keep it out
  // of the bundler so it loads at runtime on the server.
  serverExternalPackages: ["xlsx"],

  /* Adresses d'écrans supprimés depuis longtemps, encore citées par d'anciens
   * liens : elles mènent à l'écran qui fait désormais le travail. (Les écrans
   * retirés récemment ont leur propre page de redirection, comme /br.) */
  async redirects() {
    return [
      { source: "/tissus", destination: "/magtissu", permanent: false },
      { source: "/fournitures", destination: "/magfour", permanent: false },
      { source: "/be", destination: "/dt", permanent: false },
    ];
  },
};

export default nextConfig;
