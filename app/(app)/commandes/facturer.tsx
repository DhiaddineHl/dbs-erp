"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { resteAFacturer } from "@/lib/domain/facturation-commande";
import type { CommandeRow } from "@/lib/services/commandes";
import type { CibleFacture } from "@/lib/services/facturation-commande";
import * as F from "@/lib/actions/facturation-commande";

const nb = new Intl.NumberFormat("fr-FR");
const eur = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

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
  const [cibles, setCibles] = useState<CibleFacture[]>([]);
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    let vivant = true;
    F.chargerCibles(commande.client, commande.id).then((r) => {
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
  }, [commande.client, commande.id]);

  const qteRetenue = Math.min(reste, Math.max(1, Math.round(qte || 0)));
  const montant = Math.round(qteRetenue * (pu || 0) * 100) / 100;
  const complete = commande.factureQte + qteRetenue >= commande.qte;

  const valider = () =>
    start(async () => {
      const r = await F.facturerCommande(commande.id, {
        qte: qteRetenue,
        pu,
        ref,
        desig,
        cible: cible === NOUVELLE ? undefined : cible,
        numero: cible === NOUVELLE ? numero : undefined,
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
          Qté commande : <b>{nb.format(commande.qte)}</b> · Déjà facturé :{" "}
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
          <Champ label="PU HT (€)">
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
                    Ajouter à {f.num} ({nb.format(f.pieces)} pcs · {eur.format(f.total)} €)
                  </option>
                ))}
              </select>
            </Champ>
          </div>
          {cible === NOUVELLE && (
            <div className="sm:col-span-2">
              <Champ label="N° de facture (modifiable — suivez votre numérotation)">
                <input
                  value={numero}
                  onChange={(e) => setNumero(e.target.value)}
                  className="w-full rounded-md border border-input bg-card px-2 py-1.5 text-xs"
                />
              </Champ>
            </div>
          )}
        </div>

        <div className="rounded-lg bg-accent/40 px-3 py-2 text-xs">
          Montant de la ligne : <b>{eur.format(montant)} €</b> ({nb.format(qteRetenue)} × {pu} €)
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
