"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import { SectionPanel } from "@/components/shared/section-panel";
import { Input } from "@/components/ui/input";
import { TYPES_CONTROLE } from "@/lib/domain/qc";
import type { ChecklistRow } from "@/lib/services/qc";
import * as A from "@/lib/actions/qc";
import { BoutonAction, ChampAction, SelectAction, useAction } from "./primitives";

/* Modèles de checklist par type de produit (Chemise, Pantalon…).
 *
 * Configurables ici, sans code : chaque modèle est une liste ordonnée de
 * points à contrôler. Le contrôleur applique ensuite le modèle à son
 * inspection, qui en copie les points (voir l'éditeur d'inspection). */
export function Checklists({ checklists, peutSaisir }: { checklists: ChecklistRow[]; peutSaisir: boolean }) {
  const [ouvert, setOuvert] = useState<number | null>(null);
  const [nouveau, setNouveau] = useState("");
  const [nouveauPoint, setNouveauPoint] = useState<Record<number, string>>({});
  const run = useAction();

  return (
    <SectionPanel
      title="Checklists de contrôle"
      actions={
        peutSaisir && (
          <div className="flex items-center gap-2">
            <Input
              value={nouveau}
              onChange={(e) => setNouveau(e.target.value)}
              placeholder="Nom de la checklist (ex. Chemise)…"
              className="h-8 w-64 bg-card"
            />
            <BoutonAction
              variant="default"
              disabled={!nouveau.trim()}
              onRun={async () => {
                const r = await A.creerChecklist(nouveau);
                if (r.ok) setNouveau("");
                return r;
              }}
              succes="Checklist créée"
            >
              + Créer
            </BoutonAction>
          </div>
        )
      }
      flush
    >
      {checklists.length === 0 ? (
        <div className="py-10 text-center text-xs text-muted-foreground">
          Aucune checklist. Créez-en une par type de produit (Chemise, Pantalon…), puis ajoutez ses points de
          contrôle. Le contrôleur pourra l&apos;appliquer à ses inspections.
        </div>
      ) : (
        <div className="divide-y">
          {checklists.map((c) => {
            const dep = ouvert === c.id;
            return (
              <div key={c.id}>
                <button
                  onClick={() => setOuvert(dep ? null : c.id)}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-accent/50"
                >
                  {dep ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                  <b className="text-sm">{c.nom}</b>
                  {c.typeProduit && <span className="text-xs text-muted-foreground">· {c.typeProduit}</span>}
                  <span className="ml-auto text-xs text-muted-foreground">{c.points.length} point(s)</span>
                </button>

                {dep && (
                  <div className="space-y-3 border-t bg-muted/20 px-3 py-3">
                    {peutSaisir && (
                      <div className="grid gap-2 sm:grid-cols-2">
                        <label className="text-[11px] font-semibold text-muted-foreground">
                          Type de produit
                          <ChampAction
                            valeur={c.typeProduit}
                            placeholder="Chemise, Pantalon…"
                            onSave={(x) => A.majChecklist(c.id, { typeProduit: x })}
                          />
                        </label>
                        <label className="text-[11px] font-semibold text-muted-foreground">
                          Type de contrôle (optionnel)
                          <SelectAction
                            valeur={c.typeControle}
                            options={[{ value: "", label: "Tous" }, ...TYPES_CONTROLE.map((t) => ({ value: t.value, label: t.court }))]}
                            onSave={(x) => A.majChecklist(c.id, { typeControle: x })}
                          />
                        </label>
                      </div>
                    )}

                    <div className="space-y-1.5">
                      {c.points.length === 0 ? (
                        <div className="text-xs text-muted-foreground">Aucun point. Ajoutez-en ci-dessous.</div>
                      ) : (
                        c.points.map((p, i) => (
                          <div key={p.id} className="flex items-center gap-2">
                            <span className="w-6 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                              {i + 1}.
                            </span>
                            <div className="flex-1">
                              <ChampAction
                                valeur={p.label}
                                fige={!peutSaisir}
                                onSave={(x) => A.majPointChecklist(p.id, x)}
                              />
                            </div>
                            {peutSaisir && (
                              <BoutonAction variant="ghost" onRun={() => A.supprimerPointChecklist(p.id)}>
                                <X className="size-3.5" />
                              </BoutonAction>
                            )}
                          </div>
                        ))
                      )}
                    </div>

                    {peutSaisir && (
                      <div className="flex items-center gap-2">
                        <Input
                          value={nouveauPoint[c.id] ?? ""}
                          onChange={(e) => setNouveauPoint((s) => ({ ...s, [c.id]: e.target.value }))}
                          placeholder="Nouveau point (col, manche, bouton…)"
                          className="h-8 flex-1 bg-card"
                          onKeyDown={async (e) => {
                            if (e.key !== "Enter") return;
                            const label = (nouveauPoint[c.id] ?? "").trim();
                            if (!label) return;
                            await run(() => A.ajouterPointChecklist(c.id, label), "Point ajouté");
                            setNouveauPoint((s) => ({ ...s, [c.id]: "" }));
                          }}
                        />
                        <BoutonAction
                          disabled={!(nouveauPoint[c.id] ?? "").trim()}
                          onRun={async () => {
                            const r = await A.ajouterPointChecklist(c.id, (nouveauPoint[c.id] ?? "").trim());
                            if (r.ok) setNouveauPoint((s) => ({ ...s, [c.id]: "" }));
                            return r;
                          }}
                          succes="Point ajouté"
                        >
                          + Point
                        </BoutonAction>
                        <BoutonAction
                          variant="ghost"
                          confirmer={`Supprimer la checklist « ${c.nom} » ?`}
                          onRun={() => A.supprimerChecklist(c.id)}
                        >
                          Supprimer
                        </BoutonAction>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </SectionPanel>
  );
}
