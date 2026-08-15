import { notFound } from "next/navigation";
import { getChaines, getJournees, getModeles } from "@/lib/services/gpao";
import { getSetting } from "@/lib/services/permissions";
import type { GpaoState, Journee } from "../../store";
import { SEUIL_ALERTE_DEFAUT, TV_ROTATION_DEFAUT } from "../../store";
import { TvPage } from "./tv-page";

/* Écran d'atelier, sur sa propre adresse.
 *
 * L'application d'origine dupliquait le DOM dans une fenêtre `window.open` et
 * la rafraîchissait à la main toutes les deux secondes. Une vraie page fait
 * mieux : on la pose sur le second écran, elle se recharge seule et le poste
 * de saisie reste libre. */
export default async function TvJourPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const jourId = Number(id);
  if (!Number.isFinite(jourId)) notFound();

  const [modeles, chaines, journees, tvRotSec, seuilAlerte] = await Promise.all([
    getModeles(),
    getChaines(),
    getJournees(),
    getSetting<number>("gpao.tvRotSec", TV_ROTATION_DEFAUT),
    getSetting<number>("gpao.seuilAlerte", SEUIL_ALERTE_DEFAUT),
  ]);

  const journee = journees.find((j) => j.id === jourId);
  if (!journee) notFound();

  const state: GpaoState = {
    modeles,
    chaines: chaines.map((c) => ({
      id: c.id,
      nom: c.nom,
      chef: c.chef,
      ouvrieres: c.ouvrieres.map((o) => ({ id: o.id, nom: o.nom, poste: o.poste, sam: o.sam, personnelId: o.personnelId })),
    })),
    journees: journees.map((j): Journee => ({ ...j, objManuel: j.objManuel ?? undefined })),
    personnes: [],
    operations: [],
    reglages: { seuilAlerte, tvRotSec },
    nextOuvId: 0,
    tvDayId: jourId,
  };

  return <TvPage state={state} journeeId={jourId} />;
}
