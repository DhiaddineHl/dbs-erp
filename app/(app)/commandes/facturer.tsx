"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { resteAFacturer } from "@/lib/domain/facturation-commande";
import { DEVISES, calculerTotaux, formatMontant } from "@/lib/domain/montants";
import type { CommandeRow } from "@/lib/services/commandes";
import type { CibleFacture } from "@/lib/services/facturation-commande";
import * as F from "@/lib/actions/facturation-commande";

const nb = new Intl.NumberFormat("fr-FR");

const NOUVELLE = "__new__";

/** Facturer tout ou partie d'une commande.
 *
 * Deux choses que l'écran doit rendre évidentes : on peut ne facturer qu'une
 * partie (le reste continue de vivre), et on peut ajouter la ligne à une
 * facture existante du même client plutôt que d'en créer une de plus. */
export function DialogFacturer({ commande, onFermer }: { commande: CommandeRow; onFermer: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const reste = resteAFacturer(commande);
  const [qte, setQte] = useState(reste);
  const [pu, setPu] = useState(commande.prixVente ?? 0);
  const [ref, setRef] = useState(commande.refArticle);
  const [desig, setDesig] = useState(commande.note || commande.modele);
  const [cible, setCible] = useState(NOUVELLE);
  const [numero, setNumero] = useState("");
  // TVA de la nouvelle facture : 0 % par défaut, saisie libre.
  const [tauxTva, setTauxTva] = useState("0");
  const [cibles, setCibles] = useState<CibleFacture[]>([]);
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    let vivant = true;
    F.chargerCibles(commande.client, commande.id, commande.devise).then((r) => {
      if (!vivant) return;
      if (r.ok && r.data) {
        setCibles(r.data.cibles);
        setNumero(r.data.numero);
      }
      setChargement(false);
    });
    return () => {
      vivant = false;
    };
  }, [commande.client, commande.id, commande.devise]);

  const qteRetenue = Math.min(reste, Math.max(1, Math.round(qte || 0)));
  const devise = commande.devise;
  const sym = DEVISES[devise].symbole;
  const montant = Math.round(qteRetenue * (pu || 0) * 100) / 100;
  // Regroupée, la ligne prend le taux de la facture existante.
  const cibleChoisie = cibles.find((f) => f.num === cible);
  const tauxEffectif = cibleChoisie ? cibleChoisie.tauxTva : parseFloat(tauxTva.replace(",", ".")) || 0;
  const tva = calculerTotaux({ montantsHt: [montant], tauxTva: tauxEffectif, devise });
  // Complète au regard de ce dont CETTE ligne répond : sur une commande
  // découpée, les parts se facturent chacune de leur côté.
  const complete = commande.factureQte + qteRetenue >= commande.qtePropre;

  const valider = () =>
    start(async () => {
      const r = await F.facturerCommande(commande.id, {
        qte: qteRetenue,
        pu,
        ref,
        desig,
        cible: cible === NOUVELLE ? undefined : cible,
        numero: cible === NOUVELLE ? numero : undefined,
        tauxTva: cible === NOUVELLE ? tauxEffectif : undefined,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      const d = r.data!;
      toast.success(
        `${nb.format(d.qte)} pcs facturées sur ${d.numero}` +
          (d.regroupee ? " (regroupée)" : "") +
          (d.complete ? " — commande soldée et archivée" : ` — reste ${nb.format(d.reste)} à facturer`),
      );
      onFermer();
      router.refresh();
    });

  return (
    <Dialog open onOpenChange={(o) => !o && onFermer()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>📋 Facturer — {commande.modele}</DialogTitle>
        </DialogHeader>

        <div className="rounded-lg bg-muted px-3 py-2 text-xs leading-relaxed">
          <b>{commande.modele}</b> · {commande.refArticle || "—"} ·{" "}
          <span className="text-muted-foreground">{commande.client || "sans client"}</span>
          <br />
          Qté à facturer : <b>{nb.format(commande.qtePropre)}</b>
          {commande.qteAffectee > 0 && (
            <span className="text-muted-foreground">
              {" "}
              (sur {nb.format(commande.qte)} — {nb.format(commande.qteAffectee)} en sous-commandes, facturées à
              part)
            </span>
          )}{" "}
          · Déjà facturé :{" "}
          <b className="text-purple">{nb.format(commande.factureQte)}</b> · Reste :{" "}
          <b className="text-accent-foreground">{nb.format(reste)}</b>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Champ label="Quantité à facturer *">
            <input
              type="number"
              min={1}
              max={reste}
              value={qte}
              onChange={(e) => setQte(Number(e.target.value))}
              className="w-full rounded-md border border-input bg-card px-2 py-1.5 text-xs"
            />
          </Champ>
          <Champ label={`PU HT (${sym})`}>
            <input
              type="number"
              step="0.01"
              value={pu}
              onChange={(e) => setPu(Number(e.target.value))}
              className="w-full rounded-md border border-input bg-card px-2 py-1.5 text-xs"
            />
          </Champ>
          <Champ label="Référence">
            <input
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              className="w-full rounded-md border border-input bg-card px-2 py-1.5 text-xs"
            />
          </Champ>
          <Champ label="Désignation">
            <input
              value={desig}
              onChange={(e) => setDesig(e.target.value)}
              className="w-full rounded-md border border-input bg-card px-2 py-1.5 text-xs"
            />
          </Champ>
          <div className="sm:col-span-2">
            <Champ label="Facture cible">
              <select
                value={cible}
                onChange={(e) => setCible(e.target.value)}
                disabled={chargement}
                className="w-full rounded-md border border-input bg-card px-2 py-1.5 text-xs"
              >
                <option value={NOUVELLE}>➕ Nouvelle facture</option>
                {cibles.map((f) => (
                  <option key={`${f.num}|${f.type}`} value={f.num}>
                    Ajouter à {f.num} ({nb.format(f.pieces)} pcs · {formatMontant(f.total, f.devise)} HT
                    {f.tauxTva > 0 ? ` · TVA ${f.tauxTva} %` : ""})
                  </option>
                ))}
              </select>
            </Champ>
          </div>
          {cible === NOUVELLE && (
            <>
              <Champ label="N° de facture (modifiable — suivez votre numérotation)">
                <input
                  value={numero}
                  onChange={(e) => setNumero(e.target.value)}
                  className="w-full rounded-md border border-input bg-card px-2 py-1.5 text-xs"
                />
              </Champ>
              <Champ label="TVA (%) — 0 si non soumis">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={tauxTva}
                  onChange={(e) => setTauxTva(e.target.value)}
                  className="w-full rounded-md border border-input bg-card px-2 py-1.5 text-xs"
                />
              </Champ>
            </>
          )}
        </div>

        <div className="rounded-lg bg-accent/40 px-3 py-2 text-xs">
          Montant de la ligne : <b>{formatMontant(montant, devise)} HT</b> ({nb.format(qteRetenue)} × {pu} {sym})
          {tauxEffectif > 0 && (
            <>
              {" "}
              · TVA {tauxEffectif} % {formatMontant(tva.montantTva, devise)} · <b>{formatMontant(tva.totalTtc, devise)} TTC</b>
            </>
          )}
          {complete ? (
            <span className="ml-2 text-success-foreground">— la commande sera soldée et archivée</span>
          ) : (
            <span className="ml-2 text-muted-foreground">
              — il restera {nb.format(commande.qte - commande.factureQte - qteRetenue)} pièce(s) à facturer
            </span>
          )}
        </div>

        <p className="text-[11px] text-muted-foreground">
          💡 Choisissez «&nbsp;Ajouter à…&nbsp;» pour regrouper plusieurs commandes du même client sur une seule
          facture. Réduisez la quantité pour ne facturer qu&apos;une partie&nbsp;: le reste pourra l&apos;être plus tard.
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={onFermer}>
            Annuler
          </Button>
          <Button
            disabled={pending || chargement || reste <= 0 || (cible === NOUVELLE && !numero.trim())}
            onClick={valider}
          >
            Facturer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Champ({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
