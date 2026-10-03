import Link from "next/link";
import { accesTissuPage } from "@/lib/auth/tissu";
import { chargerRouleaux } from "@/lib/services/rouleaux";
import { Cadre, Entete, nb } from "./ui";
import { ScanAccueil } from "./scan-accueil";

/* Accueil mobile du magasin tissu : on scanne, l'application ouvre la bonne
 * fiche (rouleau ou emplacement). Même écran pour la caméra et la douchette. */

export const dynamic = "force-dynamic";
export const metadata = { title: "Magasin tissu — scan", robots: { index: false, follow: false } };

export default async function ScanTissuPage() {
  const { user } = await accesTissuPage("/m/tissu");
  const rouleaux = await chargerRouleaux();
  // Rouleaux créés au bureau (métrage connu), à scanner pour les passer en stock.
  const attente = rouleaux.filter((r) => r.statut === "en_attente");
  // Étiquettes collées avant la mesure : le métrage se tape au scan.
  const aMesurer = rouleaux.filter((r) => r.statut === "a_mesurer").length;
  const parBon = new Map<string, { id: number; n: number; m: number }>();
  for (const r of attente) {
    const e = parBon.get(r.reception.numero) ?? { id: r.reception.id, n: 0, m: 0 };
    e.n++;
    e.m += r.metrageInitial;
    parBon.set(r.reception.numero, e);
  }
  return (
    <Cadre>
      <Entete utilisateur={user.name} titre="Magasin tissu" />
      <h1 className="mb-3 text-3xl font-black">Scanner un rouleau</h1>
      <ScanAccueil />
      <Link
        href="/m/tissu/mesure"
        className={`mt-4 block rounded-2xl px-4 py-4 text-center text-lg font-extrabold shadow-sm ${aMesurer ? "bg-emerald-600 text-white" : "bg-white text-slate-700"}`}
      >
        📏 Mesurer les rouleaux{aMesurer ? ` (${aMesurer} à mesurer)` : ""}
      </Link>
      <Link href="/m/tissu/sortie" className="mt-3 block rounded-2xl bg-amber-500 px-4 py-4 text-center text-lg font-extrabold text-white shadow-sm">
        🚚 Sortie groupée (sous-traitant / coupe)
      </Link>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Link href="/m/tissu/inventaire" className="rounded-2xl bg-white px-4 py-4 text-center font-bold shadow-sm">
          📋 Inventaire
        </Link>
        <Link href="/magtissu?onglet=rouleaux" className="rounded-2xl bg-white px-4 py-4 text-center font-bold shadow-sm">
          🖥 Magasin tissu
        </Link>
      </div>
      {parBon.size > 0 && (
        <div className="mt-6">
          <div className="mb-1 text-xs font-bold uppercase text-slate-500">Rouleaux à réceptionner ({attente.length})</div>
          <div className="divide-y rounded-2xl bg-white text-sm">
            {[...parBon.entries()].map(([numero, e]) => (
              <div key={numero} className="flex justify-between px-4 py-3">
                <span className="font-bold">{numero}</span>
                <span className="text-slate-600">
                  {e.n} rouleau(x) · {nb.format(e.m)} m
                </span>
              </div>
            ))}
          </div>
          <p className="mt-1 text-xs text-slate-500">Scannez chaque rouleau à son arrivée au magasin pour le passer « en stock ».</p>
        </div>
      )}
    </Cadre>
  );
}
