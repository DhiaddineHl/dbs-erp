import GpaoApp from "./gpao-app";
import type { GpaoState, Journee } from "./store";
import { getChaines, getJournees, getModeles } from "@/lib/services/gpao";
import { listClients } from "@/lib/services/modules";

/* Shared GPAO state lives in Postgres now — load it server-side so every user
 * sees the same journées, chaînes and modèles. */
export default async function GpaoProdPage() {
  const [modeles, chaines, journees, clients] = await Promise.all([
    getModeles(),
    getChaines(),
    getJournees(),
    listClients(),
  ]);

  const state: GpaoState = {
    modeles,
    chaines: chaines.map((c) => ({
      id: c.id,
      nom: c.nom,
      chef: c.chef,
      ouvrieres: c.ouvrieres.map((o) => ({ id: o.id, nom: o.nom, poste: o.poste, sam: o.sam })),
    })),
    journees: journees.map((j): Journee => ({ ...j, objManuel: j.objManuel ?? undefined })),
    nextOuvId: 0,
    tvDayId: null,
  };

  return <GpaoApp initialState={state} clients={clients.map((c) => c.nom)} />;
}
