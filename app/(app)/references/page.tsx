import { BookText } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { listReferences } from "@/lib/services/reference";
import { propositionSamDbs } from "@/lib/services/sam";
import { ReferencesClient, type ReferenceLigne } from "./references-client";

/* Bibliothèque des références industrielles — la « garde-robe » (§9).
 *
 * Chaque référence avec ce qui s'y rattache (OF, pièces produites), son SAM DBS
 * retenu et la valeur PROPOSÉE à partir de l'historique. La proposition ne
 * remplace rien : elle éclaire la décision, qui reste humaine. */
export default async function ReferencesPage() {
  const refs = await listReferences();
  const propositions = await Promise.all(refs.map((r) => propositionSamDbs(r.id)));

  const lignes: ReferenceLigne[] = refs.map((r, i) => ({
    id: r.id,
    client: r.client,
    refArticle: r.refArticle,
    modele: r.modele,
    commandes: r.commandes,
    piecesProduites: r.piecesProduites,
    samDbs: r.samDbs,
    samPropose: propositions[i].propose,
    series: propositions[i].series,
    etendue: propositions[i].etendue,
  }));

  return (
    <>
      <PageHeader
        icon={BookText}
        title="Références industrielles"
        description="La mémoire de production : chaque référence, son historique et son SAM DBS retenu"
      />
      <ReferencesClient lignes={lignes} />
    </>
  );
}
