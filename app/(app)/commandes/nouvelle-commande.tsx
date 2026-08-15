"use client";

import { EntityFormDialog, type ReglesFormulaire } from "@/components/shared/entity-form-dialog";
import { COMMANDE_FIELDS } from "@/lib/modules/forms";
import { apercuCommande } from "@/lib/domain/commande";
import { createCommande } from "@/lib/actions/commandes";

const nb = new Intl.NumberFormat("fr-FR");
const eur = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const dec = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Choix = { value: string; label: string };

/* Le formulaire de commande porte deux règles que le dialogue générique ne
 * peut pas connaître, et qui doivent agir pendant la frappe :
 *
 *  · production interne (chaîne, « DBS », ou aucun façonnier) → le prix façon
 *    suit le prix de vente. DBS n'achète pas sa propre façon ; lui prêter une
 *    marge de sous-traitance gonflerait la marge globale d'un montant fictif ;
 *  · CA, marge et taux s'affichent au fur et à mesure. Les découvrir après
 *    l'enregistrement, c'est décider d'un prix sans savoir ce qu'il donne. */
const REGLES: ReglesFormulaire = {
  ajuster: (v) => {
    const a = apercuCommande(v);
    return a.interne ? { ...v, prixFacon: v.prixVente ?? "" } : v;
  },

  verrous: (v): Record<string, string> =>
    apercuCommande(v).interne
      ? { prixFacon: "Production interne — le prix façon suit le prix de vente (marge 0)" }
      : {},

  apercu: (v) => {
    const a = apercuCommande(v);
    if (a.vide && a.qte === 0) return null;
    const signe = a.margeUnitaire >= 0 ? "text-success-foreground" : "text-[var(--danger-d)]";
    return (
      <div className="rounded-lg bg-accent/40 px-3 py-2 text-xs">
        <span className="mr-3">
          📊 <b>{nb.format(a.qte)}</b> pcs
        </span>
        <span className="mr-3">
          Marge unit. <b className={signe}>{dec.format(a.margeUnitaire)} €</b>
        </span>
        <span className="mr-3">
          Marge totale <b className={signe}>{eur.format(a.margeTotale)} €</b>
        </span>
        <span className="mr-3">
          CA <b>{eur.format(a.ca)} €</b>
        </span>
        <span>
          Taux <b className={signe}>{a.tauxPct}%</b>
        </span>
        {a.interne && (
          <div className="mt-1 text-[10.5px] text-muted-foreground">
            🏭 Production interne : marge nulle par convention. La rentabilité de l&apos;interne se lit au rendement
            dans GPAO, pas sur cette ligne.
          </div>
        )}
        {a.qte === 0 && (
          <div className="mt-1 text-[10.5px] text-muted-foreground">
            ⚠ Aucune quantité saisie — renseignez la grille de tailles ou la quantité globale.
          </div>
        )}
      </div>
    );
  },
};

export function NouvelleCommande({
  clients,
  faconniers,
  chaines,
}: {
  clients: Choix[];
  faconniers: Choix[];
  chaines: Choix[];
}) {
  return (
    <EntityFormDialog
      triggerLabel="Nouvelle commande"
      title="Nouvelle commande"
      fields={COMMANDE_FIELDS}
      dynamicOptions={{ client: clients, faconnier: faconniers, chaineId: chaines }}
      regles={REGLES}
      action={createCommande}
      successMessage="Commande créée"
    />
  );
}
