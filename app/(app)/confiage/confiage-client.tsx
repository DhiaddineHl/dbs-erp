"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SectionPanel } from "@/components/shared/section-panel";
import { ajouterConfiageAction } from "@/lib/actions/industriel";
import type { CommandeConfiable, ConfiageLigne, FaconnierRef } from "@/lib/services/industriel";

const nb = new Intl.NumberFormat("fr-FR");

export function ConfiageClient({
  commandes,
  faconniers,
  confiages,
}: {
  commandes: CommandeConfiable[];
  faconniers: FaconnierRef[];
  confiages: ConfiageLigne[];
}) {
  const router = useRouter();
  const [cmdId, setCmdId] = useState<number | null>(commandes[0]?.id ?? null);
  const [facId, setFacId] = useState<number | null>(faconniers[0]?.id ?? null);
  const [qteConfiee, setQteConfiee] = useState("");
  const [qteExpediee, setQteExpediee] = useState("");
  const [dateRetour, setDateRetour] = useState("");
  const [prix, setPrix] = useState("");
  const [pending, start] = useTransition();

  const cmd = commandes.find((c) => c.id === cmdId) ?? commandes[0];
  const lignes = useMemo(() => confiages.filter((c) => c.commandeId === cmd?.id), [confiages, cmd?.id]);

  if (!commandes.length) {
    return (
      <SectionPanel title="Confiage">
        <div className="py-10 text-center text-sm text-muted-foreground">Aucune commande active à confier.</div>
      </SectionPanel>
    );
  }

  function ajouter() {
    const conf = Math.round(Number(qteConfiee));
    if (!Number.isFinite(conf) || conf <= 0) {
      toast("Saisissez une quantité confiée (> 0).");
      return;
    }
    const fac = faconniers.find((f) => f.id === facId);
    start(async () => {
      const res = await ajouterConfiageAction({
        commandeId: cmd.id,
        faconnierId: facId ?? undefined,
        faconnier: fac?.nom ?? "",
        qteConfiee: conf,
        qteExpediee: Math.max(0, Math.round(Number(qteExpediee) || 0)),
        dateRetourPrevue: dateRetour || null,
        prixFacon: prix ? Number(String(prix).replace(",", ".")) : (cmd.prixFacon ?? fac?.prixFacon ?? null),
      });
      if (res.ok) {
        toast(`Confiage enregistré : ${nb.format(conf)} pcs`);
        setQteConfiee("");
        setQteExpediee("");
        setDateRetour("");
        setPrix("");
        router.refresh();
      } else {
        toast(res.error ?? "Échec de l'enregistrement");
      }
    });
  }

  return (
    <SectionPanel title="Nouveau confiage">
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">OF / commande</span>
          <select
            className="min-w-[240px] rounded border bg-transparent px-2 py-1.5 text-sm"
            value={cmd.id}
            onChange={(e) => setCmdId(Number(e.target.value))}
          >
            {commandes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.of} · {c.modele} · {c.client} ({nb.format(c.qte)} pcs)
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">Façonnier</span>
          <select className="min-w-[160px] rounded border bg-transparent px-2 py-1.5 text-sm" value={facId ?? ""} onChange={(e) => setFacId(Number(e.target.value))}>
            {faconniers.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nom}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">Confié</span>
          <input type="number" className="w-24 rounded border bg-transparent px-2 py-1.5 text-right text-sm tabular-nums" value={qteConfiee} onChange={(e) => setQteConfiee(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">Expédié</span>
          <input type="number" className="w-24 rounded border bg-transparent px-2 py-1.5 text-right text-sm tabular-nums" value={qteExpediee} onChange={(e) => setQteExpediee(e.target.value)} placeholder="0" />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">Retour prévu</span>
          <input type="date" className="rounded border bg-transparent px-2 py-1.5 text-sm" value={dateRetour} onChange={(e) => setDateRetour(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">Prix façon (€/pc)</span>
          <input className="w-24 rounded border bg-transparent px-2 py-1.5 text-right text-sm tabular-nums" value={prix} onChange={(e) => setPrix(e.target.value)} placeholder={cmd.prixFacon != null ? String(cmd.prixFacon) : ""} />
        </label>
        <button className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50" disabled={pending} onClick={ajouter}>
          Enregistrer
        </button>
      </div>

      <div className="rounded border">
        <div className="border-b px-3 py-2 text-xs font-semibold">
          Confiages de {cmd.of} · {cmd.modele}
        </div>
        {lignes.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">Aucun confiage pour cette commande.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-3 py-2">Façonnier</th>
                <th className="px-3 py-2 text-right">Confié</th>
                <th className="px-3 py-2 text-right">Expédié</th>
                <th className="px-3 py-2">Retour prévu</th>
                <th className="px-3 py-2 text-right">Prix façon</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((l) => (
                <tr key={l.id} className="border-b">
                  <td className="px-3 py-2">{l.faconnier || "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{nb.format(l.qteConfiee)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{l.qteExpediee ? nb.format(l.qteExpediee) : "—"}</td>
                  <td className="px-3 py-2 tabular-nums">{l.dateRetourPrevue ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{l.prixFacon != null ? `${l.prixFacon} €` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </SectionPanel>
  );
}
