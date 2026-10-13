import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { VeilleVersion } from "@/components/shared/veille-version";
import { versionApp } from "@/lib/version";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PilotPro · GPAO Confection Textile",
  description: "Pilotage temps réel — de la commande à la facture",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "PilotPro", statusBarStyle: "black-translucent" },
  icons: { icon: "/icon-192.png", apple: "/apple-touch-icon.png" },
};

/* Téléphone : la barre de navigation prend la couleur de l'application, et
 * `viewportFit` laisse la page passer sous l'encoche une fois installée.
 * Le zoom reste autorisé — l'atelier en a besoin pour lire un petit chiffre. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1d4ed8",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full">
        {children}
        <Toaster richColors position="top-right" />
        <VeilleVersion version={versionApp()} />
      </body>
    </html>
  );
}
