import Link from "next/link";
import { notFound } from "next/navigation";
import { accesTissuPage } from "@/lib/auth/tissu";
import { normaliserEmplacement, statutLabel } from "@/lib/domain/rouleau";
import { chargerRouleaux, listEmplacements } from "@/lib/services/rouleaux";
import { Cadre, Entete, TONS_STATUT, nb } from "../../ui";
import { RangerIci } from "./ranger-ici";

/* Emplacement (rayon) scanné : ce qui s'y trouve, et « ranger ici » en
 * scannant les rouleaux un par un. */

export const dynamic = "force-dynamic";
export const metadata = { title: "Emplacement tissu", robots: { index: false, follow: false } };

export default async function EmplacementMobilePage({ params }: { params: Promise<{ code: string }> }) {
  const code = normaliserEmplacement(decodeURIComponent((await params).code));
  const { user, peutSaisir } = await accesTissuPage(`/m/tissu/e/${code}`);
  const emp = (await listEmplacements()).find((e) => e.code === code);
  if (!emp) notFound();
  const ici = (await chargerRouleaux()).filter((r) => r.emplacementId === emp.id && r.bilan.disponible > 0.001);
  return (
    <Cadre retour={{ href: "/m/tissu", label: "Scanner" }}>
      <Entete utilisateur={user.name} titre="Emplacement" />
      <h1 className="font-mono text-4xl font-black">📍 {emp.code}</h1>
      <div className="text-sm text-slate-600">
        {[emp.zone && `zone ${emp.zone}`, emp.rayon && `rayon ${emp.rayon}`, emp.libelle].filter(Boolean).join(" · ") || "—"}
        {!emp.actif && " · désactivé"}
      </div>
      <div className="my-3 text-lg font-bold">
        {ici.length} rouleau(x) · {nb.format(emp.metrage)} m
      </div>
      {peutSaisir && emp.actif && <RangerIci emplacement={emp.code} />}
      <div className="mt-5 divide-y rounded-2xl bg-white text-sm">
        {ici.length === 0 && <div className="px-4 py-6 text-center text-slate-500">Emplacement vide.</div>}
        {ici.map((r) => (
          <Link key={r.id} href={`/m/tissu/r/${r.code}`} className="flex items-center justify-between gap-2 px-4 py-3">
            <span>
              <span className="font-mono font-bold">{r.code}</span>
              <span className="block text-xs text-slate-500">{[r.lot.reference, r.lot.couleur].filter(Boolean).join(" · ")}</span>
            </span>
            <span className="text-right">
              <span className="block font-bold tabular-nums">{nb.format(r.bilan.disponible)} {r.lot.unite}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${TONS_STATUT[r.statut] ?? ""}`}>{statutLabel(r.statut).label}</span>
            </span>
          </Link>
        ))}
      </div>
    </Cadre>
  );
}
