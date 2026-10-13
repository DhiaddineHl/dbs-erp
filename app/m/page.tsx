import Link from "next/link";
import { getUser, userRole } from "@/lib/auth/server";
import { redirect } from "next/navigation";
import { getRoleModules } from "@/lib/services/permissions";
import { suiviPaquetsActif } from "@/lib/services/paquets";
import { ENTREPRISE } from "@/lib/entreprise";

/* ACCUEIL TÉLÉPHONE — le point d'entrée de l'atelier.
 *
 * Quatre grosses tuiles, une par poste de travail, et rien d'autre. Chacun
 * arrive ici (c'est l'adresse qu'ouvre l'application installée), appuie une
 * fois, et il est à son écran. Les tuiles qu'un compte n'a pas le droit
 * d'ouvrir ne s'affichent pas : on ne propose pas une porte fermée. */

export const dynamic = "force-dynamic";
export const metadata = { title: "PilotPro — atelier", robots: { index: false, follow: false } };

type Tuile = { href: string; icone: string; titre: string; sous: string; module: string; couleur: string };

const TUILES: Tuile[] = [
  { href: "/m/tissu", icone: "🧵", titre: "Magasin tissu", sous: "Scanner, mesurer, sortir des rouleaux", module: "magtissu", couleur: "bg-sky-600" },
  { href: "/m/paquets", icone: "🏷", titre: "Tournée des paquets", sous: "Relever les liasses finies", module: "paquets", couleur: "bg-violet-600" },
  { href: "/m/gpao", icone: "🏭", titre: "Saisie production", sous: "Pièces par heure, en chaîne", module: "gpao_prod", couleur: "bg-emerald-600" },
  { href: "/m/magasin", icone: "📦", titre: "Produits finis", sous: "Entrées et réceptions façonniers", module: "magasin", couleur: "bg-amber-600" },
];

export default async function AccueilMobile() {
  const user = await getUser();
  if (!user) redirect("/login?suite=%2Fm");
  const role = userRole(user);
  const modules = await getRoleModules(role);
  const autorise = (m: string) => role === "admin" || modules[m] === true;

  const paquetsActif = await suiviPaquetsActif();
  const tuiles = TUILES.filter((t) => autorise(t.module)).filter((t) => t.module !== "paquets" || paquetsActif);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto max-w-md px-4 pb-16 pt-5">
        <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">{ENTREPRISE.nom} · {user.name}</div>
        <h1 className="mb-4 text-3xl font-black">PilotPro</h1>

        {tuiles.length === 0 ? (
          <div className="rounded-2xl bg-white px-4 py-6 text-center text-sm text-slate-600">
            Votre compte n&apos;a accès à aucun écran d&apos;atelier. Ouvrez l&apos;application complète ci-dessous.
          </div>
        ) : (
          <div className="space-y-3">
            {tuiles.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className={`flex items-center gap-4 rounded-2xl ${t.couleur} px-4 py-5 text-white shadow-sm active:brightness-90`}
              >
                <span className="text-4xl leading-none">{t.icone}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xl font-black leading-tight">{t.titre}</span>
                  <span className="block text-sm text-white/80">{t.sous}</span>
                </span>
                <span className="text-2xl text-white/60">›</span>
              </Link>
            ))}
          </div>
        )}

        <Link
          href="/cockpit"
          className="mt-6 block rounded-2xl bg-white px-4 py-4 text-center text-base font-bold text-slate-700 shadow-sm"
        >
          🖥 Application complète
        </Link>
        <p className="mt-3 text-center text-xs text-slate-500">
          Ajoutez cette page à votre écran d&apos;accueil : PilotPro s&apos;ouvrira en plein écran, sans barre
          d&apos;adresse.
        </p>
      </div>
    </div>
  );
}
