"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { SectionPanel } from "@/components/shared/section-panel";
import { validerSamDbsAction } from "@/lib/actions/industriel";

export type ReferenceLigne = {
  id: number;
  client: string;
  refArticle: string;
  modele: string;
  commandes: number;
  piecesProduites: number;
  samDbs: number | null;
  samPropose: number | null;
  series: number;
  etendue: [number, number] | null;
};

const nb = new Intl.NumberFormat("fr-FR");
const secMin = (s: number | null) => (s == null ? "—" : `${nb.format(s)} s · ${(s / 60).toFixed(1)} min`);

export function ReferencesClient({ lignes }: { lignes: ReferenceLigne[] }) {
  const [saisie, setSaisie] = useState<Record<number, string>>({});
  const [pending, start] = useTransition();

  if (!lignes.length) {
    return (
      <SectionPanel title="Références">
        <div className="py-10 text-center text-sm text-muted-foreground">
          Aucune référence pour l&apos;instant. Elles se créent automatiquement à l&apos;enregistrement des commandes.
          Vous pouvez rattacher les commandes existantes depuis l&apos;action de reprise.
        </div>
      </SectionPanel>
    );
  }

  function valider(l: ReferenceLigne) {
    const brut = saisie[l.id] ?? (l.samDbs != null ? String(l.samDbs) : l.samPropose != null ? String(l.samPropose) : "");
    const valeur = Math.round(Number(brut));
    if (!Number.isFinite(valeur) || valeur <= 0) {
      toast("Saisissez un SAM valide (secondes/pièce).");
      return;
    }
    start(async () => {
      const res = await validerSamDbsAction(l.id, valeur);
      if (res.ok) toast(`SAM DBS validé : ${nb.format(valeur)} s/pc`);
      else toast(res.error ?? "Échec de l'enregistrement");
    });
  }

  return (
    <SectionPanel title={`Références (${lignes.length})`} flush>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="px-3 py-2">Client</th>
              <th className="px-3 py-2">Référence</th>
              <th className="px-3 py-2">Modèle</th>
              <th className="px-3 py-2 text-center">OF</th>
              <th className="px-3 py-2 text-right">Pièces produites</th>
              <th className="px-3 py-2">SAM DBS retenu</th>
              <th className="px-3 py-2">Proposé (historique)</th>
              <th className="px-3 py-2">Valider</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => (
              <tr key={l.id} className="border-b align-top">
                <td className="px-3 py-2 font-semibold">{l.client || "—"}</td>
                <td className="px-3 py-2 tabular-nums">{l.refArticle || "—"}</td>
                <td className="px-3 py-2">{l.modele || "—"}</td>
                <td className="px-3 py-2 text-center tabular-nums">{l.commandes}</td>
                <td className="px-3 py-2 text-right tabular-nums">{nb.format(l.piecesProduites)}</td>
                <td className="px-3 py-2 tabular-nums">{secMin(l.samDbs)}</td>
                <td className="px-3 py-2 text-xs">
                  {l.samPropose == null ? (
                    <span className="text-muted-foreground">Pas encore d&apos;historique</span>
                  ) : (
                    <span>
                      <b className="tabular-nums">{nb.format(l.samPropose)} s</b> · {l.series} série(s)
                      {l.etendue ? ` · ${nb.format(l.etendue[0])}–${nb.format(l.etendue[1])} s` : ""}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      className="w-20 rounded border bg-transparent px-1.5 py-1 text-right tabular-nums"
                      placeholder={l.samPropose != null ? String(l.samPropose) : "s/pc"}
                      value={saisie[l.id] ?? (l.samDbs != null ? String(l.samDbs) : "")}
                      onChange={(e) => setSaisie((s) => ({ ...s, [l.id]: e.target.value }))}
                    />
                    <button
                      className="rounded bg-primary px-2 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
                      disabled={pending}
                      onClick={() => valider(l)}
                    >
                      Valider
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-3 py-2 text-xs text-muted-foreground">
        Le SAM DBS retenu est une décision humaine : il n&apos;écrase jamais le SAM théorique du modèle ni le SAM
        constaté observé. La proposition est pondérée par les pièces produites.
      </p>
    </SectionPanel>
  );
}
