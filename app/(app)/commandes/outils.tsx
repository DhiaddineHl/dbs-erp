"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import * as A from "@/lib/actions/commandes";

const nb = new Intl.NumberFormat("fr-FR");
const eur = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const dec = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateFr = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split("-").reverse().join("/") : "—");
const horodatage = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

const LIBELLE_CHAMP: Record<string, string> = { prixVente: "Prix de vente", prixFacon: "Prix façon" };
const montant = (n: number | null) => (n == null ? "—" : `${dec.format(n)} €`);

/* ═══════════ B16 · journal des prix ═══════════ */

/** Qui a changé quel prix, quand, et de combien.
 *
 * Le journal est écrit depuis le début à chaque modification de prix ; il
 * n'avait simplement pas d'écran. Il est en ajout seul : supprimer la commande
 * détache ses entrées au lieu de les effacer. */
export function DialogPrix({
  commandeId,
  titre,
  onFermer,
}: {
  commandeId: number;
  titre: string;
  onFermer: () => void;
}) {
  const [mouvements, setMouvements] = useState<A.MouvementPrix[] | null>(null);
  const [erreur, setErreur] = useState("");

  useEffect(() => {
    let vivant = true;
    A.historiquePrix(commandeId).then((r) => {
      if (!vivant) return;
      if (r.ok) setMouvements(r.data);
      else setErreur(r.error);
    });
    return () => {
      vivant = false;
    };
  }, [commandeId]);

  return (
    <Dialog open onOpenChange={(o) => !o && onFermer()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>📈 Journal des prix — {titre}</DialogTitle>
        </DialogHeader>

        {erreur ? (
          <div className="rounded-lg bg-muted px-4 py-6 text-center text-xs text-[var(--danger-d)]">{erreur}</div>
        ) : mouvements === null ? (
          <div className="px-4 py-6 text-center text-xs text-muted-foreground">Chargement…</div>
        ) : mouvements.length === 0 ? (
          <div className="rounded-lg bg-muted px-4 py-6 text-center text-xs">
            Aucun mouvement : les prix n&apos;ont pas changé depuis la création de la commande.
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto rounded-lg border">
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 bg-muted/70 backdrop-blur">
                <tr className="text-[10px] uppercase text-muted-foreground">
                  <th className="px-2 py-1.5 text-left">Date</th>
                  <th className="px-2 py-1.5 text-left">Champ</th>
                  <th className="px-2 py-1.5 text-right">Avant</th>
                  <th className="px-2 py-1.5 text-right">Après</th>
                  <th className="px-2 py-1.5 text-right">Écart</th>
                  <th className="px-2 py-1.5 text-left">Par</th>
                </tr>
              </thead>
              <tbody>
                {mouvements.map((m) => {
                  /* L'écart n'a de sens que d'un montant à un autre : une
                   * première saisie part de « rien », pas de zéro. */
                  const ecart = m.ancien == null || m.nouveau == null ? null : m.nouveau - m.ancien;
                  return (
                    <tr key={m.id} className="border-t">
                      <td className="px-2 py-1.5 tabular-nums text-muted-foreground">{horodatage(m.ts)}</td>
                      <td className="px-2 py-1.5">{LIBELLE_CHAMP[m.champ] ?? m.champ}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{montant(m.ancien)}</td>
                      <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{montant(m.nouveau)}</td>
                      <td
                        className={`px-2 py-1.5 text-right font-bold tabular-nums ${
                          ecart == null ? "" : ecart < 0 ? "text-[var(--danger-d)]" : "text-success-foreground"
                        }`}
                      >
                        {ecart == null ? "—" : `${ecart > 0 ? "+" : ""}${dec.format(ecart)} €`}
                      </td>
                      <td className="px-2 py-1.5 text-muted-foreground">{m.userName || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-[11px] text-muted-foreground">
          Le journal est en ajout seul : aucune entrée ne peut être modifiée ni retirée depuis l&apos;application.
        </p>

        <DialogFooter>
          <Button onClick={onFermer}>Fermer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ═══════════ B11 · doublons ═══════════ */

/** Commandes qui portent le même client, le même modèle et la même référence.
 *
 * L'écran ne fusionne rien : un réassort est un doublon apparent parfaitement
 * légitime. Il montre de quoi trancher — produit, facturé, date d'export — et
 * laisse archiver ou supprimer ce que l'utilisateur a coché. */
export function DialogDoublons({ peutSupprimer, onFermer }: { peutSupprimer: boolean; onFermer: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [groupes, setGroupes] = useState<A.GroupeDoublon[] | null>(null);
  const [retenues, setRetenues] = useState<Set<number>>(new Set());

  const chercher = () =>
    start(async () => {
      const r = await A.listerDoublons();
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setGroupes(r.data);
      setRetenues(new Set());
    });

  const basculer = (id: number) =>
    setRetenues((p) => {
      const s = new Set(p);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });

  const agir = (quoi: "archiver" | "supprimer") =>
    start(async () => {
      const ids = [...retenues];
      const r = quoi === "archiver" ? await A.archiverCommandes(ids, true) : await A.deleteCommandesAction(ids);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`${ids.length} commande(s) ${quoi === "archiver" ? "archivée(s)" : "supprimée(s)"}`);
      onFermer();
      router.refresh();
    });

  const lignes = (groupes ?? []).flatMap((g) => g.lignes);
  const nbDoublons = lignes.length;

  return (
    <Dialog open onOpenChange={(o) => !o && onFermer()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>👯 Doublons de commandes</DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          Sont regroupées les commandes qui partagent <b>client + modèle + référence</b>, archives comprises.
          Attention&nbsp;: un réassort porte légitimement la même clé. Vérifiez la quantité produite et la
          facturation avant de retirer quoi que ce soit — une commande déjà produite ou facturée n&apos;est
          presque jamais un doublon.
        </p>

        {groupes === null ? (
          <div className="rounded-lg border border-dashed px-4 py-8 text-center">
            <Button disabled={pending} onClick={chercher}>
              Chercher les doublons
            </Button>
            <p className="mt-2 text-[11px] text-muted-foreground">Aucune écriture n&apos;est faite à cette étape.</p>
          </div>
        ) : groupes.length === 0 ? (
          <div className="rounded-lg bg-muted px-4 py-6 text-center text-xs">
            ✅ Aucun doublon — chaque commande a une clé client/modèle/référence unique.
          </div>
        ) : (
          <>
            <div className="rounded-lg bg-muted px-3 py-2 text-xs">
              <b>{groupes.length}</b> groupe(s) · {nbDoublons} commande(s) concernée(s) · {retenues.size} cochée(s)
            </div>
            <div className="max-h-96 space-y-3 overflow-y-auto">
              {groupes.map((g) => (
                <div key={g.cle} className="rounded-lg border">
                  <div className="border-b bg-muted/40 px-2 py-1.5 text-[11px] font-semibold">
                    {g.cle} — {g.lignes.length} commandes
                  </div>
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="text-[10px] uppercase text-muted-foreground">
                        <th className="px-2 py-1" />
                        <th className="px-2 py-1 text-left">OF</th>
                        <th className="px-2 py-1 text-left">Couleur</th>
                        <th className="px-2 py-1 text-right">Qté</th>
                        <th className="px-2 py-1 text-right">Produit</th>
                        <th className="px-2 py-1 text-right">Facturé</th>
                        <th className="px-2 py-1 text-left">Export</th>
                        <th className="px-2 py-1 text-right">CA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.lignes.map((c) => {
                        const engagee = c.produit > 0 || c.factureQte > 0;
                        return (
                          <tr key={c.id} className="border-t">
                            <td className="px-2 py-1">
                              <input
                                type="checkbox"
                                checked={retenues.has(c.id)}
                                onChange={() => basculer(c.id)}
                                title={
                                  engagee
                                    ? "Cette commande est déjà produite ou facturée — ce n'est probablement pas un doublon"
                                    : "Retenir cette ligne"
                                }
                              />
                            </td>
                            <td className="px-2 py-1 font-semibold text-brand">
                              {c.of || "—"}
                              {c.archived && (
                                <StatusBadge tone="neutral">
                                  <span className="text-[9px]">archivée</span>
                                </StatusBadge>
                              )}
                            </td>
                            <td className="px-2 py-1 text-muted-foreground">{c.couleur || "—"}</td>
                            <td className="px-2 py-1 text-right tabular-nums">{nb.format(c.qte)}</td>
                            <td
                              className={`px-2 py-1 text-right tabular-nums ${
                                c.produit > 0 ? "font-semibold text-success-foreground" : "text-muted-foreground"
                              }`}
                            >
                              {nb.format(c.produit)}
                            </td>
                            <td
                              className={`px-2 py-1 text-right tabular-nums ${
                                c.factureQte > 0 ? "font-semibold text-purple" : "text-muted-foreground"
                              }`}
                            >
                              {nb.format(c.factureQte)}
                            </td>
                            <td className="px-2 py-1 tabular-nums">{dateFr(c.dateExport)}</td>
                            <td className="px-2 py-1 text-right tabular-nums">{eur.format(c.ca)} €</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onFermer}>
            Fermer
          </Button>
          {retenues.size > 0 && (
            <>
              {peutSupprimer && (
                <Button
                  variant="outline"
                  className="border-[var(--danger)] text-[var(--danger-d)]"
                  disabled={pending}
                  onClick={() => agir("supprimer")}
                >
                  🗑 Supprimer {retenues.size}
                </Button>
              )}
              <Button disabled={pending} onClick={() => agir("archiver")}>
                🗄 Archiver {retenues.size}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ═══════════ B15 · envoi en prévision export ═══════════ */

/** Fixe la date d'export *prévue* d'une sélection.
 *
 * Elle ne remplace pas la date contractuelle : Prévision Export affiche la
 * prévision quand elle existe et retombe sur le contrat sinon. Vider le champ
 * rend donc les lignes à leur date d'origine. */
export function DialogPlanifier({
  commandes,
  onFermer,
}: {
  commandes: { id: number; of: string; modele: string; dateExport: string; exportPrev: string }[];
  onFermer: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  /* Point de départ : la prévision déjà posée, sinon la date contractuelle la
   * plus proche de la sélection — c'est elle qui contraint le lot. */
  const [date, setDate] = useState(() => {
    const dejaPrevues = commandes.map((c) => c.exportPrev).filter(Boolean).sort();
    if (dejaPrevues.length) return dejaPrevues[0];
    const contractuelles = commandes.map((c) => c.dateExport).filter(Boolean).sort();
    return contractuelles[0] ?? "";
  });

  const valider = () =>
    start(async () => {
      const r = await A.planifierExport(
        commandes.map((c) => c.id),
        date,
      );
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(
        date
          ? `${r.data} commande(s) planifiée(s) au ${dateFr(date)}`
          : `${r.data} commande(s) rendue(s) à leur date contractuelle`,
      );
      onFermer();
      router.refresh();
    });

  const decalees = commandes.filter((c) => c.dateExport && date && date > c.dateExport);

  return (
    <Dialog open onOpenChange={(o) => !o && onFermer()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>🚢 Envoyer en Prévision Export</DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          Vous fixez la date d&apos;export <b>prévue</b> de {commandes.length} commande(s). La date contractuelle
          n&apos;est pas touchée&nbsp;: l&apos;engagement pris envers le client reste ce qu&apos;il est, on note ici
          ce que l&apos;atelier pense pouvoir tenir.
        </p>

        <div>
          <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">Date d&apos;export prévue</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-md border border-input bg-card px-2 py-1.5 text-xs"
          />
          <p className="mt-1 text-[10.5px] text-muted-foreground">
            Laissez vide pour retirer la prévision et revenir à la date contractuelle.
          </p>
        </div>

        {decalees.length > 0 && (
          <div className="rounded-lg bg-[var(--danger-bg,var(--muted))] px-3 py-2 text-[11px]">
            ⚠ {decalees.length} commande(s) seraient prévues <b>après</b> leur date contractuelle — elles
            apparaîtront en retard dans Prévision Export.
          </div>
        )}

        <div className="max-h-48 overflow-y-auto rounded-lg border text-[11px]">
          <table className="w-full">
            <thead className="sticky top-0 bg-muted/70 backdrop-blur">
              <tr className="text-[10px] uppercase text-muted-foreground">
                <th className="px-2 py-1 text-left">OF</th>
                <th className="px-2 py-1 text-left">Modèle</th>
                <th className="px-2 py-1 text-left">Contractuelle</th>
                <th className="px-2 py-1 text-left">Prévue</th>
              </tr>
            </thead>
            <tbody>
              {commandes.map((c) => (
                <tr key={c.id} className="border-t">
                  <td className="px-2 py-1 font-semibold text-brand">{c.of || "—"}</td>
                  <td className="px-2 py-1">{c.modele}</td>
                  <td className="px-2 py-1 tabular-nums text-muted-foreground">{dateFr(c.dateExport)}</td>
                  <td className="px-2 py-1 tabular-nums">
                    {c.exportPrev ? dateFr(c.exportPrev) : <span className="text-muted-foreground">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFermer}>
            Annuler
          </Button>
          <Button disabled={pending} onClick={valider}>
            {date ? "Planifier" : "Retirer la prévision"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
