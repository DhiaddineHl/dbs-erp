"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { SectionPanel } from "@/components/shared/section-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CatalogueFournitureRow } from "@/lib/services/preparation";
import { ajouterAuCatalogue, supprimerDuCatalogue } from "@/lib/actions/preparation";

const UNITES = ["pcs", "m", "kg", "rouleau", "paire", "lot"];
const nb = new Intl.NumberFormat("fr-FR");

/* Catalogue de fournitures récurrentes (point 6) : tickets, compositions,
 * grosgrain de marque… On les enregistre une fois avec leur unité et une
 * quantité par défaut ; ensuite on les pioche dans la fiche fournitures d'une
 * commande sans tout ressaisir. */
export function CatalogueFournitures({
  catalogue,
  peutSaisir,
}: {
  catalogue: CatalogueFournitureRow[];
  peutSaisir: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [designation, setDesignation] = useState("");
  const [unite, setUnite] = useState("pcs");
  const [qteDefaut, setQteDefaut] = useState("");
  const [note, setNote] = useState("");

  const ajouter = () =>
    start(async () => {
      const r = await ajouterAuCatalogue({
        designation,
        unite,
        qteDefaut: qteDefaut ? Number(qteDefaut.replace(",", ".")) : 0,
        note,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Fourniture ajoutée au catalogue");
      setDesignation("");
      setQteDefaut("");
      setNote("");
      router.refresh();
    });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link
          href="/magfour"
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input px-2.5 text-[11px] font-semibold hover:bg-muted"
        >
          ← Retour au magasin fournitures
        </Link>
      </div>

      {peutSaisir && (
        <SectionPanel title="Ajouter une fourniture récurrente">
          <div className="grid gap-3 sm:grid-cols-4">
            <label className="flex flex-col gap-1 text-[11px] font-bold uppercase text-muted-foreground sm:col-span-2">
              Désignation
              <Input
                value={designation}
                onChange={(e) => setDesignation(e.target.value)}
                placeholder="Ticket composition, grosgrain de marque…"
                className="bg-card font-normal"
              />
            </label>
            <label className="flex flex-col gap-1 text-[11px] font-bold uppercase text-muted-foreground">
              Unité
              <select value={unite} onChange={(e) => setUnite(e.target.value)} className="h-9 rounded-md border border-input bg-card px-2 text-sm font-normal">
                {UNITES.map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[11px] font-bold uppercase text-muted-foreground">
              Quantité par défaut
              <Input value={qteDefaut} onChange={(e) => setQteDefaut(e.target.value)} inputMode="decimal" placeholder="0" className="bg-card font-normal" />
            </label>
            <label className="flex flex-col gap-1 text-[11px] font-bold uppercase text-muted-foreground sm:col-span-3">
              Note (facultatif)
              <Input value={note} onChange={(e) => setNote(e.target.value)} className="bg-card font-normal" />
            </label>
            <div className="flex items-end">
              <Button disabled={pending || !designation.trim()} onClick={ajouter} className="w-full">
                Ajouter
              </Button>
            </div>
          </div>
        </SectionPanel>
      )}

      <SectionPanel title={`Fournitures au catalogue (${catalogue.length})`} flush>
        {catalogue.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            Aucune fourniture récurrente. Ajoutez-en pour les retrouver dans la liste déroulante des commandes.
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/40 text-[10.5px] uppercase text-muted-foreground">
                <th className="px-3 py-2 text-left">Désignation</th>
                <th className="px-3 py-2 text-center">Unité</th>
                <th className="px-3 py-2 text-center">Qté défaut</th>
                <th className="px-3 py-2 text-left">Note</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {catalogue.map((c) => (
                <tr key={c.id} className="border-b">
                  <td className="px-3 py-1.5 font-semibold">{c.designation}</td>
                  <td className="px-3 py-1.5 text-center text-muted-foreground">{c.unite}</td>
                  <td className="px-3 py-1.5 text-center tabular-nums">{c.qteDefaut ? nb.format(c.qteDefaut) : "—"}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">{c.note || "—"}</td>
                  <td className="px-3 py-1.5 text-center">
                    {peutSaisir && (
                      <button
                        onClick={() =>
                          start(async () => {
                            if (!confirm(`Retirer « ${c.designation} » du catalogue ?`)) return;
                            const r = await supprimerDuCatalogue(c.id);
                            if (!r.ok) toast.error(r.error);
                            else {
                              toast.success("Retiré du catalogue");
                              router.refresh();
                            }
                          })
                        }
                        className="rounded p-1 text-muted-foreground hover:bg-muted"
                        title="Retirer"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionPanel>
    </div>
  );
}
