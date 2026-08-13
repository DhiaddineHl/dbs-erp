"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import { SectionPanel } from "@/components/shared/section-panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { BaremeRow } from "@/lib/services/qc";
import * as A from "@/lib/actions/qc";
import { BoutonAction, ChampAction, useAction } from "./primitives";

/* Barèmes de mesures clients : une matrice point × taille avec une tolérance
 * par point. Ce sont les dossiers techniques des donneurs d'ordre, ce qui rend
 * l'appariement automatique par référence possible côté inspection. */
export function Baremes({ baremes, peutSaisir }: { baremes: BaremeRow[]; peutSaisir: boolean }) {
  const [ouvert, setOuvert] = useState<number | null>(null);
  const [nouveau, setNouveau] = useState("");
  const run = useAction();

  return (
    <SectionPanel
      title="Barèmes de mesures"
      actions={
        peutSaisir && (
          <div className="flex items-center gap-2">
            <Input
              value={nouveau}
              onChange={(e) => setNouveau(e.target.value)}
              placeholder="Nom du nouveau barème…"
              className="h-8 w-64 bg-card"
            />
            <BoutonAction
              variant="default"
              disabled={!nouveau.trim()}
              onRun={async () => {
                const r = await A.creerBareme(nouveau);
                if (r.ok) setNouveau("");
                return r;
              }}
              succes="Barème créé"
            >
              + Créer
            </BoutonAction>
          </div>
        )
      }
      flush
    >
      {baremes.length === 0 ? (
        <div className="py-10 text-center text-xs text-muted-foreground">Aucun barème enregistré.</div>
      ) : (
        <div className="divide-y">
          {baremes.map((b) => (
            <div key={b.id}>
              <button
                onClick={() => setOuvert(ouvert === b.id ? null : b.id)}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-accent/50"
              >
                {ouvert === b.id ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                <b className="text-xs">{b.nom}</b>
                {b.client && <StatusBadge tone="purple">{b.client}</StatusBadge>}
                <span className="text-[11px] text-muted-foreground">
                  {b.points.length} point(s) · {b.tailles.length} taille(s)
                </span>
                {b.refs.length > 0 && (
                  <span className="ml-auto text-[10.5px] text-muted-foreground">réf. {b.refs.join(", ")}</span>
                )}
              </button>

              {ouvert === b.id && (
                <div className="border-t bg-muted/20 px-3 py-3">
                  <div className="mb-3 grid gap-3 sm:grid-cols-3">
                    <Champ label="Nom">
                      <ChampAction valeur={b.nom} fige={!peutSaisir} onSave={(v) => A.majBareme(b.id, { nom: v })} />
                    </Champ>
                    <Champ label="Client">
                      <ChampAction valeur={b.client} fige={!peutSaisir} onSave={(v) => A.majBareme(b.id, { client: v })} />
                    </Champ>
                    <Champ label="Références (séparées par des virgules)">
                      <ChampAction
                        valeur={b.refs.join(", ")}
                        fige={!peutSaisir}
                        onSave={(v) =>
                          A.majBareme(b.id, { refs: v.split(",").map((x) => x.trim()).filter(Boolean) })
                        }
                      />
                    </Champ>
                    <Champ label="Tailles (séparées par des virgules)">
                      <ChampAction
                        valeur={b.tailles.join(", ")}
                        fige={!peutSaisir}
                        onSave={(v) =>
                          A.majBareme(b.id, { tailles: v.split(",").map((x) => x.trim()).filter(Boolean) })
                        }
                      />
                    </Champ>
                  </div>

                  <div className="overflow-x-auto rounded-lg border bg-card">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b bg-muted/40 text-[10.5px] uppercase text-muted-foreground">
                          <th className="px-2 py-1.5 text-left">Point de mesure</th>
                          <th className="px-2 py-1.5 text-center">Tol. ±</th>
                          {b.tailles.map((t) => (
                            <th key={t} className="px-2 py-1.5 text-center">
                              {t}
                            </th>
                          ))}
                          <th className="w-8" />
                        </tr>
                      </thead>
                      <tbody>
                        {b.points.length === 0 ? (
                          <tr>
                            <td colSpan={b.tailles.length + 3} className="py-4 text-center text-muted-foreground">
                              Aucun point de mesure.
                            </td>
                          </tr>
                        ) : (
                          b.points.map((p) => (
                            <tr key={p.id} className="border-b last:border-0">
                              <td className="min-w-[220px] px-2 py-1.5">
                                <ChampAction
                                  valeur={p.label}
                                  fige={!peutSaisir}
                                  onSave={(v) => A.majPointBareme(p.id, { label: v })}
                                />
                              </td>
                              <td className="w-20 px-2 py-1.5">
                                <ChampAction
                                  valeur={String(p.tolerance)}
                                  type="number"
                                  step="0.01"
                                  className="text-center"
                                  fige={!peutSaisir}
                                  onSave={(v) => A.majPointBareme(p.id, { tolerance: Number(v.replace(",", ".")) || 0 })}
                                />
                              </td>
                              {b.tailles.map((t) => (
                                <td key={t} className="w-20 px-2 py-1.5">
                                  <ChampAction
                                    valeur={p.valeurs[t] != null ? String(p.valeurs[t]) : ""}
                                    type="number"
                                    step="0.01"
                                    className="text-center"
                                    fige={!peutSaisir}
                                    onSave={(v) => {
                                      const valeurs = { ...p.valeurs };
                                      if (v.trim() === "") delete valeurs[t];
                                      else valeurs[t] = Number(v.replace(",", ".")) || 0;
                                      return A.majPointBareme(p.id, { valeurs });
                                    }}
                                  />
                                </td>
                              ))}
                              <td className="px-2 py-1.5 text-center">
                                {peutSaisir && (
                                  <button
                                    onClick={() => run(() => A.supprimerPointBareme(p.id), "Point retiré")}
                                    className="text-muted-foreground hover:text-[var(--danger-d)]"
                                    aria-label="Retirer le point"
                                  >
                                    <X className="size-3.5" />
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {peutSaisir && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <BoutonAction onRun={() => A.ajouterPointBareme(b.id, "Nouveau point")} succes="Point ajouté">
                        ＋ Point de mesure
                      </BoutonAction>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          if (!confirm(`Supprimer le barème « ${b.nom} » et tous ses points ?`)) return;
                          void run(() => A.supprimerBareme(b.id), "Barème supprimé");
                        }}
                      >
                        Supprimer le barème
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </SectionPanel>
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
