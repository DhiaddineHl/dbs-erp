import { notFound, redirect } from "next/navigation";
import { getUser, userRole } from "@/lib/auth/server";
import { peutModifier } from "@/lib/domain/feux";
import { getRoleModules } from "@/lib/services/permissions";
import { listLots } from "@/lib/services/tissu";
import { SortieLot } from "./sortie-lot";

/* Fiche mobile d'un lot de tissu — ouverte en scannant l'étiquette QR du
 * rouleau. Sert à la sortie vers la coupe : choisir la commande, vérifier le
 * métrage, valider. Compte PilotPro obligatoire, droits du magasin tissu. */

export const dynamic = "force-dynamic";
export const metadata = { title: "Lot tissu — sortie", robots: { index: false, follow: false } };

export default async function LotMobilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getUser();
  if (!user) redirect(`/login?suite=${encodeURIComponent(`/m/tissu/${id}`)}`);
  const role = userRole(user);
  const modules = await getRoleModules(role);
  const peutSaisir = peutModifier("tissu", role) || modules.magtissu === true;
  const lot = (await listLots()).find((l) => l.id === Number(id));
  if (!lot) notFound();

  // Commandes servies par ce lot : réservé, déjà sorti, reste à sortir.
  const parCommande = new Map<number, { id: number; label: string; affecte: number; sorti: number }>();
  for (const a of lot.affectations) {
    if (a.commandeId == null) continue;
    const e = parCommande.get(a.commandeId) ?? { id: a.commandeId, label: a.commandeLabel, affecte: 0, sorti: 0 };
    e.affecte += a.quantite;
    parCommande.set(a.commandeId, e);
  }
  for (const m of lot.mouvements) {
    if (m.commandeId == null) continue;
    const e = parCommande.get(m.commandeId);
    if (!e) continue;
    if (m.sens === "sortie") e.sorti += m.quantite;
    else if (m.sens === "retour") e.sorti -= m.quantite;
  }

  return (
    <SortieLot
      utilisateur={user.name}
      peutSaisir={peutSaisir}
      lot={{
        id: lot.id,
        identifiant: lot.identifiant,
        client: lot.client,
        reference: lot.reference,
        couleur: lot.couleur,
        laize: lot.laize,
        unite: lot.unite,
        controle: lot.controle,
        disponible: lot.bilan.disponible,
        recu: lot.bilan.recu,
        consomme: lot.bilan.consomme,
      }}
      commandes={[...parCommande.values()].map((c) => ({ ...c, reste: Math.max(0, Math.round((c.affecte - c.sorti) * 100) / 100) }))}
      derniers={lot.mouvements.filter((m) => m.sens === "sortie").slice(0, 5).map((m) => ({ id: m.id, quantite: m.quantite, label: m.commandeLabel, date: m.date, par: m.createdBy }))}
    />
  );
}
