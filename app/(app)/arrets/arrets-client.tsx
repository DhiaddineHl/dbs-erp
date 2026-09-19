"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SectionPanel } from "@/components/shared/section-panel";
import { ajouterArretAction, supprimerArretAction } from "@/lib/actions/industriel";
import type { JourneeAvecArrets } from "@/lib/services/industriel";

const CAUSES: [string, string][] = [
  ["panne", "Panne machine"],
  ["tissu", "Manque tissu"],
  ["fournitures", "Manque fournitures"],
  ["attente_coupe", "Attente coupe"],
  ["attente_qualite", "Attente qualité"],
  ["changement_modele", "Changement de modèle"],
  ["reglage", "Réglage"],
  ["absence", "Absence"],
  ["reunion", "Réunion"],
  ["autre", "Autre"],
];
const causeLabel = (c: string) => CAUSES.find(([k]) => k === c)?.[1] ?? c;

export function ArretsClient({ journees }: { journees: JourneeAvecArrets[] }) {
  const router = useRouter();
  const [selId, setSelId] = useState<number | null>(journees[0]?.id ?? null);
  const [cause, setCause] = useState("panne");
  const [duree, setDuree] = useState("");
  const [poste, setPoste] = useState("");
  const [commentaire, setCommentaire] = useState("");
  const [pending, start] = useTransition();

  if (!journees.length) {
    return (
      <SectionPanel title="Arrêts">
        <div className="py-10 text-center text-sm text-muted-foreground">
          Aucune journée de production pour l&apos;instant. Créez des journées dans GPAO Production, puis
          revenez ici pour y déclarer les arrêts.
        </div>
      </SectionPanel>
    );
  }

  const sel = journees.find((j) => j.id === selId) ?? journees[0];

  function ajouter() {
    const min = Number(String(duree).replace(",", "."));
    if (!Number.isFinite(min) || min <= 0) {
      toast("Saisissez une durée en minutes (> 0).");
      return;
    }
    start(async () => {
      const res = await ajouterArretAction({
        journeeId: sel.id,
        cause,
        dureeMin: min,
        poste: poste.trim(),
        commentaire: commentaire.trim(),
      });
      if (res.ok) {
        toast(`Arrêt ajouté : ${causeLabel(cause)} · ${min} min`);
        setDuree("");
        setPoste("");
        setCommentaire("");
        router.refresh();
      } else {
        toast(res.error ?? "Échec de l'ajout");
      }
    });
  }

  function supprimer(id: number) {
    start(async () => {
      const res = await supprimerArretAction(id);
      if (res.ok) {
        toast("Arrêt supprimé");
        router.refresh();
      } else {
        toast(res.error ?? "Échec de la suppression");
      }
    });
  }

  return (
    <SectionPanel title="Déclarer un arrêt">
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">Journée</span>
          <select
            className="min-w-[240px] rounded border bg-transparent px-2 py-1.5 text-sm"
            value={sel.id}
            onChange={(e) => setSelId(Number(e.target.value))}
          >
            {journees.map((j) => (
              <option key={j.id} value={j.id}>
                {j.date} · {j.chaine} · {j.modele}
                {j.totalMin ? ` (${j.totalMin} min d'arrêt)` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">Cause</span>
          <select className="rounded border bg-transparent px-2 py-1.5 text-sm" value={cause} onChange={(e) => setCause(e.target.value)}>
            {CAUSES.map(([k, lib]) => (
              <option key={k} value={k}>
                {lib}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">Durée (min)</span>
          <input
            type="number"
            className="w-24 rounded border bg-transparent px-2 py-1.5 text-right text-sm tabular-nums"
            value={duree}
            onChange={(e) => setDuree(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">Poste / machine</span>
          <input
            className="w-36 rounded border bg-transparent px-2 py-1.5 text-sm"
            value={poste}
            onChange={(e) => setPoste(e.target.value)}
            placeholder="(facultatif)"
          />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-xs">
          <span className="text-muted-foreground">Commentaire</span>
          <input
            className="w-full rounded border bg-transparent px-2 py-1.5 text-sm"
            value={commentaire}
            onChange={(e) => setCommentaire(e.target.value)}
            placeholder="(facultatif)"
          />
        </label>
        <button
          className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
          disabled={pending}
          onClick={ajouter}
        >
          Ajouter
        </button>
      </div>

      <div className="rounded border">
        <div className="flex items-center justify-between border-b px-3 py-2 text-xs font-semibold">
          <span>
            Arrêts du {sel.date} · {sel.chaine} · {sel.modele}
          </span>
          <span className="tabular-nums text-muted-foreground">Total : {sel.totalMin} min</span>
        </div>
        {sel.arrets.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">Aucun arrêt déclaré pour cette journée.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-3 py-2">Cause</th>
                <th className="px-3 py-2 text-right">Durée</th>
                <th className="px-3 py-2">Poste</th>
                <th className="px-3 py-2">Commentaire</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {sel.arrets.map((a) => (
                <tr key={a.id} className="border-b">
                  <td className="px-3 py-2">{causeLabel(a.cause)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{a.dureeMin} min</td>
                  <td className="px-3 py-2">{a.poste || "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{a.commentaire || "—"}</td>
                  <td className="px-3 py-2 text-right">
                    <button className="text-xs text-red-500 hover:underline disabled:opacity-50" disabled={pending} onClick={() => supprimer(a.id)}>
                      Supprimer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </SectionPanel>
  );
}
