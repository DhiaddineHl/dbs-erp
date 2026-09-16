"use client";

import { useMemo, useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SectionPanel } from "@/components/shared/section-panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  CLES_TRI,
  LIBELLES_TRI,
  PREFIXE_CHAINE,
  STATUTS_MANUELS,
  type CleTri,
  assignationDepuisChoix,
  choixAssignation,
  estSousTraitee,
  grouperCommandes,
  statutBadge,
  statutDerive,
  statutLabel,
  trierCommandes,
} from "@/lib/domain/commande";
import type { CommandeRow } from "@/lib/services/commandes";
import * as A from "@/lib/actions/commandes";
import { COLONNES_ARGENT, COLONNES_COMMANDE, type CleColonne, storeColonnes } from "./colonnes";
import { imprimerSelection } from "./impression";
import { DialogFacturer } from "./facturer";
import { DialogPrixFacon, DialogPurge } from "./controles";
import { DialogDoublons, DialogPlanifier, DialogPrix } from "./outils";
import { PhotoCommande } from "./photo";
import { DialogAjoutSousCommandes } from "./sous-commandes";
import { DialogRegrouper } from "./regrouper";
import { ModifierCommande } from "./nouvelle-commande";
import { resteAFacturer } from "@/lib/domain/facturation-commande";

const nb = new Intl.NumberFormat("fr-FR");
const eur = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const dec = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateFr = (iso: string | null) =>
  iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split("-").reverse().join("/") : "—";

type Choix = { value: string; label: string };

const FILTRES_STATUT: Choix[] = [
  { value: "preparation", label: "📋 En préparation" },
  { value: "production", label: "🏭 En production" },
  { value: "terminee", label: "✅ Terminées" },
  { value: "livree", label: "📦 Livrées" },
  { value: "retard", label: "⚠ En retard" },
];

/** Les deux visages du carnet.
 *
 * « planning » est le même écran, amputé de l'argent : le planning affecte les
 * façonniers et pose les dates, il n'a pas à connaître les prix ni les marges.
 * Tout le reste — filtres, tri, sélection, enregistrement — est commun, et les
 * écritures passent par les mêmes actions serveur : ce que le planning change
 * apparaît dans Commandes, et réciproquement. */
export type ModeCarnet = "commandes" | "planning";

export function CommandesClient({
  commandes,
  clients,
  faconniers,
  chaines,
  peutSupprimer,
  peutFacturer,
  mode = "commandes",
}: {
  commandes: CommandeRow[];
  clients: Choix[];
  faconniers: Choix[];
  chaines: Choix[];
  peutSupprimer: boolean;
  peutFacturer: boolean;
  mode?: ModeCarnet;
}) {
  const planning = mode === "planning";
  const router = useRouter();
  const [pending, start] = useTransition();

  /* ─── filtres ─── */
  const [q, setQ] = useState("");
  const [statut, setStatut] = useState("");
  const [client, setClient] = useState("");
  const [assigne, setAssigne] = useState("");
  const [avecArchivees, setAvecArchivees] = useState(false);

  /* ─── tri ─── */
  const [tri, setTri] = useState<{ cle: CleTri; sens: 1 | -1 }>({ cle: "export", sens: 1 });

  /* ─── sélection ───
     Par identifiant, pas par index de ligne : elle survit ainsi au changement
     de filtre, au tri et au réaffichage déclenché par une modification d'un
     collègue. Cocher trente commandes puis affiner la recherche ne doit pas
     tout décocher. */
  const [selection, setSelection] = useState<Set<number>>(new Set());

  /* ─── colonnes ─── */
  const masquees = useSyncExternalStore(
    storeColonnes.subscribe,
    storeColonnes.getSnapshot,
    storeColonnes.getServerSnapshot,
  );
  const [choixColonnes, setChoixColonnes] = useState(false);

  /* En planning, les colonnes d'argent sont masquées d'office et ne sont même
   * pas proposées : ce n'est pas un réglage d'affichage mais le périmètre de
   * l'écran. Le réglage du poste, lui, reste partagé avec Commandes — masquer
   * « Client » ici le masque là-bas, comme dans PilotPro. */
  const masqueesEff = useMemo(
    () => (planning ? new Set<CleColonne>([...masquees, ...COLONNES_ARGENT]) : masquees),
    [masquees, planning],
  );
  const visible = (c: CleColonne) => !masqueesEff.has(c);

  const [statutModal, setStatutModal] = useState<CommandeRow | null>(null);
  const [facturerModal, setFacturerModal] = useState<CommandeRow | null>(null);
  const [prixFaconModal, setPrixFaconModal] = useState(false);
  const [purgeModal, setPurgeModal] = useState(false);
  const [prixModal, setPrixModal] = useState<CommandeRow | null>(null);
  const [doublonsModal, setDoublonsModal] = useState(false);
  const [planifierModal, setPlanifierModal] = useState(false);
  const [decouperModal, setDecouperModal] = useState<CommandeRow | null>(null);
  const [regrouperModal, setRegrouperModal] = useState(false);

  /* ─── accordéons ───
     Fermés au départ : le carnet doit d'abord répondre à « combien de
     commandes », pas à « comment chacune est découpée ». Ouverts par
     identifiant, donc l'état survit au tri, au filtre et au rafraîchissement
     déclenché par la modification d'un collègue. */
  const [ouverts, setOuverts] = useState<Set<number>>(new Set());
  const basculerOuvert = (id: number) =>
    setOuverts((p) => {
      const s = new Set(p);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });

  /* ─── liste affichée ───
     Le filtre porte sur le GROUPE — la commande mère et ses sous-commandes —
     et non sur la ligne isolée. Une commande découpée apparaît donc dès que
     la mère ou l'une de ses parts correspond, et l'accordéon montre alors
     toutes ses parts : n'en montrer qu'une donnerait à lire une répartition
     amputée (300 pièces sur une commande qui en compte 1 200), ce qui trompe
     plus sûrement que de ne rien montrer.

     Le tri, lui, ne porte que sur les mères : les parts suivent la leur, dans
     l'ordre de leurs numéros. Une part triée à part de sa commande ne veut
     rien dire. */
  const groupes = useMemo(() => {
    const n = q.trim().toLowerCase();
    const correspond = (c: CommandeRow) => {
      if (c.archived && !avecArchivees) return false;
      if (client && c.client !== client) return false;
      if (assigne) {
        if (assigne === "__interne") {
          if (!c.chaineId) return false;
        } else if (assigne === "__aucun") {
          if (c.chaineId || c.faconnier) return false;
        } else if (c.faconnier !== assigne) return false;
      }
      if (n && !`${c.of} ${c.modele} ${c.client} ${c.refArticle} ${c.couleur}`.toLowerCase().includes(n)) return false;
      if (statut) return c.statutKey === statut;
      /* Sans filtre, on masque les livrées : le carnet sert à voir ce qui
       * reste à faire. Le filtre « 📦 Livrées » les ramène à la demande. */
      return c.statutKey !== "livree";
    };

    const retenus = grouperCommandes(commandes).filter(
      (g) => correspond(g.parent) || g.enfants.some(correspond),
    );
    const parts = new Map(retenus.map((g) => [g.parent.id, g.enfants]));
    return trierCommandes(retenus.map((g) => g.parent), tri.cle, tri.sens).map((parent) => ({
      parent,
      enfants: [...(parts.get(parent.id) ?? [])].sort((a, b) =>
        a.of.localeCompare(b.of, "fr", { numeric: true }),
      ),
    }));
  }, [commandes, q, statut, client, assigne, avecArchivees, tri]);

  /** Toutes les lignes du carnet, mères et parts confondues — ce que les
   * actions groupées et la case « tout cocher » prennent pour cible. */
  const affichees = useMemo(() => groupes.flatMap((g) => [g.parent, ...g.enfants]), [groupes]);

  /** Les parts d'une mère, pour cocher ou décocher la famille d'un geste. */
  const familleDe = useMemo(
    () => new Map(groupes.map((g) => [g.parent.id, [g.parent.id, ...g.enfants.map((e) => e.id)]])),
    [groupes],
  );

  /* ─── synthèse de la sélection ───
     Calculée sur TOUTES les commandes, pas seulement les visibles : une ligne
     cochée puis masquée par un filtre reste comptée, sinon les totaux
     mentiraient sur ce que les actions groupées vont traiter. */
  const cochees = useMemo(() => commandes.filter((c) => selection.has(c.id)), [commandes, selection]);
  const synthese = useMemo(() => {
    let pieces = 0;
    let ca = 0;
    let marge = 0;
    let piecesST = 0;
    let margeST = 0;
    let nST = 0;
    /* Quantités et montants PROPRES, pas totaux : cocher une mère et ses
       parts ne doit pas compter les mêmes pièces deux fois. Sur une commande
       non découpée, le propre est le tout — la synthèse ne change donc pas. */
    for (const c of cochees) {
      pieces += c.qtePropre;
      ca += c.caPropre;
      marge += c.margePropre;
      if (estSousTraitee(c)) {
        piecesST += c.qtePropre;
        margeST += c.margePropre;
        nST++;
      }
    }
    return { pieces, ca, marge, piecesST, margeST, nST };
  }, [cochees]);

  /* Cocher une commande coche ses parts : les actions groupées — archiver,
     marquer livrée, supprimer — portent sur le contrat entier. En laisser une
     part de côté produirait une commande à moitié archivée, visible nulle
     part. Une part se coche seule, elle. */
  const basculer = (id: number) =>
    setSelection((p) => {
      const s = new Set(p);
      const famille = familleDe.get(id) ?? [id];
      if (s.has(id)) for (const x of famille) s.delete(x);
      else for (const x of famille) s.add(x);
      return s;
    });

  const visiblesCochees = affichees.filter((c) => selection.has(c.id)).length;
  const toutCoche = affichees.length > 0 && visiblesCochees === affichees.length;
  const partiel = visiblesCochees > 0 && !toutCoche;
  const basculerTout = () =>
    setSelection((p) => {
      const s = new Set(p);
      if (toutCoche) for (const c of affichees) s.delete(c.id);
      else for (const c of affichees) s.add(c.id);
      return s;
    });

  /* ─── actions groupées ─── */
  const resume = (lignes: CommandeRow[]) =>
    lignes
      .slice(0, 8)
      .map((c) => `· ${c.of || "—"} — ${c.modele} (${c.client || "sans client"})`)
      .join("\n") + (lignes.length > 8 ? `\n· … et ${lignes.length - 8} autre(s)` : "");

  const executer = (action: () => Promise<{ ok: boolean; error?: string }>, succes: string) =>
    start(async () => {
      const r = await action();
      if (!r.ok) {
        toast.error(r.error ?? "Erreur");
        return;
      }
      toast.success(succes);
      setSelection(new Set());
      router.refresh();
    });

  const ids = cochees.map((c) => c.id);

  const actionLivrees = () => {
    if (!confirm(`Marquer ${cochees.length} commande(s) comme LIVRÉES ?\n\n${resume(cochees)}`)) return;
    executer(() => A.marquerLivrees(ids), `${cochees.length} commande(s) marquée(s) livrée(s)`);
  };

  const actionArchiver = () => {
    if (
      !confirm(
        `Archiver ${cochees.length} commande(s) ?\n(conservées dans les archives, retirées des listes actives)\n\n${resume(cochees)}`,
      )
    )
      return;
    executer(() => A.archiverCommandes(ids, true), `${cochees.length} commande(s) archivée(s)`);
  };

  const actionSupprimer = () => {
    const ca = eur.format(cochees.reduce((s, c) => s + c.ca, 0));
    if (
      !confirm(
        `⚠ SUPPRIMER DÉFINITIVEMENT ${cochees.length} commande(s) ?\n\n${resume(cochees)}\n\n` +
          `CA concerné : ${ca} €\nElles seront retirées de TOUS les modules et de tous les postes.`,
      )
    )
      return;
    if (!confirm(`Dernière confirmation — cette action est IRRÉVERSIBLE.\n\nSupprimer les ${cochees.length} commande(s) ?`))
      return;
    executer(() => A.deleteCommandesAction(ids), `${cochees.length} commande(s) supprimée(s)`);
  };

  /* Délier n'efface rien : la sous-commande redevient un OF autonome, qui gère
     de nouveau sa propre matière. Sur une PART issue d'une découpe, cela change
     en revanche le total du client — ses pièces cessent d'être prises sur le
     porteur pour s'ajouter à côté — et l'écran le dit avant, pas après. */
  const delier = (c: CommandeRow) => {
    const avertissement =
      c.lienParent === "decoupe"
        ? `\n\n⚠ Cette sous-commande est une PART de ${c.parentOf} : ses ${nb.format(
            c.qte,
          )} pièces sont aujourd'hui prises sur la quantité du porteur. Déliée, elle s'y ajoutera — le total du client augmentera d'autant.`
        : `\n\n${c.of} redeviendra un OF autonome et gérera de nouveau sa propre réception tissu.`;
    if (!confirm(`Délier ${c.of || c.modele} de ${c.parentOf} ?${avertissement}`)) return;
    start(async () => {
      const r = await A.delierCommandes([c.id]);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`${c.of || "Sous-commande"} déliée`);
      router.refresh();
    });
  };

  const actionImprimer = () => {
    if (!imprimerSelection(cochees, masqueesEff)) toast.error("Autorisez les fenêtres pop-up pour imprimer");
  };

  /* ─── édition en ligne ─── */
  const enregistrer = (id: number, champ: string, valeur: string) => appliquer(id, { [champ]: valeur });

  const appliquer = (id: number, patch: Record<string, string>) =>
    start(async () => {
      const r = await A.updateCommandeRow(id, patch);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      router.refresh();
    });

  /* Interne et sous-traitance s'excluent : une même liste porte les deux, et
   * choisir l'un efface l'autre. Deux champs séparés laissaient des commandes
   * à la fois « chaîne 2 » et « façonnier X », ce qui fausse la marge à façon. */
  const choixAssigne = useMemo(
    () => [
      ...chaines.map((c) => ({ value: `${PREFIXE_CHAINE}${c.value}`, label: `🏭 ${c.label} (interne)` })),
      ...faconniers,
    ],
    [chaines, faconniers],
  );

  const assignerA = (id: number, valeur: string) => appliquer(id, assignationDepuisChoix(valeur));

  /* +2 : la case à cocher et la colonne d'actions, qui ne sont ni masquables
   * ni imprimables — ce ne sont pas des données de la commande. */
  const nbColonnes = 2 + COLONNES_COMMANDE.filter((c) => visible(c.cle)).length;

  /* ─── une ligne du carnet ───
   *
   * Mère et sous-commande passent par la même fonction, parce qu'une part est
   * une commande : mêmes colonnes, mêmes cellules éditables, mêmes actions.
   * Trois choses seulement les séparent, et ce sont exactement les trois que
   * la découpe impose :
   *
   *   · le modèle et le client sont hérités — une part ne peut ni changer
   *     d'article ni changer de destinataire, sinon ce n'est plus une part ;
   *   · la mère affiche les totaux de son groupe (marge, avancement), la part
   *     les siens ;
   *   · la mère porte le chevron et le bouton de découpe.
   *
   * `enfants` n'est passé que pour une mère ; une part le reçoit vide, ce qui
   * fait d'elle une ligne ordinaire. */
  const rendreLigne = (c: CommandeRow, enfants: CommandeRow[] = []) => {
    const parts = enfants.length;
    const decoupee = parts > 0;
    const part = c.parentId != null;
    const ouvert = ouverts.has(c.id);
    /* Porteur d'un REGROUPEMENT : ses membres gardent leur quantité, la sienne
       n'a donc rien à leur céder — ni découpe possible, ni « dont réparties ». */
    const aDesMembres = enfants.some((e) => e.lienParent === "regroupement");
    const aDesParts = enfants.some((e) => e.lienParent === "decoupe");

    return (
      <tr
        key={c.id}
        className={`border-b last:border-0 ${selection.has(c.id) ? "bg-accent/30" : part ? "bg-muted/25" : ""} ${
          c.archived ? "opacity-60" : ""
        }`}
      >
        <td className="px-2 py-1.5">
          <div className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={selection.has(c.id)}
              title={decoupee ? "Cocher la commande et ses sous-commandes" : undefined}
              onChange={() => basculer(c.id)}
            />
            {decoupee ? (
              <button
                type="button"
                className="w-4 rounded text-[10px] leading-none text-muted-foreground hover:bg-muted"
                title={ouvert ? "Replier les sous-commandes" : `Déplier les ${parts} sous-commande(s)`}
                aria-expanded={ouvert}
                onClick={() => basculerOuvert(c.id)}
              >
                {ouvert ? "▾" : "▸"}
              </button>
            ) : (
              <span className="w-4" aria-hidden />
            )}
          </div>
        </td>
        {visible("of") && (
          <td className={`py-1.5 font-bold text-brand ${part ? "pl-6 pr-3" : "px-3"}`}>
            <div className="flex items-center gap-1">
              {part && (
                <span
                  className="shrink-0 font-normal text-muted-foreground"
                  title={
                    c.lienParent === "regroupement"
                      ? `Matière et contrôle qualité gérés par ${c.parentOf}`
                      : `Part de la commande ${c.parentOf}`
                  }
                >
                  ↳
                </span>
              )}
              <Cellule valeur={c.of} onSave={(v) => enregistrer(c.id, "of", v)} />
              {decoupee && (
                <span
                  className="shrink-0 rounded bg-muted px-1 text-[9px] font-semibold text-muted-foreground"
                  title={
                    aDesMembres
                      ? `${parts} OF réuni(s) sous celui-ci — matière et contrôle qualité mutualisés`
                      : `${parts} sous-commande(s) — parts de cette quantité`
                  }
                >
                  {aDesMembres ? "🔗" : "🧩"}
                  {parts}
                </span>
              )}
            </div>
          </td>
        )}
        {visible("refArticle") && (
          <td className="px-3 py-1.5 text-muted-foreground">
            {part && c.lienParent === "decoupe" ? (
              <span className="px-1" title="Référence héritée de la commande mère">
                {c.refArticle || "—"}
              </span>
            ) : (
              <Cellule valeur={c.refArticle} onSave={(v) => enregistrer(c.id, "refArticle", v)} />
            )}
          </td>
        )}
        {visible("modele") && (
          <td className="px-3 py-1.5 font-semibold">
            {part && c.lienParent === "decoupe" ? (
              /* Hérité de la mère, donc affiché et non saisi : le renommer ici
                 renommerait la commande entière, ce qui ne se devine pas. Un OF
                 simplement RÉUNI garde le sien — c'est une commande entière,
                 que le commercial a pu libeller autrement. */
              <div className="min-w-0">
                <span className="px-1 font-normal text-muted-foreground" title="Modèle hérité de la commande mère">
                  {c.modele}
                </span>
                <div className="px-1 text-[10px] font-normal text-muted-foreground">
                  <Cellule valeur={c.couleur} onSave={(v) => enregistrer(c.id, "couleur", v)} />
                </div>
              </div>
            ) : (
              /* La photo est collée au modèle : c'est le nom qu'elle illustre,
                 et l'atelier lit les deux d'un seul regard. */
              <div className="flex items-center gap-2">
                <PhotoCommande
                  commandeId={c.id}
                  titre={`${c.of || "sans OF"} · ${c.modele}`}
                  hash={c.photoHash}
                  archivee={c.archived}
                />
                <div className="min-w-0 flex-1">
                  <Cellule valeur={c.modele} onSave={(v) => enregistrer(c.id, "modele", v)} />
                  <div className="px-1 text-[10px] font-normal text-muted-foreground">
                    <Cellule valeur={c.couleur} onSave={(v) => enregistrer(c.id, "couleur", v)} />
                  </div>
                </div>
              </div>
            )}
          </td>
        )}
        {visible("client") && (
          <td className="px-3 py-1.5">
            {part && c.lienParent === "decoupe" ? (
              <span className="px-1 text-muted-foreground" title="Client hérité de la commande mère">
                {c.client || "—"}
              </span>
            ) : (
              <Liste
                valeur={c.client}
                choix={clients}
                vide="— aucun —"
                onSave={(v) => enregistrer(c.id, "client", v)}
              />
            )}
          </td>
        )}
        {visible("assigne") && (
          <td className="px-3 py-1.5">
            <Liste
              valeur={choixAssignation(c)}
              choix={choixAssigne}
              vide="⚠ non assigné"
              onSave={(v) => assignerA(c.id, v)}
            />
          </td>
        )}
        {visible("qte") && (
          <td className="px-3 py-1.5 text-right tabular-nums">
            <Cellule valeur={String(c.qte)} type="number" droite onSave={(v) => enregistrer(c.id, "qte", v)} />
            {aDesParts && (
              <div
                className="px-1 text-[10px] text-muted-foreground"
                title="Quantité confiée aux sous-commandes — le reste est produit par la commande mère"
              >
                dont {nb.format(c.qteAffectee)} réparties
              </div>
            )}
            {aDesMembres && (
              <div
                className="px-1 text-[10px] text-muted-foreground"
                title="Pièces du groupe : cet OF et ceux qui lui sont rattachés. C'est cette quantité que la matière doit couvrir."
              >
                {nb.format(c.qteGroupe)} au groupe
              </div>
            )}
          </td>
        )}
        {visible("prixVente") && (
          <td className="px-3 py-1.5 text-right tabular-nums">
            <Cellule
              valeur={c.prixVente == null ? "" : String(c.prixVente)}
              affichage={c.prixVente == null ? "—" : `${dec.format(c.prixVente)} €`}
              type="number"
              droite
              onSave={(v) => enregistrer(c.id, "prixVente", v)}
            />
          </td>
        )}
        {visible("prixFacon") && (
          <td className="px-3 py-1.5 text-right tabular-nums">
            <Cellule
              valeur={c.prixFacon == null ? "" : String(c.prixFacon)}
              affichage={c.prixFacon == null ? "—" : `${dec.format(c.prixFacon)} €`}
              type="number"
              droite
              onSave={(v) => enregistrer(c.id, "prixFacon", v)}
            />
          </td>
        )}
        {visible("margeTotale") && (
          <td className="px-3 py-1.5 text-right tabular-nums">
            <b className={c.margeTotale >= 0 ? "text-success-foreground" : "text-[var(--danger-d)]"}>
              {dec.format(c.margeUnitaire)} €
            </b>
            {/* Sur une commande découpée, le total est celui du groupe : chaque
                part à son propre prix, plus ce que la mère produit elle-même.
                La marge unitaire au-dessus reste celle de la mère — elle ne
                vaut plus pour l'ensemble dès que les prix diffèrent. */}
            <div
              className="text-[10px] text-muted-foreground"
              title={decoupee ? "Marge du groupe : cette commande et ses sous-commandes" : undefined}
            >
              {eur.format(decoupee ? c.margeGroupe : c.margeTotale)} € tot.{decoupee && " (groupe)"}
            </div>
          </td>
        )}
        {visible("dateExport") && (
          <td className="px-3 py-1.5 tabular-nums">
            {planning ? (
              /* Les deux bornes que le planning tient : quand le tissu arrive,
                 et quand la commande doit partir. */
              <div className="flex flex-col gap-1">
                <DatePlanning
                  label="Tissu"
                  valeur={c.receptTissu}
                  onSave={(v) => enregistrer(c.id, "receptTissu", v)}
                />
                <DatePlanning
                  label="Export"
                  valeur={c.dateExport}
                  onSave={(v) => enregistrer(c.id, "dateExport", v)}
                />
              </div>
            ) : (
              <Cellule
                valeur={c.dateExport ?? ""}
                affichage={dateFr(c.dateExport)}
                type="date"
                onSave={(v) => enregistrer(c.id, "dateExport", v)}
              />
            )}
          </td>
        )}
        {visible("retard") && (
          <td className="px-3 py-1.5">
            <StatusBadge tone={c.retard[0]}>{c.retard[1]}</StatusBadge>
          </td>
        )}
        {visible("av") && (
          <td className="px-3 py-1.5">
            <div className="flex items-center justify-end gap-1.5">
              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(c.av, 100)}%` }} />
              </div>
              <span
                className="w-8 text-right tabular-nums"
                title={
                  aDesParts
                    ? "Avancement du contrat : la commande et ses parts"
                    : aDesMembres
                      ? "Avancement de cet OF seul — les OF réunis se produisent chacun pour soi"
                      : undefined
                }
              >
                {c.av}%
              </span>
            </div>
          </td>
        )}
        {visible("statut") && (
          <td className="px-3 py-1.5">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                className="cursor-pointer"
                title="Cliquer pour forcer le statut manuellement"
                onClick={() => setStatutModal(c)}
              >
                <StatusBadge tone={c.statut[0]}>{c.statut[1]}</StatusBadge>
                {c.statutManuel && <span className="ml-1 text-[9px]" title="Statut forcé">✋</span>}
              </button>
              {/* Facturation partielle comprise : le bouton reste tant qu'il
                  reste quelque chose à facturer. */}
              {peutFacturer && !planning && !c.archived && resteAFacturer(c) > 0 && (
                <button
                  type="button"
                  className="rounded border border-input px-1 py-0.5 text-[10px] hover:bg-muted"
                  title={`Facturer — reste ${nb.format(resteAFacturer(c))} pièce(s)`}
                  onClick={() => setFacturerModal(c)}
                >
                  📋€
                </button>
              )}
              {c.factureQte > 0 && (
                <span
                  className={`text-[9px] ${
                    c.factureQte >= c.qte ? "text-success-foreground" : "text-muted-foreground"
                  }`}
                  title={c.facNums.join(", ") || "facturée"}
                >
                  {nb.format(c.factureQte)}/{nb.format(c.qte)}
                  {c.factureQte >= c.qte ? " ✓" : " fact."}
                </span>
              )}
            </div>
          </td>
        )}
        {/* Trois portes de sortie par ligne : d'où vient ce prix, comment la
            commande se répartit, et où elle en est physiquement. La quatrième —
            à quoi ressemble l'article — a rejoint la colonne Modèle, et ne
            revient ici que si celle-ci est masquée, pour que le chooser de
            colonnes ne puisse pas rendre les photos inatteignables. */}
        <td className="whitespace-nowrap px-2 py-1.5 text-right">
          {!visible("modele") && !part && (
            <span className="mr-1 inline-flex align-middle">
              <PhotoCommande
                commandeId={c.id}
                titre={`${c.of || "sans OF"} · ${c.modele}`}
                hash={c.photoHash}
                archivee={c.archived}
              />
            </span>
          )}
          {part && !c.archived && (
            <>
              <button
                type="button"
                className="rounded border border-input px-1 py-0.5 text-[10px] hover:bg-muted"
                title={`Délier de ${c.parentOf} — l'OF reprend sa matière en propre`}
                onClick={() => delier(c)}
              >
                ⛓️‍💥
              </button>{" "}
            </>
          )}
          {/* Fenêtre de modification complète — les mêmes champs qu'à la
              création, pour tout changer d'un coup plutôt que cellule par
              cellule. Masquée en Planning, qui ne connaît pas les prix. */}
          {!planning && !c.archived && (
            <>
              <ModifierCommande commande={c} clients={clients} faconniers={faconniers} chaines={chaines} />{" "}
            </>
          )}
          {/* Une part ne se redécoupe pas : le découpage s'arrête à un niveau,
              sinon plus personne ne sait de quel total la quantité se déduit.
              Un porteur de regroupement non plus : les deux natures de lien
              n'additionnent pas leurs quantités de la même façon. */}
          {!part && !c.archived && !aDesMembres && (
            <>
              <button
                type="button"
                className="rounded border border-input px-1 py-0.5 text-[10px] hover:bg-muted"
                title="Découper — confier une part de la quantité à un autre atelier"
                onClick={() => setDecouperModal(c)}
              >
                🧩
              </button>{" "}
            </>
          )}
          {/* Le journal des prix reste dans Commandes : c'est de l'argent, et
              le planning n'en voit aucun. La traçabilité, elle, lui sert
              directement. */}
          {!planning && (
            <>
              <button
                type="button"
                className="rounded border border-input px-1 py-0.5 text-[10px] hover:bg-muted"
                title="Journal des prix — qui a changé quoi, et quand"
                onClick={() => setPrixModal(c)}
              >
                📈
              </button>{" "}
            </>
          )}
          {/* Le plan de coupe se prépare sur le porteur : c'est lui qui répond
              du tissu du groupe, donc lui qu'on matelasse. */}
          <Link
            href={`/modelisme/${c.parentId ?? c.id}/plan`}
            className="rounded border border-input px-1 py-0.5 text-[10px] hover:bg-muted"
            title={
              part
                ? `Plan de coupe — géré par ${c.parentOf}`
                : "Plan de coupe (matelassage) — conso, tracés, correction des tailles"
            }
          >
            📐
          </Link>{" "}
          {c.of ? (
            <Link
              href={`/tracabilite?of=${encodeURIComponent(c.of)}`}
              className="rounded border border-input px-1 py-0.5 text-[10px] hover:bg-muted"
              title={`Traçabilité de ${c.of}`}
            >
              🔍
            </Link>
          ) : (
            <span
              className="cursor-not-allowed rounded border border-input px-1 py-0.5 text-[10px] opacity-40"
              title="Traçabilité indisponible : cette commande n'a pas de n° OF"
            >
              🔍
            </span>
          )}
        </td>
      </tr>
    );
  };

  return (
    <>
      <SectionPanel
        title={planning ? "Planning général" : "Carnet de commandes"}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone="brand">
              {groupes.length}
              {affichees.length > groupes.length && ` +${affichees.length - groupes.length}`}
            </StatusBadge>
            {peutFacturer && !planning && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  title="Comparer le prix façon des commandes et des factures, archives comprises"
                  onClick={() => setPrixFaconModal(true)}
                >
                  💶 Vérifier prix façon
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  title="Ranger les commandes entièrement facturées ou livrées"
                  onClick={() => setPurgeModal(true)}
                >
                  🧹 Purger les soldées
                </Button>
              </>
            )}
            {!planning && (
              <Button
                size="sm"
                variant="outline"
                title="Réunir les OF d'un même client et d'une même référence : une seule saisie tissu, un seul contrôle qualité"
                onClick={() => setRegrouperModal(true)}
              >
                🧩 Sous-commandes
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              title="Commandes partageant client + modèle + référence"
              onClick={() => setDoublonsModal(true)}
            >
              👯 Doublons
            </Button>
            <Button size="sm" variant="outline" onClick={() => setChoixColonnes(true)}>
              🧰 Colonnes
            </Button>
          </div>
        }
        flush
      >
        {/* ─── filtres ─── */}
        <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-3 py-2.5">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher OF, modèle, client, réf…"
            className="h-8 w-64 bg-card"
          />
          <select
            value={statut}
            onChange={(e) => setStatut(e.target.value)}
            className="h-8 rounded-md border border-input bg-card px-2 text-xs"
          >
            <option value="">Tous statuts (hors livrées)</option>
            {FILTRES_STATUT.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            value={client}
            onChange={(e) => setClient(e.target.value)}
            className="h-8 max-w-48 rounded-md border border-input bg-card px-2 text-xs"
          >
            <option value="">Tous clients</option>
            {clients.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            value={assigne}
            onChange={(e) => setAssigne(e.target.value)}
            className="h-8 max-w-52 rounded-md border border-input bg-card px-2 text-xs"
          >
            <option value="">Tous façonniers / interne</option>
            <option value="__interne">🏭 Interne (chaîne)</option>
            <option value="__aucun">⚠ Non assigné</option>
            {faconniers.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <input type="checkbox" checked={avecArchivees} onChange={(e) => setAvecArchivees(e.target.checked)} />
            Inclure les archivées
          </label>
        </div>

        {/* ─── tri ─── */}
        <div className="flex flex-wrap items-center gap-1.5 border-b bg-muted/20 px-3 py-2">
          <span className="mr-1 text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">Trier par</span>
          {CLES_TRI.map((cle) => {
            const actif = tri.cle === cle;
            return (
              <Button
                key={cle}
                size="sm"
                variant={actif ? "default" : "outline"}
                className="h-6 px-2 text-[11px]"
                title={actif ? "Cliquez pour inverser le sens" : `Trier par ${LIBELLES_TRI[cle]}`}
                onClick={() =>
                  setTri((p) => (p.cle === cle ? { cle, sens: p.sens === 1 ? -1 : 1 } : { cle, sens: 1 }))
                }
              >
                {LIBELLES_TRI[cle]}
                {actif && (tri.sens === 1 ? " ▲" : " ▼")}
              </Button>
            );
          })}
          <span className="ml-2 text-[10.5px] text-muted-foreground">Les lignes sans date restent en fin de liste.</span>
        </div>

        {/* ─── synthèse + actions groupées ─── */}
        {cochees.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b bg-accent/40 px-3 py-2.5 text-xs">
            <span>
              <b className="text-accent-foreground">{cochees.length} cochée(s)</b> · <b>{nb.format(synthese.pieces)}</b>{" "}
              pièces
              {visible("prixVente") && (
                <>
                  {" · CA "}
                  <b>{eur.format(synthese.ca)} €</b>
                  {" · Marge "}
                  <b>{eur.format(synthese.marge)} €</b>
                </>
              )}
            </span>
            {synthese.nST > 0 && visible("prixVente") && (
              <span className="text-muted-foreground">
                dont sous-traité : {nb.format(synthese.piecesST)} pcs, marge {eur.format(synthese.margeST)} €
              </span>
            )}
            <span className="ml-auto flex flex-wrap gap-1.5">
              <Button size="sm" variant="outline" className="h-7" onClick={actionImprimer}>
                🖨 Imprimer
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7"
                title="Fixer la date d'export prévue, sans toucher à la date contractuelle"
                onClick={() => setPlanifierModal(true)}
              >
                🚢 Prévision export
              </Button>
              <Button size="sm" variant="outline" className="h-7" disabled={pending} onClick={actionLivrees}>
                ✅ Marquer livrées
              </Button>
              <Button size="sm" variant="outline" className="h-7" disabled={pending} onClick={actionArchiver}>
                🗄 Archiver
              </Button>
              {peutSupprimer && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 border-[var(--danger)] text-[var(--danger-d)]"
                  disabled={pending}
                  onClick={actionSupprimer}
                >
                  🗑 Supprimer
                </Button>
              )}
              <Button size="sm" variant="ghost" className="h-7" onClick={() => setSelection(new Set())}>
                Tout décocher
              </Button>
            </span>
          </div>
        )}

        {/* ─── tableau ─── */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/40 text-[10.5px] uppercase text-muted-foreground">
                <th className="w-14 px-2 py-2">
                  <input
                    type="checkbox"
                    checked={toutCoche}
                    ref={(el) => {
                      if (el) el.indeterminate = partiel;
                    }}
                    onChange={basculerTout}
                    title="Cocher toutes les lignes affichées"
                  />
                </th>
                {visible("of") && <th className="px-3 py-2 text-left">N° OF</th>}
                {visible("refArticle") && <th className="px-3 py-2 text-left">N° OF client</th>}
                {visible("modele") && <th className="px-3 py-2 text-left">Modèle</th>}
                {visible("client") && <th className="px-3 py-2 text-left">Client</th>}
                {visible("assigne") && <th className="px-3 py-2 text-left">Assigné</th>}
                {visible("qte") && <th className="px-3 py-2 text-right">Qté</th>}
                {visible("prixVente") && <th className="px-3 py-2 text-right">P. vente</th>}
                {visible("prixFacon") && <th className="px-3 py-2 text-right">P. façon</th>}
                {visible("margeTotale") && <th className="px-3 py-2 text-right">Marge</th>}
                {visible("dateExport") && (
                  <th className="px-3 py-2 text-left">{planning ? "Réception / Export" : "Export"}</th>
                )}
                {visible("retard") && <th className="px-3 py-2 text-left">Retard</th>}
                {visible("av") && <th className="px-3 py-2 text-right">Avancement</th>}
                {visible("statut") && <th className="px-3 py-2 text-left">Statut</th>}
                <th className="w-40 px-2 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {groupes.length === 0 ? (
                <tr>
                  <td colSpan={nbColonnes} className="py-10 text-center text-muted-foreground">
                    Aucune commande ne correspond aux filtres.
                  </td>
                </tr>
              ) : (
                groupes.flatMap((g) => [
                  rendreLigne(g.parent, g.enfants),
                  ...(ouverts.has(g.parent.id) ? g.enfants.map((e) => rendreLigne(e)) : []),
                ])
              )}
            </tbody>
          </table>
        </div>
      </SectionPanel>

      {choixColonnes && (
        <DialogColonnes
          masquees={masquees}
          planning={planning}
          onChange={storeColonnes.ecrire}
          onFermer={() => setChoixColonnes(false)}
        />
      )}
      {statutModal && (
        <DialogStatut commande={statutModal} onFermer={() => setStatutModal(null)} onSave={enregistrer} />
      )}
      {facturerModal && <DialogFacturer commande={facturerModal} onFermer={() => setFacturerModal(null)} />}
      {prixFaconModal && <DialogPrixFacon onFermer={() => setPrixFaconModal(false)} />}
      {purgeModal && <DialogPurge onFermer={() => setPurgeModal(false)} />}
      {prixModal && (
        <DialogPrix
          commandeId={prixModal.id}
          titre={`${prixModal.of || "sans OF"} · ${prixModal.modele}`}
          onFermer={() => setPrixModal(null)}
        />
      )}
      {doublonsModal && (
        <DialogDoublons peutSupprimer={peutSupprimer} onFermer={() => setDoublonsModal(false)} />
      )}
      {planifierModal && <DialogPlanifier commandes={cochees} onFermer={() => setPlanifierModal(false)} />}
      {regrouperModal && <DialogRegrouper onFermer={() => setRegrouperModal(false)} />}
      {decouperModal && (
        <DialogAjoutSousCommandes
          commande={decouperModal}
          faconniers={faconniers}
          chaines={chaines}
          onFermer={() => {
            /* La commande découpée s'ouvre d'elle-même : on vient d'ajouter
               des parts, les voir apparaître vaut confirmation. */
            setOuverts((prev) => new Set(prev).add(decouperModal.id));
            setDecouperModal(null);
          }}
        />
      )}
    </>
  );
}

/* ═══════════ cellules éditables ═══════════ */

/** Date du planning : libellé au-dessus, saisie directe.
 *
 * Contrairement à `Cellule`, pas de clic pour passer en édition — le planning
 * pose des dates à la chaîne, et un aller-retour par ligne le ralentirait. La
 * valeur part au `change`, donc au choix dans le calendrier. */
function DatePlanning({
  label,
  valeur,
  onSave,
}: {
  label: string;
  valeur: string;
  onSave: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-1">
      <span className="w-9 shrink-0 text-[8.5px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <input
        /* Remonté quand la valeur serveur change : sans cette clé, un champ non
           contrôlé garderait l'ancienne date après le refresh — y compris celle
           qu'un collègue vient de déplacer depuis Commandes. */
        key={valeur || "vide"}
        type="date"
        defaultValue={valeur || ""}
        className="w-[104px] rounded border border-input bg-card px-1 py-0.5 text-[10px] tabular-nums"
        onChange={(e) => {
          if (e.target.value !== (valeur || "")) onSave(e.target.value);
        }}
      />
    </label>
  );
}

function Cellule({
  valeur,
  affichage,
  type = "text",
  droite,
  onSave,
}: {
  valeur: string;
  /** Rendu au repos quand il diffère de la valeur brute (montant, date). */
  affichage?: string;
  type?: "text" | "number" | "date";
  droite?: boolean;
  onSave: (v: string) => void;
}) {
  const [edition, setEdition] = useState(false);
  if (!edition)
    return (
      <button
        type="button"
        className={`w-full rounded px-1 py-0.5 hover:bg-muted ${droite ? "text-right" : "text-left"}`}
        onClick={() => setEdition(true)}
      >
        {affichage ?? valeur ?? "—"}
      </button>
    );
  return (
    <input
      autoFocus
      type={type}
      defaultValue={valeur}
      className={`w-full rounded border border-ring bg-card px-1 py-0.5 ${droite ? "text-right" : ""}`}
      onBlur={(e) => {
        setEdition(false);
        if (e.target.value !== valeur) onSave(e.target.value);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setEdition(false);
      }}
    />
  );
}

function Liste({
  valeur,
  choix,
  vide,
  onSave,
}: {
  valeur: string;
  choix: Choix[];
  vide: string;
  onSave: (v: string) => void;
}) {
  const [edition, setEdition] = useState(false);
  if (!edition)
    return (
      <button type="button" className="w-full rounded px-1 py-0.5 text-left hover:bg-muted" onClick={() => setEdition(true)}>
        {valeur || <span className="text-muted-foreground">{vide}</span>}
      </button>
    );
  return (
    <select
      autoFocus
      defaultValue={valeur}
      className="w-full rounded border border-ring bg-card px-1 py-0.5"
      onBlur={() => setEdition(false)}
      onChange={(e) => {
        setEdition(false);
        if (e.target.value !== valeur) onSave(e.target.value);
      }}
    >
      <option value="">{vide}</option>
      {choix.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/* ═══════════ statut manuel ═══════════ */

function DialogStatut({
  commande,
  onFermer,
  onSave,
}: {
  commande: CommandeRow;
  onFermer: () => void;
  onSave: (id: number, champ: string, valeur: string) => void;
}) {
  const [choix, setChoix] = useState(commande.statutManuel);
  /* Ce que le statut vaudrait si on le laissait se déduire : sans cette
   * information, on fige un statut sans savoir ce qu'on remplace. */
  const auto = statutDerive({
    qte: commande.qte,
    produit: commande.produit,
    factureQte: commande.factureQte,
    prixVente: commande.prixVente,
    prixFacon: commande.prixFacon,
    dateExport: commande.dateExport,
    dateExportReel: commande.dateExportReel,
    receptTissu: commande.receptTissu,
    archived: commande.archived,
    statutManuel: null,
  });
  const badgeAuto = statutBadge(auto);

  return (
    <Dialog open onOpenChange={(o) => !o && onFermer()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Statut de la commande {commande.of || commande.modele}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <label
            className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
              choix === "" ? "border-brand bg-accent" : "border-input"
            }`}
          >
            <input type="radio" name="statut" checked={choix === ""} onChange={() => setChoix("")} />
            🔄 Automatique — actuellement : <StatusBadge tone={badgeAuto[0]}>{badgeAuto[1]}</StatusBadge>
          </label>
          {STATUTS_MANUELS.map((s) => (
            <label
              key={s}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
                choix === s ? "border-brand bg-accent" : "border-input"
              }`}
            >
              <input type="radio" name="statut" checked={choix === s} onChange={() => setChoix(s)} />
              {statutLabel(s)}
            </label>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">
          « Automatique » laisse le système déduire le statut de l&apos;avancement réel. Un choix manuel le fige jusqu&apos;à
          ce que vous reveniez sur Automatique.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onFermer}>
            Annuler
          </Button>
          <Button
            onClick={() => {
              if (choix !== commande.statutManuel) onSave(commande.id, "statutManuel", choix);
              onFermer();
            }}
          >
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ═══════════ choix des colonnes ═══════════ */

function DialogColonnes({
  masquees,
  planning,
  onChange,
  onFermer,
}: {
  masquees: ReadonlySet<CleColonne>;
  planning: boolean;
  onChange: (s: ReadonlySet<CleColonne>) => void;
  onFermer: () => void;
}) {
  /* Prix et marge ne sont pas masqués en planning : ils n'y existent pas. Les
   * proposer laisserait croire qu'on peut les rallumer. */
  const colonnes = planning
    ? COLONNES_COMMANDE.filter((c) => !COLONNES_ARGENT.includes(c.cle))
    : COLONNES_COMMANDE;

  const basculer = (cle: CleColonne, montrer: boolean) => {
    const s = new Set(masquees);
    if (montrer) s.delete(cle);
    else s.add(cle);
    onChange(s);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onFermer()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>🧰 Colonnes à afficher</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          {planning
            ? "Le réglage vaut aussi pour l'impression de la sélection. Prix et marge ne figurent jamais sur cet écran. Il est mémorisé sur ce poste."
            : "Le réglage vaut aussi pour l'impression de la sélection : c'est ce qui permet de donner la liste à l'atelier sans les prix. Il est mémorisé sur ce poste."}
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          {colonnes.map((c) => (
            <label
              key={c.cle}
              className="flex cursor-pointer items-center gap-2 rounded-md border border-input px-2 py-1.5 text-xs"
            >
              <input
                type="checkbox"
                checked={!masquees.has(c.cle)}
                onChange={(e) => basculer(c.cle, e.target.checked)}
              />
              {c.label}
            </label>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {!planning && (
            <Button size="sm" variant="outline" onClick={() => onChange(new Set(COLONNES_ARGENT))}>
              👥 Vue équipe (masquer prix &amp; marge)
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => onChange(new Set())}>
            Tout afficher
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={onFermer}>Fermer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
