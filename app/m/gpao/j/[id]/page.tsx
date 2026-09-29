import Link from "next/link";
import { notFound } from "next/navigation";
import { accesGpaoPage } from "@/lib/auth/gpao";
import { CLE_SEUIL_ALERTE, SEUIL_ALERTE_DEFAUT } from "@/lib/domain/rendement";
import { listOperations } from "@/lib/services/atelier";
import { getSetting } from "@/lib/services/permissions";
import { journeeTablette } from "@/lib/services/saisie-gpao";
import { SaisieTablette } from "./saisie-tablette";

/* Saisie de production heure par heure, sur la tablette, directement dans la
 * journée GPAO — plus de feuille à recopier au bureau. */

export const dynamic = "force-dynamic";
export const metadata = { title: "Saisie production", robots: { index: false, follow: false } };

export default async function SaisieJourneePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, peutSaisir } = await accesGpaoPage(`/m/gpao/j/${id}`);
  if (!peutSaisir) {
    return (
      <div className="min-h-screen bg-slate-100 p-6 text-slate-900">
        <p className="rounded-xl bg-amber-100 px-4 py-3 text-amber-900">Ce compte n&apos;a pas le module « GPAO Production ».</p>
        <Link href="/m/gpao" className="mt-4 inline-block font-semibold underline">
          ← Retour
        </Link>
      </div>
    );
  }
  const [data, operations, seuilAlerte] = await Promise.all([
    journeeTablette(Number(id)),
    listOperations(),
    getSetting<number>(CLE_SEUIL_ALERTE, SEUIL_ALERTE_DEFAUT),
  ]);
  if (!data) notFound();
  return (
    <SaisieTablette
      utilisateur={user.name}
      initial={data}
      operations={operations.filter((o) => !o.archive).map((o) => ({ nom: o.nom, sam: o.sam }))}
      seuilAlerte={seuilAlerte}
    />
  );
}
