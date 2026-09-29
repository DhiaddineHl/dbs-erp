import { accesGpaoPage } from "@/lib/auth/gpao";
import { sommeSortie } from "@/lib/services/gpao";
import { accueilTablette } from "@/lib/services/saisie-gpao";
import { AccueilGpao } from "./accueil-gpao";

/* Tablette de l'agent de méthode — accueil. Ouverte en scannant le QR
 * « Saisie production » : il choisit sa chaîne, démarre la journée si elle
 * n'existe pas, puis saisit heure par heure directement dans la GPAO. */

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Saisie production — tablette",
  robots: { index: false, follow: false },
};

const aujourdhui = () => new Date().toISOString().slice(0, 10);

export default async function TabletteGpaoPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date: d } = await searchParams;
  const date = d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : aujourdhui();
  const { user, peutSaisir } = await accesGpaoPage(
    `/m/gpao${d ? `?date=${d}` : ""}`,
  );
  const { chaines, modeles, modelesTous } = await accueilTablette(date);
  const nomModele = new Map(modelesTous.map((m) => [m.id, m]));

  return (
    <AccueilGpao
      utilisateur={user.name}
      peutSaisir={peutSaisir}
      date={date}
      aujourdhui={aujourdhui()}
      modeles={modeles.map((m) => ({
        id: m.id,
        label: [m.nom, m.ref, m.client].filter(Boolean).join(" · "),
      }))}
      chaines={chaines
        // Chaînes recréées par la reprise de l'historique : plus en activité.
        .filter(
          (c) =>
            !/^cha[iî]ne archiv[ée]e/i.test(c.nom) || c.journees.length > 0,
        )
        .map((c) => ({
          id: c.id,
          nom: c.nom,
          chef: c.chef,
          effectif: c.effectif,
          nbOuvrieres: c.nbOuvrieres,
          dernier: c.dernier,
          journees: c.journees.map((j) => {
            // Heures dont la sortie de chaîne est saisie : l'avancement du relevé.
            const heuresFaites = j.cols.filter((col) => typeof j.sortie?.[col] === "number").length;
            const m = nomModele.get(j.modeleId);
            return {
              id: j.id,
              modele: m ? [m.nom, m.ref].filter(Boolean).join(" · ") : "?",
              nbHeures: j.nbHeures,
              cols: j.cols.length,
              heuresFaites,
              sortie: sommeSortie(j.sortie),
              cloture: j.cloture,
            };
          }),
        }))}
    />
  );
}
