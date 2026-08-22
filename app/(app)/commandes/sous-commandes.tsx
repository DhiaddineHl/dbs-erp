"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  PREFIXE_CHAINE,
  apercuCommande,
  assignationDepuisChoix,
  choixAssignation,
  erreurRepartition,
  montantSaisi,
  resteAAffecter,
} from "@/lib/domain/commande";
import type { CommandeRow } from "@/lib/services/commandes";
import { ajouterSousCommandes } from "@/lib/actions/commandes";

/* Découper une commande.
 *
 * Une sous-commande n'est pas une commande de moins : c'est une part de la
 * même, confiée ailleurs. Elle porte donc le modèle et le client de sa mère —
 * ils ne sont pas saisissables ici — et se distingue par ce qui varie
 * réellement d'un atelier à l'autre : la quantité, le prix, la couleur, les
 * dates.
 *
 * La quantité mère reste la quantité totale promise au client. L'écran montre
 * en permanence ce qu'il reste à répartir, parce que c'est la seule question
 * qu'on se pose en découpant, et qu'un total faux ne se voit plus une fois la
 * commande enregistrée. */

const nb = new Intl.NumberFormat("fr-FR");
const eur = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

export type Choix = { value: string; label: string };

/** Une ligne en cours de saisie. Les clés sont celles que l'action serveur
 * lit, pour qu'aucune traduction ne s'intercale entre l'écran et la base. */
export type BrouillonSousCommande = Record<string, string>;

const VIDE: BrouillonSousCommande = {
  of: "",
  qte: "",
  faconnier: "",
  chaineId: "",
  prixVente: "",
  prixFacon: "",
  couleur: "",
  refArticle: "",
  dateExport: "",
  note: "",
};

export const lireBrouillons = (json: string | undefined): BrouillonSousCommande[] => {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? (arr as BrouillonSousCommande[]) : [];
  } catch {
    return [];
  }
};

const qteDe = (d: BrouillonSousCommande) => Math.max(0, Math.round(montantSaisi(d.qte) ?? 0));

/** Total réparti sur les lignes en cours de saisie. */
export const totalBrouillons = (lignes: BrouillonSousCommande[]) =>
  lignes.reduce((s, d) => s + qteDe(d), 0);

export function EditeurSousCommandes({
  qteTotale,
  modele,
  dejaAffectee = 0,
  faconniers,
  chaines,
  valeur,
  onChange,
}: {
  /** Quantité totale de la commande mère. */
  qteTotale: number;
  /** Modèle hérité — affiché, jamais saisi. */
  modele: string;
  /** Quantité déjà partie en sous-commandes enregistrées. */
  dejaAffectee?: number;
  faconniers: Choix[];
  chaines: Choix[];
  /** Lignes sérialisées en JSON, telles que l'action serveur les attend. */
  valeur: string;
  onChange: (json: string) => void;
}) {
  const lignes = lireBrouillons(valeur);
  const emettre = (next: BrouillonSousCommande[]) => onChange(JSON.stringify(next));

  const choixAssigne = useMemo(
    () => [
      ...chaines.map((c) => ({ value: `${PREFIXE_CHAINE}${c.value}`, label: `🏭 ${c.label} (interne)` })),
      ...faconniers,
    ],
    [chaines, faconniers],
  );

  const reste = resteAAffecter(qteTotale, [{ qte: dejaAffectee }, ...lignes.map((d) => ({ qte: qteDe(d) }))]);
  const trop = reste < 0;

  /* La nouvelle ligne arrive préremplie avec ce qu'il reste : c'est la
     répartition la plus fréquente — tout le reliquat au même atelier — et
     celle qu'on corrige le plus vite quand ce n'est pas la bonne. */
  const ajouter = () => emettre([...lignes, { ...VIDE, qte: reste > 0 ? String(reste) : "" }]);
  const retirer = (i: number) => emettre(lignes.filter((_, idx) => idx !== i));

  const modifier = (i: number, champ: string, v: string) =>
    emettre(
      lignes.map((d, idx) => {
        if (idx !== i) return d;
        const next: BrouillonSousCommande = { ...d, [champ]: v };
        /* Même règle que sur la mère : en interne, le prix façon suit le prix
           de vente. DBS n'achète pas sa propre façon. */
        return apercuCommande(next).interne ? { ...next, prixFacon: next.prixVente ?? "" } : next;
      }),
    );

  const assigner = (i: number, v: string) =>
    emettre(
      lignes.map((d, idx) => {
        if (idx !== i) return d;
        const next: BrouillonSousCommande = { ...d, ...assignationDepuisChoix(v) };
        return apercuCommande(next).interne ? { ...next, prixFacon: next.prixVente ?? "" } : next;
      }),
    );

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[11px] font-semibold text-secondary-foreground">
          🧩 Sous-commandes {lignes.length > 0 && `(${lignes.length})`}
        </span>
        <span className="text-[10.5px] text-muted-foreground">
          Même modèle{modele ? ` — ${modele}` : ""}, quantité prise sur le total.
        </span>
        <span className="ml-auto text-[11px] tabular-nums">
          Total <b>{nb.format(qteTotale)}</b> ·{" "}
          {dejaAffectee > 0 && <>déjà réparti <b>{nb.format(dejaAffectee)}</b> · </>}
          Reste{" "}
          <b className={trop ? "text-[var(--danger-d)]" : reste === 0 ? "text-success-foreground" : ""}>
            {nb.format(reste)}
          </b>{" "}
          pcs
        </span>
      </div>

      {lignes.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          Aucune sous-commande — la commande sera produite d&apos;un seul tenant. Ajoutez-en une pour confier une
          part de la quantité à un autre atelier, à son propre prix.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-[9.5px] uppercase tracking-wide text-muted-foreground">
                <th className="w-24 px-1 pb-1 text-left">N° OF</th>
                <th className="w-20 px-1 pb-1 text-right">Qté</th>
                <th className="px-1 pb-1 text-left">Assigné</th>
                <th className="w-24 px-1 pb-1 text-right">P. vente</th>
                <th className="w-24 px-1 pb-1 text-right">P. façon</th>
                <th className="w-24 px-1 pb-1 text-left">Couleur</th>
                <th className="w-32 px-1 pb-1 text-left">Export</th>
                <th className="w-24 px-1 pb-1 text-right">CA</th>
                <th className="w-7 px-1 pb-1" />
              </tr>
            </thead>
            <tbody>
              {lignes.map((d, i) => {
                const a = apercuCommande(d);
                return (
                  <tr key={i} className="align-top">
                    <td className="px-1 py-0.5">
                      <input
                        value={d.of ?? ""}
                        placeholder="auto"
                        className={champ}
                        onChange={(e) => modifier(i, "of", e.target.value)}
                      />
                    </td>
                    <td className="px-1 py-0.5">
                      <input
                        type="number"
                        min={0}
                        value={d.qte ?? ""}
                        className={`${champ} text-right`}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => modifier(i, "qte", e.target.value)}
                      />
                    </td>
                    <td className="px-1 py-0.5">
                      <select
                        value={choixAssignation(d)}
                        className={champ}
                        onChange={(e) => assigner(i, e.target.value)}
                      >
                        <option value="">⚠ non assigné</option>
                        {choixAssigne.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-1 py-0.5">
                      <input
                        value={d.prixVente ?? ""}
                        placeholder="12,40"
                        className={`${champ} text-right`}
                        onChange={(e) => modifier(i, "prixVente", e.target.value)}
                      />
                    </td>
                    <td className="px-1 py-0.5">
                      <input
                        value={d.prixFacon ?? ""}
                        placeholder={a.interne ? "= vente" : "3,50"}
                        readOnly={a.interne}
                        title={a.interne ? "Production interne — le prix façon suit le prix de vente" : undefined}
                        className={`${champ} text-right ${a.interne ? "bg-muted text-muted-foreground" : ""}`}
                        onChange={(e) => modifier(i, "prixFacon", e.target.value)}
                      />
                    </td>
                    <td className="px-1 py-0.5">
                      <input
                        value={d.couleur ?? ""}
                        className={champ}
                        onChange={(e) => modifier(i, "couleur", e.target.value)}
                      />
                    </td>
                    <td className="px-1 py-0.5">
                      <input
                        type="date"
                        value={d.dateExport ?? ""}
                        className={`${champ} tabular-nums`}
                        onChange={(e) => modifier(i, "dateExport", e.target.value)}
                      />
                    </td>
                    <td className="px-1 py-1 text-right tabular-nums text-muted-foreground">
                      {a.ca > 0 ? `${eur.format(a.ca)} €` : "—"}
                    </td>
                    <td className="px-1 py-0.5 text-right">
                      <button
                        type="button"
                        title="Retirer cette sous-commande"
                        className="rounded border border-input px-1 py-0.5 text-[10px] hover:bg-muted"
                        onClick={() => retirer(i)}
                      >
                        🗑
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="xs" onClick={ajouter}>
          + Ajouter une sous-commande
        </Button>
        {trop && (
          <span className="text-[10.5px] text-[var(--danger-d)]">
            ⚠ {erreurRepartition(qteTotale - dejaAffectee, lignes.map((d) => ({ qte: qteDe(d) })))}
          </span>
        )}
      </div>
    </div>
  );
}

const champ =
  "h-7 w-full rounded border border-input bg-card px-1 text-[11px] outline-none focus:border-ring focus:ring-2 focus:ring-ring/40";

/* ═══════════ découper une commande déjà enregistrée ═══════════ */

/** Ajoute des parts à une commande existante.
 *
 * La découpe n'arrive pas toujours à la création : un client double sa
 * commande, un atelier tombe en panne, et il faut répartir ce qui était prévu
 * d'un seul tenant. Le reste à répartir est calculé sur ce que la base sait
 * déjà, pas sur ce que l'écran affichait en s'ouvrant. */
export function DialogAjoutSousCommandes({
  commande,
  faconniers,
  chaines,
  onFermer,
}: {
  commande: CommandeRow;
  faconniers: Choix[];
  chaines: Choix[];
  onFermer: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [valeur, setValeur] = useState("[]");

  const lignes = lireBrouillons(valeur);
  const reste = resteAAffecter(commande.qte, [
    { qte: commande.qteAffectee },
    ...lignes.map((d) => ({ qte: qteDe(d) })),
  ]);

  const enregistrer = () =>
    start(async () => {
      const r = await ajouterSousCommandes(commande.id, valeur);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`${lignes.length} sous-commande(s) ajoutée(s)`);
      onFermer();
      router.refresh();
    });

  return (
    <Dialog open onOpenChange={(o) => !o && onFermer()}>
      <DialogContent className="w-[95vw] max-w-[95vw] sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            🧩 Découper {commande.of || commande.modele} — {commande.modele}
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Chaque sous-commande produit le même modèle pour {commande.client || "le même client"}, avec sa part de la
          quantité et ses propres prix, dates et détails. La commande mère garde le total de{" "}
          {nb.format(commande.qte)} pièces et produit elle-même ce qui n&apos;est pas réparti.
        </p>
        <div className="max-h-[60vh] overflow-y-auto px-0.5">
          <EditeurSousCommandes
            qteTotale={commande.qte}
            modele={commande.modele}
            dejaAffectee={commande.qteAffectee}
            faconniers={faconniers}
            chaines={chaines}
            valeur={valeur}
            onChange={setValeur}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFermer} disabled={pending}>
            Annuler
          </Button>
          <Button onClick={enregistrer} disabled={pending || lignes.length === 0 || reste < 0}>
            {pending ? "Enregistrement…" : "Ajouter"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
