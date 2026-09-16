"use client";

import { useMemo } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EntityFormDialog, type ReglesFormulaire } from "@/components/shared/entity-form-dialog";
import { COMMANDE_FIELDS, COMMANDE_EDIT_FIELDS } from "@/lib/modules/forms";
import { apercuCommande, erreurRepartition, montantSaisi, quantiteSaisie } from "@/lib/domain/commande";
import { createCommande, updateCommandeRow } from "@/lib/actions/commandes";
import type { CommandeRow } from "@/lib/services/commandes";
import { EditeurSousCommandes, lireBrouillons, totalBrouillons } from "./sous-commandes";

const nb = new Intl.NumberFormat("fr-FR");
const eur = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const dec = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Choix = { value: string; label: string };

/* Le formulaire de commande porte trois règles que le dialogue générique ne
 * peut pas connaître, et qui doivent agir pendant la frappe :
 *
 *  · production interne (chaîne, « DBS », ou aucun façonnier) → le prix façon
 *    suit le prix de vente. DBS n'achète pas sa propre façon ; lui prêter une
 *    marge de sous-traitance gonflerait la marge globale d'un montant fictif ;
 *  · CA, marge et taux s'affichent au fur et à mesure. Les découvrir après
 *    l'enregistrement, c'est décider d'un prix sans savoir ce qu'il donne ;
 *  · la commande peut être découpée en sous-commandes dans la foulée, et la
 *    somme des parts ne peut pas dépasser la quantité totale. */
function construireRegles(faconniers: Choix[], chaines: Choix[]): ReglesFormulaire {
  return {
    ajuster: (v) => {
      const a = apercuCommande(v);
      return a.interne ? { ...v, prixFacon: v.prixVente ?? "" } : v;
    },

    verrous: (v): Record<string, string> =>
      apercuCommande(v).interne
        ? { prixFacon: "Production interne — le prix façon suit le prix de vente (marge 0)" }
        : {},

    supplement: (v, set) => (
      <EditeurSousCommandes
        qteTotale={quantiteSaisie(v.tailles, v.qte)}
        modele={v.modele ?? ""}
        faconniers={faconniers}
        chaines={chaines}
        valeur={v.sousCommandes ?? "[]"}
        onChange={(json) => set("sousCommandes", json)}
      />
    ),

    /* Le refus est ici en plus du serveur : laisser partir une répartition
     * impossible pour la voir refusée après coup ferait ressaisir toute la
     * commande. */
    valider: (v) =>
      erreurRepartition(
        quantiteSaisie(v.tailles, v.qte),
        lireBrouillons(v.sousCommandes).map((d) => ({ qte: Math.max(0, Math.round(montantSaisi(d.qte) ?? 0)) })),
      ),

    apercu: (v) => {
      const a = apercuCommande(v);
      const sous = lireBrouillons(v.sousCommandes);
      const reparti = totalBrouillons(sous);
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
          {sous.length > 0 && (
            <div className="mt-1 text-[10.5px] text-muted-foreground">
              🧩 {sous.length} sous-commande(s) — {nb.format(reparti)} pcs réparties,{" "}
              {nb.format(a.qte - reparti)} produites par la commande mère. Les prix et marges ci-dessus sont ceux de
              la mère ; chaque part porte les siens.
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
}

export function NouvelleCommande({
  clients,
  faconniers,
  chaines,
}: {
  clients: Choix[];
  faconniers: Choix[];
  chaines: Choix[];
}) {
  const regles = useMemo(() => construireRegles(faconniers, chaines), [faconniers, chaines]);

  return (
    <EntityFormDialog
      triggerLabel="Nouvelle commande"
      title="Nouvelle commande"
      fields={COMMANDE_FIELDS}
      dynamicOptions={{ client: clients, faconnier: faconniers, chaineId: chaines }}
      regles={regles}
      action={createCommande}
      successMessage="Commande créée"
    />
  );
}

/* ─────────── Modification d'une commande existante ───────────
 *
 * Même formulaire que la création — sans la grille de tailles (voir
 * COMMANDE_EDIT_FIELDS) — pré-rempli avec les valeurs actuelles de la
 * commande, ouvert depuis un bouton « ✏️ Modifier » dans le tableau plutôt
 * que par la saisie ligne par ligne. Écrit par la même action que l'édition
 * en ligne (`updateCommandeRow`), donc les mêmes règles serveur s'appliquent
 * (rattachement client, journal des prix, synchro GPAO…). */
function construireReglesEdition(): ReglesFormulaire {
  return {
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
      if (a.qte === 0) return null;
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
              🏭 Production interne : marge nulle par convention.
            </div>
          )}
        </div>
      );
    },
  };
}

const versChamp = (v: number | null | undefined) => (v == null ? "" : String(v));

export function ModifierCommande({
  commande,
  clients,
  faconniers,
  chaines,
}: {
  commande: CommandeRow;
  clients: Choix[];
  faconniers: Choix[];
  chaines: Choix[];
}) {
  const regles = useMemo(() => construireReglesEdition(), []);

  const initialValues = {
    modele: commande.modele,
    refArticle: commande.refArticle,
    couleur: commande.couleur,
    saison: commande.saison,
    client: commande.client,
    faconnier: commande.faconnier,
    chaineId: versChamp(commande.chaineId),
    qte: versChamp(commande.qte),
    prixVente: versChamp(commande.prixVente),
    prixFacon: versChamp(commande.prixFacon),
    consoTheo: versChamp(commande.consoTheo),
    receptTissu: commande.receptTissu,
    dateExport: commande.dateExport,
    dateExportReel: commande.dateExportReel,
    produit: versChamp(commande.produit),
    note: commande.note,
  };

  return (
    <EntityFormDialog
      trigger={
        <Button
          type="button"
          variant="outline"
          className="h-auto gap-1 rounded border border-input px-1.5 py-0.5 text-[10px] font-semibold hover:bg-muted"
          title="Modifier la commande — mêmes champs qu'à la création"
        >
          <Pencil className="size-3" /> Modifier
        </Button>
      }
      triggerLabel="Modifier"
      title={`Modifier ${commande.of || "cette commande"} — ${commande.modele}`}
      fields={COMMANDE_EDIT_FIELDS}
      dynamicOptions={{ client: clients, faconnier: faconniers, chaineId: chaines }}
      regles={regles}
      initialValues={initialValues}
      action={(data) => updateCommandeRow(commande.id, data)}
      successMessage="Commande modifiée"
      submitLabel="Enregistrer les modifications"
    />
  );
}
