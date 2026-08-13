"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ListChecks } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { SectionPanel } from "@/components/shared/section-panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { doublonsOperations } from "@/lib/domain/atelier";
import type { OperationRow } from "@/lib/services/atelier";
import * as A from "@/lib/actions/atelier";
import { BoutonAction, Kpi, Tuiles } from "../aval/ui";

const nb = new Intl.NumberFormat("fr-FR");

/** Un SAM en secondes, exprimé aussi en pièces/heure : c'est ce chiffre-là que
 * la chaîne lit, pas les secondes. */
const parHeure = (sam: number) => (sam > 0 ? Math.round(3600 / sam) : 0);

export function OperationsClient({
  operations,
  peutSaisir,
}: {
  operations: OperationRow[];
  peutSaisir: boolean;
}) {
  const [q, setQ] = useState("");
  const [voirArchivees, setVoirArchivees] = useState(false);
  const [voirDoublons, setVoirDoublons] = useState(false);
  const [nouveau, setNouveau] = useState({ nom: "", sam: "" });
  const [pending, start] = useTransition();
  const router = useRouter();

  const filtrees = useMemo(() => {
    const n = q.trim().toLowerCase();
    return operations.filter(
      (o) => (voirArchivees || !o.archive) && (!n || o.nom.toLowerCase().includes(n)),
    );
  }, [operations, q, voirArchivees]);

  const groupes = useMemo(
    () => doublonsOperations(operations.filter((o) => !o.archive)),
    [operations],
  );

  const actives = operations.filter((o) => !o.archive);
  const sansSam = actives.filter((o) => o.sam <= 0).length;

  return (
    <>
      <PageHeader
        icon={ListChecks}
        title="Catalogue d'opérations"
        description="Libellés normalisés et temps standards — la référence des saisies horaires en chaîne"
      />

      <Tuiles>
        <Kpi label="Opérations actives" valeur={nb.format(actives.length)} />
        <Kpi label="Archivées" valeur={nb.format(operations.length - actives.length)} tone="neutral" />
        <Kpi label="Sans temps standard" valeur={String(sansSam)} tone={sansSam ? "warning" : "neutral"} />
        <Kpi
          label="Libellés en double"
          valeur={String(groupes.length)}
          tone={groupes.length ? "danger" : "success"}
          sub="à la casse et aux accents près"
        />
      </Tuiles>

      {groupes.length > 0 && (
        <SectionPanel
          title={`${groupes.length} libellé(s) saisis plusieurs fois`}
          actions={
            <Button size="sm" variant="outline" onClick={() => setVoirDoublons((v) => !v)}>
              {voirDoublons ? "Masquer" : "Examiner"}
            </Button>
          }
          flush={voirDoublons}
        >
          {!voirDoublons ? (
            <p className="text-xs text-muted-foreground">
              Ces opérations désignent probablement le même geste, saisi avec une orthographe différente. Fusionner
              archive les variantes et garde celle que vous choisissez.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <tbody>
                  {groupes.map((g) => (
                    <Fragment key={g.cle}>
                      <tr className="border-b bg-muted/50">
                        <td colSpan={3} className="px-3 py-1.5 text-[11px] font-bold uppercase">
                          {g.membres.length} variantes
                        </td>
                      </tr>
                      {g.membres.map((m) => (
                        <tr key={m.id} className="border-b last:border-0">
                          <td className="px-3 py-2">{m.nom}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{m.sam} s</td>
                          <td className="px-3 py-2 text-right">
                            {peutSaisir && (
                              <BoutonAction
                                onRun={() =>
                                  A.fusionnerOperations(
                                    m.id,
                                    g.membres.map((x) => x.id),
                                  )
                                }
                                confirmer={`Garder « ${m.nom} » et archiver les ${g.membres.length - 1} autres ?`}
                                succes="Variantes archivées"
                              >
                                Garder celle-ci
                              </BoutonAction>
                            )}
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionPanel>
      )}

      <SectionPanel
        title={`${filtrees.length} opération(s)`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <input
                type="checkbox"
                checked={voirArchivees}
                onChange={(e) => setVoirArchivees(e.target.checked)}
              />
              Voir les archivées
            </label>
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Rechercher une opération…"
              className="h-8 w-64 bg-card"
            />
          </div>
        }
        flush
      >
        {peutSaisir && (
          <div className="flex flex-wrap items-end gap-2 border-b bg-muted/30 px-3 py-2.5">
            <div>
              <div className="mb-0.5 text-[10px] font-semibold uppercase text-muted-foreground">Libellé</div>
              <input
                value={nouveau.nom}
                onChange={(e) => setNouveau((p) => ({ ...p, nom: e.target.value }))}
                placeholder="MONTAGE COL + RABATTAGE"
                className="w-80 rounded border border-input bg-card px-2 py-1 text-xs"
              />
            </div>
            <div>
              <div className="mb-0.5 text-[10px] font-semibold uppercase text-muted-foreground">SAM (s)</div>
              <input
                type="number"
                value={nouveau.sam}
                onChange={(e) => setNouveau((p) => ({ ...p, sam: e.target.value }))}
                className="w-24 rounded border border-input bg-card px-2 py-1 text-right text-xs"
              />
            </div>
            <Button
              size="sm"
              disabled={pending || !nouveau.nom.trim()}
              onClick={() =>
                start(async () => {
                  const r = await A.creerOperation(nouveau);
                  if (!r.ok) {
                    toast.error(r.error);
                    return;
                  }
                  toast.success("Opération ajoutée");
                  setNouveau({ nom: "", sam: "" });
                  router.refresh();
                })
              }
            >
              + Ajouter
            </Button>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/40 text-[10.5px] uppercase text-muted-foreground">
                <th className="px-3 py-2 text-left">Opération</th>
                <th className="px-3 py-2 text-right">SAM</th>
                <th className="px-3 py-2 text-right">Objectif / h</th>
                <th className="px-3 py-2 text-left">État</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtrees.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-muted-foreground">
                    Aucune opération.
                  </td>
                </tr>
              ) : (
                filtrees.slice(0, 400).map((o) => (
                  <tr key={o.id} className={`border-b last:border-0 ${o.archive ? "opacity-55" : ""}`}>
                    <td className="px-3 py-2 font-semibold">
                      {peutSaisir ? (
                        <ChampInline valeur={o.nom} onSave={(v) => A.majOperation(o.id, { nom: v })} />
                      ) : (
                        o.nom
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {peutSaisir ? (
                        <ChampInline
                          valeur={String(o.sam)}
                          type="number"
                          className="w-20 text-right"
                          onSave={(v) => A.majOperation(o.id, { sam: v })}
                        />
                      ) : (
                        `${o.sam} s`
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {o.sam > 0 ? `${parHeure(o.sam)} pcs` : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge tone={o.archive ? "neutral" : "success"}>
                        {o.archive ? "Archivée" : "Active"}
                      </StatusBadge>
                    </td>
                    <td className="px-3 py-2">
                      {peutSaisir && (
                        <div className="flex justify-end gap-1.5">
                          <BoutonAction
                            variant="ghost"
                            onRun={() => A.majOperation(o.id, { archive: !o.archive })}
                            succes={o.archive ? "Réactivée" : "Archivée"}
                          >
                            {o.archive ? "↺ Réactiver" : "Archiver"}
                          </BoutonAction>
                          <BoutonAction
                            variant="ghost"
                            onRun={() => A.supprimerOperations([o.id])}
                            confirmer={`Supprimer « ${o.nom} » définitivement ?`}
                            succes="Opération supprimée"
                          >
                            🗑
                          </BoutonAction>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {filtrees.length > 400 && (
            <p className="px-3 py-2 text-[11px] text-muted-foreground">
              {filtrees.length - 400} opération(s) supplémentaires — affinez la recherche.
            </p>
          )}
        </div>
      </SectionPanel>
    </>
  );
}

function ChampInline({
  valeur,
  onSave,
  type = "text",
  className = "",
}: {
  valeur: string;
  onSave: (v: string) => Promise<{ ok: boolean; error?: string }>;
  type?: string;
  className?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <input
      type={type}
      defaultValue={valeur}
      disabled={pending}
      className={`rounded border border-transparent bg-transparent px-1 py-0.5 hover:border-input focus:border-ring focus:bg-card focus:outline-none disabled:opacity-60 ${className || "w-full"}`}
      onBlur={(e) => {
        const v = e.target.value;
        if (v === valeur) return;
        start(async () => {
          const r = await onSave(v);
          if (!r.ok) {
            toast.error(r.error ?? "Erreur");
            return;
          }
          router.refresh();
        });
      }}
    />
  );
}
