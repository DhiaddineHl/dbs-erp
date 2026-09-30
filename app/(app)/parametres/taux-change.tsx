"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { toast } from "sonner";
import { SectionPanel } from "@/components/shared/section-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DEVISES, DEVISE_PIVOT, LISTE_DEVISES } from "@/lib/domain/montants";
import type { TauxChangeRow } from "@/lib/services/taux-change";
import { enregistrerTauxChangeAction, supprimerTauxChangeAction } from "./actions";

const dateFr = (iso: string) => iso.split("-").reverse().join("/");
const auj = () => new Date().toISOString().slice(0, 10);

/* Taux de change servant à convertir le chiffre d'affaires dans une devise
 * de référence. Chaque taux vaut à partir de sa date : un document est
 * converti au dernier taux connu à SA date, si bien qu'ajouter un taux
 * aujourd'hui ne réécrit pas les mois passés. */
export function TauxChangePanel({ taux }: { taux: TauxChangeRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const convertibles = LISTE_DEVISES.filter((d) => d !== DEVISE_PIVOT);
  const [devise, setDevise] = useState(convertibles[0] ?? "EUR");
  const [date, setDate] = useState(auj());
  const [valeur, setValeur] = useState("");

  const run = (p: Promise<{ ok: boolean; error?: string }>, okMsg: string, apres?: () => void) =>
    start(async () => {
      const r = await p;
      if (r.ok) {
        toast.success(okMsg);
        apres?.();
        router.refresh();
      } else toast.error(r.error || "Erreur");
    });

  const ajouter = () => {
    const n = parseFloat(valeur.replace(",", "."));
    if (!(n > 0)) return toast.error("Saisissez un taux positif");
    run(enregistrerTauxChangeAction({ devise, date, taux: n }), "Taux enregistré", () => setValeur(""));
  };

  const tries = [...taux].sort((a, b) => a.devise.localeCompare(b.devise) || b.date.localeCompare(a.date));

  return (
    <SectionPanel title="Taux de change" icon="💱">
      <p className="mb-3 text-xs text-muted-foreground">
        Utilisés pour afficher le chiffre d&apos;affaires converti dans une devise de référence. 1 unité de la devise
        vaut le taux saisi en {DEVISE_PIVOT} ; chaque document est converti au taux en vigueur à sa date.
      </p>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label className="text-[11px] font-semibold text-secondary-foreground">Devise</Label>
          <select
            value={devise}
            onChange={(e) => setDevise(e.target.value as typeof devise)}
            className="h-8 rounded-md border border-input bg-card px-2 text-xs"
          >
            {convertibles.map((d) => (
              <option key={d} value={d}>
                {d} ({DEVISES[d].symbole})
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-[11px] font-semibold text-secondary-foreground">À partir du</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8 bg-card" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-[11px] font-semibold text-secondary-foreground">
            1 {devise} = ? {DEVISE_PIVOT}
          </Label>
          <Input
            type="number"
            step="0.0001"
            min={0}
            value={valeur}
            placeholder="3,3400"
            onChange={(e) => setValeur(e.target.value)}
            className="h-8 w-32 bg-card"
          />
        </div>
        <Button size="sm" disabled={pending} onClick={ajouter}>
          Enregistrer le taux
        </Button>
      </div>

      {tries.length === 0 ? (
        <p className="text-xs text-muted-foreground">Aucun taux : la vue convertie exclura les documents en devise.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Devise</TableHead>
              <TableHead>À partir du</TableHead>
              <TableHead className="text-right">Taux ({DEVISE_PIVOT})</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {tries.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-semibold">{t.devise}</TableCell>
                <TableCell className="tabular-nums">{dateFr(t.date)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {t.taux.toLocaleString("fr-FR", { minimumFractionDigits: 4, maximumFractionDigits: 6 })}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    title="Supprimer ce taux"
                    onClick={() => run(supprimerTauxChangeAction(t.id), "Taux supprimé")}
                  >
                    <X className="size-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </SectionPanel>
  );
}
