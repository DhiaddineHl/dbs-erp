import Link from "next/link";
import { requireUser } from "@/lib/auth/server";
import { qrSvg } from "@/lib/atelier/qr";
import { BoutonImprimer } from "@/components/shared/bouton-imprimer";
import { basePortail } from "@/lib/services/portail";

/* QR « Saisie production » de l'agent de méthode : scanné avec la tablette,
 * il ouvre la saisie heure par heure des chaînes (connexion demandée la
 * première fois, puis gardée). À imprimer et à coller au bureau des méthodes
 * ou au dos de la tablette. */
export default async function QrSaisiePage() {
  await requireUser();
  const url = `${(await basePortail()).replace(/\/+$/, "")}/m/gpao`;
  const svg = await qrSvg(url, 420);
  return (
    <div className="bg-white text-neutral-900">
      <style>{`@page { size: A4 portrait; margin: 12mm } @media print { .no-print { display: none !important } }`}</style>
      <div className="no-print mb-4 flex items-center gap-2 p-4">
        <BoutonImprimer label="Imprimer le QR" />
        <Link href="/gpao_prod" className="rounded-md border px-3 py-1.5 text-xs font-semibold">
          ← GPAO Production
        </Link>
      </div>
      <div className="mx-auto flex max-w-[170mm] flex-col items-center py-6 text-center">
        <div className="text-sm font-bold tracking-[0.3em]">DBS FASHION · GPAO</div>
        <h1 className="mt-2 text-4xl font-black">Saisie de production</h1>
        <p className="mt-1 text-lg">Agent de méthode — tablette</p>
        <div className="my-6 w-[120mm] [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
        <code className="rounded bg-neutral-100 px-3 py-1 text-sm">{url}</code>
        <ol className="mt-6 max-w-[140mm] list-decimal space-y-1 pl-6 text-left text-[15px]">
          <li>Scannez ce QR avec la tablette (appareil photo).</li>
          <li>Connectez-vous avec votre compte PilotPro (une seule fois).</li>
          <li>Choisissez la chaîne, démarrez la journée si besoin.</li>
          <li>Heure par heure : pièces de chaque ouvrière, puis la sortie de chaîne.</li>
        </ol>
        <p className="mt-4 text-sm text-neutral-500">
          La saisie arrive directement dans GPAO Production : rien à recopier au bureau. Astuce : ajoutez la page à l&apos;écran
          d&apos;accueil de la tablette.
        </p>
      </div>
    </div>
  );
}
