"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SectionPanel } from "@/components/shared/section-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import * as A from "@/lib/actions/rouleaux";
import type { InventaireRow } from "@/lib/services/rouleaux";

const q2 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

export function OuvrirInventaireBureau() {
  const router = useRouter();
  const [zone, setZone] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center gap-2">
      <Input value={zone} onChange={(e) => setZone(e.target.value.toUpperCase())} placeholder="Zone (vide = tout)" className="h-8 w-40 bg-card" />
      <Button
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await A.ouvrirInventaire({ zone });
            if (!r.ok) return void toast.error(r.error);
            toast.success(`Inventaire ${r.numero} ouvert — scannez au téléphone`);
            router.push(`/magtissu/inventaires/${r.id}`);
          })
        }
      >
        Ouvrir un inventaire
      </Button>
    </div>
  );
}

/** Résultat d'un inventaire et clôture : le responsable coche ce qu'il
 * valide. Rien n'est corrigé sans lui. */
export function ClotureInventaire({ inventaire: inv, peutSaisir }: { inventaire: InventaireRow; peutSaisir: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const res = inv.resultat;
  const [corr, setCorr] = useState<Record<number, boolean>>({});
  const [rang, setRang] = useState<Record<number, boolean>>({});
  const nCorr = Object.values(corr).filter(Boolean).length;
  const nRang = Object.values(rang).filter(Boolean).length;

  const cloturer = () => {
    const corrections = [
      ...res.ecarts.filter((e) => corr[e.id]).map((e) => ({ rouleauId: e.id, nouveauDisponible: String(e.constate) })),
      ...res.manquants.filter((m) => corr[m.id]).map((m) => ({ rouleauId: m.id, nouveauDisponible: "0" })),
    ];
    const rangements = res.malRanges.filter((m) => rang[m.id]).map((m) => ({ rouleauId: m.id, emplacement: m.trouveA }));
    if (!confirm(`Clôturer ${inv.numero} ? ${corrections.length} correction(s) et ${rangements.length} déplacement(s) seront passés en mouvements tracés.`)) return;
    start(async () => {
      const r = await A.cloturerInventaire({ inventaireId: inv.id, corrections, rangements });
      if (!r.ok) return void toast.error(r.error);
      toast.success(`Inventaire clôturé : ${r.corriges} correction(s), ${r.deplaces} déplacement(s)`);
      router.refresh();
    });
  };

  const coche = (id: number, etat: Record<number, boolean>, set: typeof setCorr) =>
    peutSaisir ? <input key="c" type="checkbox" checked={!!etat[id]} onChange={(e) => set((s) => ({ ...s, [id]: e.target.checked }))} /> : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-5">
        {(
          [
            ["Trouvés", `${res.trouves}/${res.attendus}`],
            ["Manquants", res.manquants.length],
            ["Non enregistrés", res.nonEnregistres.length],
            ["Écarts de métrage", res.ecarts.length],
            ["Mal rangés", res.malRanges.length],
          ] as const
        ).map(([l, v]) => (
          <div key={l} className="rounded-lg border bg-card px-2 py-2">
            <div className="text-[10px] font-bold uppercase text-muted-foreground">{l}</div>
            <div className="text-2xl font-extrabold tabular-nums">{v}</div>
          </div>
        ))}
      </div>

      <SectionPanel title={`Écarts de métrage (${res.ecarts.length})`} flush>
        <Table
          vide="Aucun écart au-delà de la tolérance (0,5 m)."
          tetes={["", "Rouleau", "Emplacement", "Attendu", "Constaté", "Écart"]}
          lignes={res.ecarts.map((e) => [
            coche(e.id, corr, setCorr),
            <Code key="r" code={e.code} />,
            e.emplacement || "—",
            `${q2.format(e.disponible)} m`,
            `${q2.format(e.constate)} m`,
            <b key="e" className={e.ecart < 0 ? "text-[var(--danger-d)]" : ""}>{`${e.ecart > 0 ? "+" : ""}${q2.format(e.ecart)} m`}</b>,
          ])}
        />
      </SectionPanel>

      <SectionPanel title={`Manquants — attendus, non scannés (${res.manquants.length})`} flush>
        <Table
          vide="Tous les rouleaux attendus ont été scannés."
          tetes={["", "Rouleau", "Emplacement théorique", "Disponible théorique"]}
          lignes={res.manquants.map((m) => [coche(m.id, corr, setCorr), <Code key="r" code={m.code} />, m.emplacement || "—", `${q2.format(m.disponible)} m`])}
        />
        {peutSaisir && res.manquants.length > 0 && <p className="px-3 py-2 text-[11px] text-muted-foreground">Cocher un manquant le passe à 0 m (correction « Inventaire {inv.numero} »). Cherchez-le d&apos;abord.</p>}
      </SectionPanel>

      <SectionPanel title={`Non enregistrés — scannés mais inconnus ou hors stock (${res.nonEnregistres.length})`} flush>
        <Table
          vide="Aucun."
          tetes={["Code scanné", "Où", "Métrage constaté", "Explication"]}
          lignes={res.nonEnregistres.map((s) => [
            s.rouleauId ? <Code key="r" code={s.code} /> : <span key="r" className="font-mono font-bold text-[var(--danger-d)]">{s.code}</span>,
            s.emplacementCode || "—",
            s.metrageConstate != null ? `${q2.format(s.metrageConstate)} m` : "—",
            s.rouleauId ? "Connu mais pas censé être en rayon (sorti, épuisé, non réceptionné…) : ouvrez sa fiche." : "Aucun rouleau de ce code dans l'ERP.",
          ])}
        />
      </SectionPanel>

      <SectionPanel title={`Mal rangés (${res.malRanges.length})`} flush>
        <Table
          vide="Aucun."
          tetes={["", "Rouleau", "Emplacement théorique", "Trouvé à"]}
          lignes={res.malRanges.map((m) => [coche(m.id, rang, setRang), <Code key="r" code={m.code} />, m.emplacement || "—", <b key="t">{m.trouveA}</b>])}
        />
      </SectionPanel>

      {peutSaisir && (
        <div className="sticky bottom-3 flex items-center gap-3 rounded-lg border bg-card p-3 shadow">
          <span className="text-xs text-muted-foreground">
            {nCorr} correction(s) · {nRang} déplacement(s) cochés — chacun devient un mouvement tracé (avant / après, motif « Inventaire {inv.numero} »).
          </span>
          <Button className="ml-auto" disabled={pending} onClick={cloturer}>
            Clôturer l&apos;inventaire
          </Button>
        </div>
      )}
    </div>
  );
}

function Code({ code }: { code: string }) {
  return (
    <Link href={`/magtissu/rouleaux/${code}`} target="_blank" className="font-mono font-bold text-brand hover:underline">
      {code}
    </Link>
  );
}

function Table({ tetes, lignes, vide }: { tetes: string[]; lignes: React.ReactNode[][]; vide: string }) {
  if (!lignes.length) return <div className="px-3 py-4 text-center text-xs text-muted-foreground">{vide}</div>;
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b bg-muted/40 text-[10px] uppercase text-muted-foreground">
          {tetes.map((t, i) => (
            <th key={i} className="px-3 py-2 text-left">
              {t}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {lignes.map((l, i) => (
          <tr key={i} className="border-b">
            {l.map((c, j) => (
              <td key={j} className="px-3 py-1.5">
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
