"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import * as A from "@/lib/actions/atelier";
import type { BilanImport } from "@/lib/actions/atelier";

export type ChaineChoix = { id: number; nom: string; effectif: number };

/** Import du registre, suivi de la question qui vient toujours après :
 * « et je les mets sur quelle chaîne ? ».
 *
 * L'original enchaînait les deux dans la foulée ; c'est le bon enchaînement,
 * parce que le fichier de paie porte déjà le poste et le temps standard de
 * chacune, et que les ressaisir à la main serait absurde. */
export function ImportPersonnelButton({ chaines }: { chaines: ChaineChoix[] }) {
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [bilan, setBilan] = useState<BilanImport | null>(null);

  const onFichier = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // permet de réimporter le même fichier
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    start(async () => {
      const r = await A.importerPersonnel(fd);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      const b = r.data!;
      toast.success(
        `${b.crees} fiche(s) créée(s), ${b.majs} mise(s) à jour` + (b.ignores ? ` — ${b.ignores} ligne(s) sans nom ignorée(s)` : ""),
      );
      router.refresh();
      if (b.affectations.length && chaines.length) setBilan(b);
    });
  };

  return (
    <>
      <input ref={ref} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={onFichier} />
      <Button variant="outline" size="sm" disabled={pending} onClick={() => ref.current?.click()}>
        <Upload className="size-4" /> {pending ? "Import…" : "Importer (CSV/Excel)"}
      </Button>
      {bilan && <DialogAffectation bilan={bilan} chaines={chaines} onFermer={() => setBilan(null)} />}
    </>
  );
}

function DialogAffectation({
  bilan,
  chaines,
  onFermer,
}: {
  bilan: BilanImport;
  chaines: ChaineChoix[];
  onFermer: () => void;
}) {
  const router = useRouter();
  const [chaineId, setChaineId] = useState(chaines[0]?.id ?? 0);
  const [pending, start] = useTransition();
  const total = bilan.crees + bilan.majs;

  return (
    <Dialog open onOpenChange={(o) => !o && onFermer()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>✅ {total} personne(s) importée(s)</DialogTitle>
        </DialogHeader>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Voulez-vous les affecter à une chaîne comme ouvrières, avec le poste et le SAM lus dans le fichier&nbsp;? Sinon
          elles restent au registre, sans affectation. Les personnes déjà présentes sur la chaîne ne seront pas doublées.
        </p>
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">Chaîne de destination</label>
          <select
            value={chaineId}
            onChange={(e) => setChaineId(Number(e.target.value))}
            className="w-full rounded-md border border-input bg-card px-2 py-1.5 text-xs"
          >
            {chaines.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom} ({c.effectif} ouvrières)
              </option>
            ))}
          </select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFermer}>
            Non, garder au registre
          </Button>
          <Button
            disabled={pending || !chaineId}
            onClick={() =>
              start(async () => {
                /* Le poste et le SAM viennent des colonnes du fichier ; à
                 * défaut, le service reprend la fonction de la fiche. */
                const r = await A.affecterAChaine(chaineId, bilan.affectations);
                if (!r.ok) {
                  toast.error(r.error);
                  return;
                }
                toast.success(r.data ? `${r.data} affectation(s) créée(s)` : "Aucune nouvelle affectation");
                onFermer();
                router.refresh();
              })
            }
          >
            Affecter à la chaîne
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
