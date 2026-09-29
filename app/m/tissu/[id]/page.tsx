import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { statutLabel } from "@/lib/domain/rouleau";
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

  // Lot suivi par rouleau : l'ancienne étiquette de lot mène ici ; on renvoie
  // vers les rouleaux (le tissu ne sort plus en bloc).
  if (lot.rouleaux.length) {
    return (
      <div className="min-h-screen bg-slate-100 text-slate-900">
        <div className="mx-auto max-w-md px-4 pb-10 pt-5">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">DBS Fashion · Magasin tissu · {user.name}</div>
          <h1 className="font-mono text-4xl font-black">{lot.identifiant}</h1>
          <div className="text-sm text-slate-700">{[lot.client, lot.reference, lot.couleur].filter(Boolean).join(" · ")}</div>
          <div className="my-3 rounded-xl bg-amber-100 px-3 py-2 text-sm text-amber-900">
            Ce lot est suivi <b>par rouleau</b> : scannez l&apos;étiquette du rouleau pour le sortir.
          </div>
          <div className="divide-y rounded-2xl bg-white text-sm">
            {lot.rouleaux.map((r) => (
              <Link key={r.id} href={`/m/tissu/r/${r.code}`} className="flex items-center justify-between px-4 py-3">
                <span>
                  <span className="font-mono font-bold">{r.code}</span>
                  <span className="block text-xs text-slate-500">
                    {statutLabel(r.statut).label} · {r.emplacement || "non rangé"}
                  </span>
                </span>
                <span className="font-bold tabular-nums">
                  {r.bilan.disponible} {lot.unite}
                </span>
              </Link>
            ))}
          </div>
          <Link href="/m/tissu" className="mt-4 block rounded-2xl bg-slate-900 py-4 text-center text-lg font-bold text-white">
            📷 Scanner un rouleau
          </Link>
        </div>
      </div>
    );
  }

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
