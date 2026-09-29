"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SectionPanel } from "@/components/shared/section-panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import * as A from "@/lib/actions/rouleaux";
import type { EmplacementRow } from "@/lib/services/rouleaux";

const q2 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

export function Emplacements({ emplacements, peutSaisir }: { emplacements: EmplacementRow[]; peutSaisir: boolean }) {
  const router = useRouter();
  const [f, setF] = useState({ code: "", zone: "", rayon: "", libelle: "" });
  const [coches, setCoches] = useState<Set<number>>(new Set());
  const run = async (fn: () => Promise<A.Result>, ok: string) => {
    const r = await fn();
    if (!r.ok) return void toast.error(r.error);
    toast.success(ok);
    router.refresh();
  };
  const imprimer = (coches.size ? [...coches] : emplacements.filter((e) => e.actif).map((e) => e.id)).join(",");
  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/magtissu?onglet=rouleaux" className="text-xs font-semibold text-muted-foreground hover:underline">
          ← Magasin tissu
        </Link>
        <h1 className="text-lg font-bold">Emplacements tissu</h1>
        <Link href={`/magtissu/emplacements/etiquettes?ids=${imprimer}`} target="_blank" className="ml-auto rounded-md border px-2.5 py-1.5 text-[11px] font-semibold hover:bg-muted">
          🏷 Étiquettes QR {coches.size ? `(${coches.size})` : "(toutes)"}
        </Link>
      </div>

      {peutSaisir && (
        <SectionPanel title="Nouvel emplacement">
          <div className="flex flex-wrap items-end gap-2">
            {(
              [
                ["code", "Code (ex. A03-12)"],
                ["zone", "Zone (ex. A)"],
                ["rayon", "Rayon"],
                ["libelle", "Libellé"],
              ] as const
            ).map(([k, l]) => (
              <label key={k} className="flex flex-col gap-1 text-[11px] font-semibold text-muted-foreground">
                {l}
                <Input value={f[k]} onChange={(e) => setF((s) => ({ ...s, [k]: e.target.value }))} className="h-8 w-40 bg-card" />
              </label>
            ))}
            <Button size="sm" onClick={() => run(() => A.creerEmplacement(f), `Emplacement ${f.code.toUpperCase()} créé`).then(() => setF({ code: "", zone: f.zone, rayon: "", libelle: "" }))}>
              Créer
            </Button>
          </div>
        </SectionPanel>
      )}

      <SectionPanel title={`Emplacements (${emplacements.length})`} flush>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-muted/40 text-[10px] uppercase text-muted-foreground">
              <th className="w-8 px-3 py-2" />
              <th className="px-3 py-2 text-left">Code</th>
              <th className="px-3 py-2 text-left">Zone</th>
              <th className="px-3 py-2 text-left">Rayon</th>
              <th className="px-3 py-2 text-left">Libellé</th>
              <th className="px-3 py-2 text-right">Rouleaux</th>
              <th className="px-3 py-2 text-right">Métrage</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {emplacements.length === 0 && (
              <tr>
                <td colSpan={8} className="py-8 text-center text-muted-foreground">
                  Aucun emplacement. Créez les rayons du magasin pour pouvoir ranger les rouleaux.
                </td>
              </tr>
            )}
            {emplacements.map((e) => (
              <tr key={e.id} className={`border-b ${e.actif ? "" : "opacity-50"}`}>
                <td className="px-3 py-1.5">
                  <input
                    type="checkbox"
                    checked={coches.has(e.id)}
                    onChange={(ev) =>
                      setCoches((s) => {
                        const x = new Set(s);
                        if (ev.target.checked) x.add(e.id);
                        else x.delete(e.id);
                        return x;
                      })
                    }
                  />
                </td>
                <td className="px-3 py-1.5 font-mono font-bold">{e.code}</td>
                <td className="px-3 py-1.5">{e.zone || "—"}</td>
                <td className="px-3 py-1.5">{e.rayon || "—"}</td>
                <td className="px-3 py-1.5">{e.libelle || "—"}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{e.rouleaux}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{q2.format(e.metrage)} m</td>
                <td className="px-3 py-1.5 text-right">
                  {!e.actif && <StatusBadge tone="neutral">désactivé</StatusBadge>}
                  {peutSaisir && (
                    <button
                      className="ml-2 text-[11px] font-semibold text-brand hover:underline"
                      onClick={() => run(() => A.majEmplacement(e.id, "actif", String(!e.actif)), e.actif ? "Emplacement désactivé" : "Emplacement réactivé")}
                    >
                      {e.actif ? "Désactiver" : "Réactiver"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionPanel>
    </div>
  );
}
