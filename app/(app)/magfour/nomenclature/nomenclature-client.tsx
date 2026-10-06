"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { SectionPanel } from "@/components/shared/section-panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ORIGINES_FOURNITURE, prevuNomenclature } from "@/lib/domain/fournitures";
import type { ModeleNomenclature } from "@/lib/services/fournitures";
import type { CatalogueFournitureRow } from "@/lib/services/preparation";
import * as A from "@/lib/actions/fournitures";
import { ENTREPRISE } from "@/lib/entreprise";

const nb = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 });
type R = { ok: true; synchronisees?: number } | { ok: false; error: string };

/* Nomenclature fournitures par modèle : 7 boutons, 1 zip, 2 étiquettes… par
 * pièce, + % de casse. Chaque modification recalcule le « prévu » de toutes
 * les commandes en cours du modèle (lignes marquées 📋 sur la fiche). */
export function NomenclatureClient({
  modeles,
  catalogue,
  peutSaisir,
  rechercheInitiale,
}: {
  modeles: ModeleNomenclature[];
  catalogue: CatalogueFournitureRow[];
  peutSaisir: boolean;
  rechercheInitiale: string;
}) {
  const [q, setQ] = useState(rechercheInitiale);
  const [sansSeulement, setSansSeulement] = useState(false);
  const vus = useMemo(() => {
    const n = q.trim().toLowerCase();
    return modeles.filter(
      (m) =>
        (!sansSeulement || m.lignes.length === 0) &&
        (!n || `${m.label} ${m.clients.join(" ")} ${m.commandes.map((c) => c.of).join(" ")}`.toLowerCase().includes(n)),
    );
  }, [modeles, q, sansSeulement]);
  const sans = modeles.filter((m) => m.lignes.length === 0 && m.commandes.length > 0).length;
  const avecNomen = modeles.filter((m) => m.lignes.length > 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Modèle, référence, client, OF…" className="h-8 w-64 bg-card" />
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={sansSeulement} onChange={(e) => setSansSeulement(e.target.checked)} />
          Seulement les modèles sans nomenclature ({sans})
        </label>
        <datalist id="catalogue-fournitures">
          {catalogue.map((c) => (
            <option key={c.id} value={c.designation} />
          ))}
        </datalist>
      </div>
      {vus.length === 0 ? (
        <SectionPanel title="Nomenclature">
          <div className="py-8 text-center text-xs text-muted-foreground">Aucun modèle.</div>
        </SectionPanel>
      ) : (
        vus.map((m) => <CarteModele key={m.cle} m={m} modelesSources={avecNomen} catalogue={catalogue} peutSaisir={peutSaisir} />)
      )}
    </div>
  );
}

function CarteModele({
  m,
  modelesSources,
  catalogue,
  peutSaisir,
}: {
  m: ModeleNomenclature;
  modelesSources: ModeleNomenclature[];
  catalogue: CatalogueFournitureRow[];
  peutSaisir: boolean;
}) {
  const run = useRun();
  const [source, setSource] = useState("");
  const piecesRef = m.commandes[0]?.pieces ?? 0;
  return (
    <SectionPanel
      title={m.label}
      actions={
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          {m.clients.map((c) => (
            <StatusBadge key={c} tone="info">
              {c}
            </StatusBadge>
          ))}
          {m.commandes.map((c) => (
            <span key={c.id} className="rounded border px-1.5 py-0.5">
              {c.of} · {nb.format(c.pieces)} pcs{c.lancee ? " · lancée" : ""}
            </span>
          ))}
        </div>
      }
    >
      {m.lignes.length === 0 ? (
        <div className="mb-2 text-xs text-warning-foreground">
          ⚠ Pas de nomenclature : le prévu des fournitures de ce modèle se saisit encore à la main.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/40 text-[10.5px] uppercase text-muted-foreground">
                <th className="px-2 py-1.5 text-left">Fourniture</th>
                <th className="px-2 py-1.5 text-center">Par pièce</th>
                <th className="px-2 py-1.5 text-center">Unité</th>
                <th className="px-2 py-1.5 text-center">Casse %</th>
                <th className="px-2 py-1.5 text-left">Origine</th>
                <th className="px-2 py-1.5 text-left">Fournisseur (si {ENTREPRISE.nomCourt})</th>
                <th className="px-2 py-1.5 text-right">Prévu pour {nb.format(piecesRef)} pcs</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {m.lignes.map((l) => (
                <tr key={l.id} className="border-b last:border-0">
                  <td className="px-2 py-1">
                    <Champ valeur={l.designation} actif={peutSaisir} liste="catalogue-fournitures" onSave={(v) => A.majLigneNomenclature(l.id, "designation", v)} />
                  </td>
                  <td className="w-24 px-2 py-1">
                    <Champ valeur={String(l.qteParPiece)} actif={peutSaisir} centre onSave={(v) => A.majLigneNomenclature(l.id, "qteParPiece", v)} />
                  </td>
                  <td className="w-20 px-2 py-1">
                    <Champ valeur={l.unite} actif={peutSaisir} centre onSave={(v) => A.majLigneNomenclature(l.id, "unite", v)} />
                  </td>
                  <td className="w-20 px-2 py-1">
                    <Champ valeur={String(l.cassePct)} actif={peutSaisir} centre onSave={(v) => A.majLigneNomenclature(l.id, "cassePct", v)} />
                  </td>
                  <td className="w-32 px-2 py-1">
                    <select
                      value={l.origine}
                      disabled={!peutSaisir}
                      onChange={(e) => run(() => A.majLigneNomenclature(l.id, "origine", e.target.value), "Origine enregistrée")}
                      className="h-8 w-full rounded-md border border-input bg-card px-1 text-xs"
                    >
                      {ORIGINES_FOURNITURE.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.court === "Client" ? "Fourni client" : `Acheté ${ENTREPRISE.nomCourt}`}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1">
                    {l.origine === "dbs" ? (
                      <Champ valeur={l.fournisseur} actif={peutSaisir} onSave={(v) => A.majLigneNomenclature(l.id, "fournisseur", v)} />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-2 py-1 text-right font-semibold tabular-nums">
                    {nb.format(prevuNomenclature(l.qteParPiece, piecesRef, l.cassePct, l.unite))} {l.unite}
                  </td>
                  <td className="px-2 py-1 text-center">
                    {peutSaisir && (
                      <button
                        onClick={() => run(() => A.supprimerLigneNomenclature(l.id), "Ligne retirée", "Retirer cette fourniture de la nomenclature ? Les lignes des commandes restent, en saisie manuelle.")}
                        className="rounded p-1 text-muted-foreground hover:bg-muted"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {peutSaisir && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <NouvelleLigne m={m} catalogue={catalogue} />
          {m.lignes.length === 0 && modelesSources.length > 0 && (
            <span className="flex items-center gap-1.5 text-xs">
              ou copier depuis
              <select value={source} onChange={(e) => setSource(e.target.value)} className="h-8 rounded-md border border-input bg-card px-1 text-xs">
                <option value="">— modèle —</option>
                {modelesSources.map((s) => (
                  <option key={s.cle} value={s.cle}>
                    {s.label}
                  </option>
                ))}
              </select>
              <Button size="sm" variant="outline" disabled={!source} onClick={() => run(() => A.copierNomenclature(source, m.cle, m.label), "Nomenclature copiée")}>
                Copier
              </Button>
            </span>
          )}
        </div>
      )}
    </SectionPanel>
  );
}

function NouvelleLigne({ m, catalogue }: { m: ModeleNomenclature; catalogue: CatalogueFournitureRow[] }) {
  const run = useRun();
  const [v, setV] = useState({ designation: "", qteParPiece: "", unite: "pcs", cassePct: "3", origine: "client", fournisseur: "" });
  const set = (p: Partial<typeof v>) => setV((x) => ({ ...x, ...p }));
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <Input
        list="catalogue-fournitures"
        value={v.designation}
        onChange={(e) => {
          const c = catalogue.find((x) => x.designation === e.target.value);
          set({ designation: e.target.value, ...(c ? { unite: c.unite } : {}) });
        }}
        placeholder="Bouton 18 L, zip 20 cm, étiquette…"
        className="h-8 w-56 bg-card"
      />
      <Input value={v.qteParPiece} onChange={(e) => set({ qteParPiece: e.target.value })} inputMode="decimal" placeholder="qté / pièce" className="h-8 w-24 bg-card" />
      <Input value={v.unite} onChange={(e) => set({ unite: e.target.value })} className="h-8 w-16 bg-card" />
      <Input value={v.cassePct} onChange={(e) => set({ cassePct: e.target.value })} inputMode="decimal" className="h-8 w-16 bg-card" title="% de casse" />
      <select value={v.origine} onChange={(e) => set({ origine: e.target.value })} className="h-8 rounded-md border border-input bg-card px-1 text-xs">
        <option value="client">Fourni client</option>
        <option value="dbs">Acheté {ENTREPRISE.nomCourt}</option>
      </select>
      {v.origine === "dbs" && <Input value={v.fournisseur} onChange={(e) => set({ fournisseur: e.target.value })} placeholder="Fournisseur" className="h-8 w-36 bg-card" />}
      <Button
        size="sm"
        disabled={!v.designation.trim() || !(Number(v.qteParPiece.replace(",", ".")) > 0)}
        onClick={() =>
          run(() => A.ajouterLigneNomenclature(m.cle, m.label, v), "Fourniture ajoutée — prévu des commandes recalculé").then(() =>
            setV({ designation: "", qteParPiece: "", unite: "pcs", cassePct: v.cassePct, origine: v.origine, fournisseur: v.fournisseur }),
          )
        }
      >
        + Ajouter
      </Button>
    </div>
  );
}

function Champ({ valeur, onSave, actif, centre, liste }: { valeur: string; onSave: (v: string) => Promise<R>; actif: boolean; centre?: boolean; liste?: string }) {
  const run = useRun();
  const [v, setV] = useState(valeur);
  return (
    <Input
      value={v}
      list={liste}
      disabled={!actif}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== valeur && run(() => onSave(v), "Enregistré — prévu des commandes recalculé")}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      className={`h-8 bg-card ${centre ? "text-center" : ""}`}
    />
  );
}

function useRun() {
  const router = useRouter();
  const [, start] = useTransition();
  return (fn: () => Promise<R>, succes: string, confirmer?: string): Promise<void> => {
    if (confirmer && !confirm(confirmer)) return Promise.resolve();
    return fn().then((r) => {
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(r.synchronisees ? `${succes} (${r.synchronisees} ligne(s) de commande mises à jour)` : succes);
        start(() => router.refresh());
      }
    });
  };
}
