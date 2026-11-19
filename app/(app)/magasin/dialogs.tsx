"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { aEntrerInterne, CONTROLES_BR, type AlerteReception } from "@/lib/domain/aval";
import type { BrRow, CommandeAval as CommandeAvalBase } from "@/lib/services/aval";

/** Commande vue du magasin : avec ses tailles quand on les connaît. */
type CommandeAval = CommandeAvalBase & { tailles?: string[] };
import * as A from "@/lib/actions/aval";

const nb = new Intl.NumberFormat("fr-FR");
const auj = () => new Date().toISOString().slice(0, 10);
const champ = "w-full rounded-md border border-input bg-card px-2 py-1.5 text-xs";

export function Champ({ label, children, large }: { label: string; children: React.ReactNode; large?: boolean }) {
  return (
    <div className={large ? "sm:col-span-2" : undefined}>
      <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function Contexte({ c }: { c: CommandeAval }) {
  const reste = Math.max(0, c.qte - c.produit);
  return (
    <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted px-3 py-2 text-xs sm:grid-cols-4">
      <span>
        Commandé <b>{nb.format(c.qte)}</b>
      </span>
      <span>
        Produit <b>{nb.format(c.produit)}</b>
      </span>
      <span>
        En stock <b>{nb.format(c.stockQte)}</b>
      </span>
      <span>
        Reste à produire <b className={reste ? "text-[var(--danger-d)]" : ""}>{nb.format(reste)}</b>
      </span>
    </div>
  );
}

/** Rangement par taille : une case par taille. Remplie, elle donne la
 * quantité (la somme) ; vide, l'entrée reste « non ventilée ». */
export function GrilleTailles({ tailles, valeurs, onChange, titre }: { tailles: string[]; valeurs: Record<string, string>; onChange: (v: Record<string, string>) => void; titre: string }) {
  if (!tailles.length) return null;
  const total = tailles.reduce((s, t) => s + (Number(valeurs[t]) || 0), 0);
  return (
    <div className="rounded-lg border px-3 py-2">
      <div className="mb-1 flex items-baseline justify-between text-[11px] font-semibold text-muted-foreground">
        <span>{titre}</span>
        <span>{total > 0 ? `${nb.format(total)} pcs` : "facultatif (sinon : non ventilé)"}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {tailles.map((t) => (
          <label key={t} className="flex flex-col items-center text-[11px] font-bold">
            {t}
            <input
              inputMode="numeric"
              value={valeurs[t] ?? ""}
              onChange={(e) => onChange({ ...valeurs, [t]: e.target.value.replace(/\D/g, "") })}
              className="h-8 w-14 rounded-md border border-input bg-card text-center text-xs"
            />
          </label>
        ))}
      </div>
    </div>
  );
}
const sommeGrille = (v: Record<string, string>) => Object.values(v).reduce((s, x) => s + (Number(x) || 0), 0);

/* ─────────── réception façonnier (BR) ─────────── */

export function DialogReceptionSt({
  commandes,
  initiale,
  onFermer,
}: {
  commandes: CommandeAval[];
  initiale?: CommandeAval | null;
  onFermer: () => void;
}) {
  const router = useRouter();
  const [faconnier, setFaconnier] = useState(initiale?.faconnier ?? "");
  const [commandeId, setCommandeId] = useState(initiale ? String(initiale.id) : "");
  const [date, setDate] = useState(auj());
  const [recue, setRecue] = useState("");
  const [conforme, setConforme] = useState("");
  const [nc, setNc] = useState("");
  const [controle, setControle] = useState("ok");
  const [note, setNote] = useState("");
  const [grille, setGrille] = useState<Record<string, string>>({});
  const [recus, setRecus] = useState<AlerteReception[]>([]);
  const [pending, start] = useTransition();

  /* Seules les commandes sous-traitées et non terminées sont réceptionnables. */
  const faconniers = useMemo(
    () => [...new Set(commandes.filter((c) => c.faconnier && c.produit < c.qte).map((c) => c.faconnier))].sort(),
    [commandes],
  );
  const disponibles = useMemo(
    () => commandes.filter((c) => c.faconnier === faconnier && (c.produit < c.qte || String(c.id) === commandeId)),
    [commandes, faconnier, commandeId],
  );
  const choisie = disponibles.find((c) => String(c.id) === commandeId) ?? null;
  const refuse = controle === "refuse";

  // Aperçu des contrôles, calculé côté serveur avec la même règle que l'enregistrement.
  useEffect(() => {
    if (!choisie || !recue) return;
    let vivant = true;
    const t = setTimeout(async () => {
      const r = await A.verifierReception(choisie.id, Number(recue) || 0, conforme === "" ? null : Number(conforme) || 0, Number(nc) || 0, controle);
      if (vivant && r.ok) setRecus(r.data ?? []);
    }, 250);
    return () => {
      vivant = false;
      clearTimeout(t);
    };
  }, [choisie, recue, conforme, nc, controle]);

  const alertes = choisie && recue ? recus : [];
  const bloquant = alertes.find((a) => a.niveau === "bloquant");
  const avertissement = alertes.find((a) => a.niveau === "warn");
  const parTaille = sommeGrille(grille);
  const conformeEffectif = refuse ? 0 : parTaille > 0 ? parTaille : conforme === "" ? Math.max(0, (Number(recue) || 0) - (Number(nc) || 0)) : Number(conforme) || 0;

  const enregistrer = (forcer: boolean) =>
    start(async () => {
      if (!choisie) return;
      const r = await A.creerBr({
        commandeId: choisie.id, date, qteRecue: recue, qteOk: refuse ? "0" : parTaille > 0 ? String(parTaille) : conforme, qteNc: nc, controle, note, forcer,
        tailles: refuse ? {} : grille,
      });
      if (!r.ok) return void toast.error(r.error);
      toast.success(
        conformeEffectif > 0
          ? `${r.data!.numero} — ${nb.format(conformeEffectif)} pcs entrées au stock`
          : `${r.data!.numero} enregistré — rien n'entre au stock (lot refusé)`,
      );
      onFermer();
      router.refresh();
    });

  return (
    <Dialog open onOpenChange={(o) => !o && onFermer()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>📥 Réception façonnier (bon de réception)</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <Champ label="Façonnier *">
            <select
              value={faconnier}
              onChange={(e) => {
                setFaconnier(e.target.value);
                setCommandeId("");
              }}
              className={champ}
            >
              <option value="">— Choisir —</option>
              {faconniers.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </Champ>
          <Champ label="Date *">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={champ} />
          </Champ>
          <Champ label="Commande *" large>
            <select value={commandeId} onChange={(e) => setCommandeId(e.target.value)} disabled={!faconnier} className={`${champ} disabled:opacity-60`}>
              <option value="">{faconnier ? "— Choisir —" : "Choisissez d'abord un façonnier"}</option>
              {disponibles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.of} · {c.modele} (reste {nb.format(Math.max(0, c.qte - c.produit))} pcs)
                </option>
              ))}
            </select>
          </Champ>
          {choisie && (
            <div className="sm:col-span-2">
              <Contexte c={choisie} />
            </div>
          )}
          <Champ label="Qté reçue *">
            <input type="number" min={0} value={recue} onChange={(e) => setRecue(e.target.value)} className={`${champ} text-right`} />
          </Champ>
          <Champ label="Contrôle">
            <select value={controle} onChange={(e) => setControle(e.target.value)} className={champ}>
              {CONTROLES_BR.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </Champ>
          <Champ label="Qté non conforme">
            <input
              type="number"
              min={0}
              value={refuse ? recue : nc}
              disabled={refuse}
              onChange={(e) => setNc(e.target.value)}
              className={`${champ} text-right disabled:opacity-60`}
            />
          </Champ>
          <Champ label="Qté conforme (entre au stock)">
            <input
              type="number"
              min={0}
              value={refuse ? "0" : conforme}
              disabled={refuse}
              onChange={(e) => setConforme(e.target.value)}
              placeholder={recue ? `${conformeEffectif} (= reçu − NC)` : "= reçu − NC"}
              className={`${champ} text-right disabled:opacity-60`}
            />
          </Champ>
          {choisie && !refuse && (choisie.tailles?.length ?? 0) > 0 && (
            <div className="sm:col-span-2">
              <GrilleTailles tailles={choisie.tailles!} valeurs={grille} onChange={setGrille} titre="Conformes rangés par taille" />
            </div>
          )}
          <Champ label="Observations" large>
            <input value={note} onChange={(e) => setNote(e.target.value)} className={champ} />
          </Champ>
        </div>

        {refuse && (
          <div className="rounded-lg border border-[var(--danger)] bg-[var(--danger-l)] px-3 py-2 text-xs text-[var(--danger-d)]">
            Lot refusé : rien n&apos;entre au stock, toutes les pièces sont comptées non conformes. Vous pourrez ensuite
            les réintégrer après retouche ou les passer au rebut.
          </div>
        )}
        {alertes.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {alertes.map((a, i) => (
              <div
                key={i}
                className={`rounded-lg px-3 py-2 text-xs ${
                  a.niveau === "bloquant"
                    ? "border border-[var(--danger)] bg-[var(--danger-l)] text-[var(--danger-d)]"
                    : a.niveau === "warn"
                      ? "border border-warning bg-warning-muted"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {a.niveau === "bloquant" ? "⛔ " : a.niveau === "warn" ? "⚠ " : "📊 "}
                {a.message}
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onFermer}>
            Annuler
          </Button>
          <Button
            disabled={pending || !choisie || !recue || !!bloquant}
            variant={avertissement ? "destructive" : "default"}
            onClick={() => enregistrer(!!avertissement)}
          >
            {avertissement ? "Enregistrer malgré l'avertissement" : "Enregistrer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────── entrée de production interne ─────────── */

export function DialogEntreeInterne({ commande: c, onFermer }: { commande: CommandeAval; onFermer: () => void }) {
  const router = useRouter();
  /* Proposition : ce que la GPAO a produit et qui n'est pas encore entré au
   * magasin. Plus besoin de recompter à la main. */
  const aEntrer = aEntrerInterne(c);
  const [date, setDate] = useState(auj());
  const [qte, setQte] = useState(aEntrer > 0 ? String(aEntrer) : "");
  const [note, setNote] = useState("");
  /* Après contrôle et finition, les pièces se rangent PAR TAILLE. */
  const [grille, setGrille] = useState<Record<string, string>>({});
  const parTaille = sommeGrille(grille);
  const qteEffective = parTaille > 0 ? String(parTaille) : qte;
  const [pending, start] = useTransition();

  return (
    <Dialog open onOpenChange={(o) => !o && onFermer()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            📥 Entrée production interne — {c.of} · {c.modele}
          </DialogTitle>
        </DialogHeader>
        <Contexte c={c} />
        <div className="rounded-lg border px-3 py-2 text-xs">
          Sorti des chaînes (GPAO) : <b>{nb.format(c.produitGpao)}</b> pcs · déjà entré au magasin :{" "}
          <b>{nb.format(c.entreesInternes)}</b> ·{" "}
          {aEntrer > 0 ? (
            <>
              <b className="text-brand">{nb.format(aEntrer)}</b> pcs à entrer
            </>
          ) : (
            "rien de nouveau depuis la GPAO"
          )}
          {c.gpaoExcedent > 0 && (
            <div className="mt-1 font-semibold text-warning-foreground">
              ⚠ production GPAO en trop : {nb.format(c.gpaoExcedent)} pcs au-delà de la commande et de ses OF frères, à vérifier (non proposées ici).
            </div>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Champ label="Date">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={champ} />
          </Champ>
          <Champ label="Quantité entrée *">
            <input type="number" min={0} value={qteEffective} disabled={parTaille > 0} onChange={(e) => setQte(e.target.value)} className={`${champ} text-right disabled:opacity-70`} />
          </Champ>
          {(c.tailles?.length ?? 0) > 0 && (
            <div className="sm:col-span-2">
              <GrilleTailles tailles={c.tailles!} valeurs={grille} onChange={setGrille} titre="Rangées par taille (après contrôle et finition)" />
            </div>
          )}
          <Champ label="Observations" large>
            <input value={note} onChange={(e) => setNote(e.target.value)} className={champ} />
          </Champ>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFermer}>
            Annuler
          </Button>
          <Button
            disabled={pending || !(Number(qteEffective) > 0)}
            onClick={() =>
              start(async () => {
                const r = await A.receptionMagasin({ commandeId: c.id, date, qte: qteEffective, note, tailles: grille });
                if (!r.ok) return void toast.error(r.error);
                toast.success(`${nb.format(Number(qteEffective))} pcs entrées au stock${parTaille > 0 ? " (rangées par taille)" : ""}`);
                onFermer();
                router.refresh();
              })
            }
          >
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────── non conformes : retouche ou rebut ─────────── */

export function DialogNc({ br, decision, onFermer }: { br: BrRow; decision: "retouche" | "rebut"; onFermer: () => void }) {
  const router = useRouter();
  const [qte, setQte] = useState(String(br.ncAttente));
  const [date, setDate] = useState(auj());
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const retouche = decision === "retouche";

  return (
    <Dialog open onOpenChange={(o) => !o && onFermer()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {retouche ? "↩ Réintégrer après retouche" : "🗑 Mettre au rebut"} — {br.numero}
          </DialogTitle>
        </DialogHeader>
        <div className="rounded-lg bg-muted px-3 py-2 text-xs">
          {br.of} · {br.modele} · {br.faconnier} — non conformes reçues <b>{nb.format(br.qteNc)}</b>, déjà traitées{" "}
          <b>{nb.format(br.ncRetouchees + br.ncRebut)}</b>, en attente <b className="text-[var(--danger-d)]">{nb.format(br.ncAttente)}</b>
        </div>
        <div className="text-xs text-muted-foreground">
          {retouche
            ? "Les pièces retouchées entrent au stock et comptent comme produites."
            : "Les pièces au rebut sont sorties du suivi : elles n'entrent pas au stock et ne comptent pas comme produites."}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Champ label="Date">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={champ} />
          </Champ>
          <Champ label="Quantité *">
            <input type="number" min={0} max={br.ncAttente} value={qte} onChange={(e) => setQte(e.target.value)} className={`${champ} text-right`} />
          </Champ>
          <Champ label="Observations" large>
            <input value={note} onChange={(e) => setNote(e.target.value)} className={champ} />
          </Champ>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFermer}>
            Annuler
          </Button>
          <Button
            variant={retouche ? "default" : "destructive"}
            disabled={pending || !(Number(qte) > 0) || Number(qte) > br.ncAttente}
            onClick={() =>
              start(async () => {
                const r = await A.traiterNc({ brId: br.id, decision, qte, date, note });
                if (!r.ok) return void toast.error(r.error);
                toast.success(retouche ? `${qte} pcs réintégrées au stock` : `${qte} pcs mises au rebut`);
                onFermer();
                router.refresh();
              })
            }
          >
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
