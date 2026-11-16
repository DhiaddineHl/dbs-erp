import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { requireUser, userRole } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { client, faconnier, portailAcces } from "@/lib/db/schema";
import { qrSvg } from "@/lib/atelier/qr";
import { basePortail } from "@/lib/services/portail";
import { BoutonImprimer } from "@/components/shared/bouton-imprimer";

/* Carte imprimable d'un accès : le QR, le nom de la personne et la marche à
 * suivre. Le PIN n'y figure JAMAIS (il se donne à part). */
export default async function CartePortail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!["admin", "resp"].includes(userRole(user))) notFound();
  const { id } = await params;
  const [a] = await db.select().from(portailAcces).where(eq(portailAcces.id, Number(id)));
  if (!a) notFound();
  const [chez] =
    a.type === "client"
      ? await db.select({ nom: client.nom }).from(client).where(eq(client.id, a.clientId ?? -1))
      : await db.select({ nom: faconnier.nom }).from(faconnier).where(eq(faconnier.id, a.faconnierId ?? -1));
  const url = `${(await basePortail()).replace(/\/+$/, "")}/portail/${a.type === "client" ? "c" : "s"}/${a.cle}`;
  const svg = await qrSvg(url, 260);
  return (
    <div className="bg-white p-6 text-neutral-900">
      <style>{`@media print { .no-print { display: none !important } @page { size: A5 portrait; margin: 12mm } }`}</style>
      <div className="no-print mb-4">
        <BoutonImprimer label="Imprimer la carte" />
      </div>
      <div className="mx-auto max-w-sm rounded-2xl border-2 border-neutral-900 p-6 text-center">
        <div className="text-[11px] font-bold uppercase tracking-[0.25em]">DBS Fashion</div>
        <div className="mt-1 text-xl font-black">{a.type === "client" ? "Suivi de vos commandes" : "Espace atelier partenaire"}</div>
        <div className="text-sm">
          {chez?.nom ?? ""} · {a.nom}
        </div>
        <div className="mx-auto mt-4 w-60" dangerouslySetInnerHTML={{ __html: svg }} />
        <p className="mt-4 text-left text-[12px] leading-snug">
          1. Scannez ce code avec l&apos;appareil photo de votre téléphone.
          <br />
          2. {a.pinHash ? "Tapez le code PIN à 6 chiffres qui vous a été donné (une seule fois par téléphone, pour 30 jours)." : "C'est tout : la page s'ouvre directement."}
          <br />
          3. Ajoutez la page à votre écran d&apos;accueil pour la retrouver.
        </p>
        <p className="mt-3 text-[10px] text-neutral-500">Ce code est personnel : ne le partagez pas. En cas de perte, prévenez-nous, il sera remplacé.</p>
      </div>
    </div>
  );
}
