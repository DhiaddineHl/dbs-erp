"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { annulerFicheCoupe, genererPvCoupe } from "@/lib/actions/coupe";

const dateHeure = (iso: string) => (iso ? new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—");

/* Étape 6 : le PV client (généré, régénéré en nouvelle version), et
 * l'annulation motivée de la fiche. */
export function ActionsFiche({
  id,
  numero,
  annulee,
  peutSaisir,
  pvs,
}: {
  id: number;
  numero: string;
  annulee: boolean;
  peutSaisir: boolean;
  pvs: { numero: string; version: number; createdBy: string; createdAt: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const generer = () =>
    start(async () => {
      const r = await genererPvCoupe(id);
      if (!r.ok) return void toast.error(r.error);
      toast.success(`PV ${r.numero} — version ${r.version} générée`);
      window.open(`/coupe/pv/${encodeURIComponent(r.numero)}?v=${r.version}`, "_blank");
      router.refresh();
    });
  const annuler = () => {
    const motif = prompt(
      `Annuler la fiche ${numero} ?\nElle reste visible (barrée) ; ses quantités sortent du coupé ; les consommations tissu qu'elle a déclarées sont annulées (l'historique reste).\n\nMotif (obligatoire) :`,
    );
    if (!motif?.trim()) return;
    start(async () => {
      const r = await annulerFicheCoupe(id, motif);
      if (!r.ok) return void toast.error(r.error);
      toast.success(`Fiche ${r.numero} annulée`);
      router.refresh();
    });
  };
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border bg-card px-3 py-2.5">
      {peutSaisir && !annulee && (
        <Button disabled={pending} onClick={generer} className="h-9">
          {pvs.length ? "🔁 Régénérer le PV (nouvelle version)" : "📄 GÉNÉRER LE PV DE COUPE"}
        </Button>
      )}
      {pvs.map((p) => (
        <Link
          key={p.version}
          href={`/coupe/pv/${encodeURIComponent(p.numero)}?v=${p.version}`}
          target="_blank"
          className="rounded-md border px-2.5 py-1.5 text-xs font-semibold hover:bg-muted"
          title={`Généré le ${dateHeure(p.createdAt)} par ${p.createdBy}`}
        >
          🖨 {p.numero} v{p.version}
        </Link>
      ))}
      {peutSaisir && !annulee && (
        <button disabled={pending} onClick={annuler} className="ml-auto text-xs font-semibold text-[var(--danger-d)] hover:underline">
          Annuler cette fiche…
        </button>
      )}
    </div>
  );
}
