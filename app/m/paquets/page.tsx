import Link from "next/link";
import { accesGpaoPage } from "@/lib/auth/gpao";
import { userRole } from "@/lib/auth/server";
import { paquetParCode, peutRelever, suiviPaquetsActif } from "@/lib/services/paquets";
import { TourneePaquets } from "./tournee";
import { ENTREPRISE } from "@/lib/entreprise";

/* LA TOURNÉE DES PAQUETS, sur le téléphone de la responsable.
 *
 * Elle marche le long de la chaîne, scanne les liasses finies, et c'est
 * tout : bip, vert, suivante. Rien n'est obligatoire — les jours sans
 * tournée laissent simplement des cases grises dans la grille. */

export const dynamic = "force-dynamic";
export const metadata = { title: "Tournée des paquets", robots: { index: false, follow: false } };

export default async function TourneePage({ searchParams }: { searchParams: Promise<{ code?: string; liasse?: string }> }) {
  const sp = await searchParams;
  const suite = `/m/paquets${sp.code ? `?code=${sp.code}${sp.liasse ? `&liasse=${sp.liasse}` : ""}` : ""}`;
  const { user } = await accesGpaoPage(suite);
  const [actif, autorise, paquetInitial] = await Promise.all([
    suiviPaquetsActif(),
    peutRelever(userRole(user)),
    // Le QR mène ici avec un code : on l'ouvre côté serveur, sans attente.
    sp.code ? paquetParCode(sp.code.toUpperCase()) : Promise.resolve(null),
  ]);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto max-w-md px-4 pb-16 pt-4">
        <Link href="/paquets" className="mb-2 inline-block text-sm font-semibold text-slate-600">
          ← Suivi paquets
        </Link>
        <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
          {ENTREPRISE.nom} · Tournée des paquets · {user.name}
        </div>
        <h1 className="mb-3 text-3xl font-black">Tournée</h1>
        {!actif ? (
          <div className="rounded-xl bg-white px-4 py-6 text-center text-sm text-slate-600">
            Le suivi par paquets n&apos;est pas activé (écran Suivi paquets → Réglages).
          </div>
        ) : !autorise ? (
          <div className="rounded-xl bg-white px-4 py-6 text-center text-sm text-slate-600">
            Votre rôle n&apos;est pas autorisé à relever les paquets. Demandez l&apos;accès dans
            l&apos;écran Suivi paquets → Réglages.
          </div>
        ) : (
          <TourneePaquets paquetInitial={paquetInitial} liasseInitiale={Number(sp.liasse) || null} />
        )}
      </div>
    </div>
  );
}
