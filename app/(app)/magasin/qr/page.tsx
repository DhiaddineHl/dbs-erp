import Link from "next/link";
import { requireUser } from "@/lib/auth/server";
import { qrSvg } from "@/lib/atelier/qr";
import { BoutonImprimer } from "@/components/shared/bouton-imprimer";
import { basePortail } from "@/lib/services/portail";

/* Affiche à imprimer et à coller au magasin : le QR ouvre la saisie mobile
 * des réceptions (/m/magasin). Le QR n'ouvre qu'une page : il faut ensuite
 * un compte PilotPro autorisé — le téléphone reste connecté après la première
 * fois. L'adresse suit le réglage « Adresse du portail » de l'écran QR rendement. */
export default async function QrMagasinPage() {
  await requireUser();
  const base = await basePortail();
  const url = `${base.replace(/\/+$/, "")}/m/magasin`;
  const svg = await qrSvg(url, 320);

  return (
    <div className="mx-auto max-w-2xl bg-white p-8 text-neutral-900 print:p-0">
      <style>{`@media print { .no-print { display: none !important } @page { margin: 14mm; size: A4 portrait } }`}</style>
      <div className="no-print mb-6 flex flex-wrap items-center gap-2">
        <BoutonImprimer label="Imprimer l'affiche" />
        <Link href="/magasin" className="rounded-md border px-3 py-1.5 text-xs font-semibold">
          ← Retour au magasin
        </Link>
        <Link href="/m/magasin" className="rounded-md border px-3 py-1.5 text-xs font-semibold">
          Ouvrir la saisie mobile
        </Link>
      </div>

      <div className="rounded-3xl border-4 border-neutral-900 p-8 text-center">
        <div className="text-sm font-bold uppercase tracking-[0.25em] text-neutral-500">DBS Fashion · Magasin produits finis</div>
        <h1 className="mt-2 text-4xl font-black tracking-tight">Saisir une réception</h1>
        <p className="mt-1 text-base text-neutral-600">Production interne et façonniers — depuis votre téléphone</p>

        <div className="mx-auto mt-6 size-[300px] [&_svg]:size-full" dangerouslySetInnerHTML={{ __html: svg }} />

        <ol className="mx-auto mt-6 max-w-md space-y-2 text-left text-lg">
          <li>
            <b>1.</b>{" "}Scannez le QR avec l&apos;appareil photo du téléphone.
          </li>
          <li>
            <b>2.</b>{" "}Connectez-vous avec votre compte PilotPro <span className="text-neutral-500">(la première fois seulement)</span>.
          </li>
          <li>
            <b>3.</b>{" "}Touchez la commande, vérifiez la quantité, touchez <b>✔ Valider</b>.
          </li>
        </ol>
        <div className="mt-6 break-all text-xs text-neutral-400">{url}</div>
      </div>

      <div className="no-print mt-4 text-xs text-neutral-500">
        Si le QR n&apos;ouvre pas la page depuis un téléphone, réglez l&apos;adresse publique du serveur dans l&apos;écran
        QR rendement (panneau « Adresse du portail »), puis réimprimez cette affiche.
      </div>
    </div>
  );
}
