import GpaoApp from "./gpao-app";
import type { GpaoState, Journee } from "./store";
import { getChaines, getJournees, getModeles, listCommandesInternes } from "@/lib/services/gpao";
import { listClients } from "@/lib/services/commandes";
import { listOperations, listPersonnel } from "@/lib/services/atelier";
import { listFusions } from "@/lib/services/identite-ouvrieres";
import { getSetting } from "@/lib/services/permissions";
import { estDisponible } from "@/lib/domain/atelier";
import { SEUIL_ALERTE_DEFAUT, TV_ROTATION_DEFAUT } from "./store";

/* Shared GPAO state lives in Postgres now — load it server-side so every user
 * sees the same journées, chaînes and modèles. */
export default async function GpaoProdPage() {
  const [modeles, chaines, journees, clients, personnes, operations, seuilAlerte, tvRotSec, commandesInternes, fusions] =
    await Promise.all([
      getModeles(),
      getChaines(),
      getJournees(),
      listClients(),
      listPersonnel(),
      listOperations(),
      getSetting<number>("gpao.seuilAlerte", SEUIL_ALERTE_DEFAUT),
      getSetting<number>("gpao.tvRotSec", TV_ROTATION_DEFAUT),
      listCommandesInternes(),
      listFusions(),
    ]);

  const state: GpaoState = {
    modeles,
    chaines: chaines.map((c) => ({
      id: c.id,
      nom: c.nom,
      chef: c.chef,
      effectif: c.effectif,
      ouvrieres: c.ouvrieres.map((o) => ({
        id: o.id,
        nom: o.nom,
        poste: o.poste,
        sam: o.sam,
        personnelId: o.personnelId,
      })),
    })),
    journees: journees.map((j): Journee => ({ ...j, objManuel: j.objManuel ?? undefined })),
    /* Le registre sert à proposer les noms connus et à rattacher une ouvrière
     * du jour à sa fiche — c'est ce rattachement qui tient l'historique.
     * TOUTES les fiches comptent pour reconnaître une personne (sinon une
     * ouvrière sortie verrait son passé éclaté) ; une personne sortie n'est
     * simplement plus proposée à la saisie. */
    personnes: personnes.map((p) => ({ id: p.id, matricule: p.matricule, nom: p.nom, fonction: p.fonction, sortie: !estDisponible(p.statut) })),
    fusions,
    /* Le catalogue propose le libellé et pré-remplit son temps standard. */
    operations: operations
      .filter((o) => !o.archive)
      .map((o) => ({ id: o.id, nom: o.nom, sam: o.sam })),
    reglages: { seuilAlerte, tvRotSec },
    nextOuvId: 0,
    tvDayId: null,
  };

  return <GpaoApp initialState={state} clients={clients.map((c) => c.nom)} commandesInternes={commandesInternes} />;
}
