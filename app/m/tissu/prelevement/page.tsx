import { Fragment } from "react";
import Link from "next/link";
import { accesTissuPage } from "@/lib/auth/tissu";
import { commandesPourSortie, listePrelevement } from "@/lib/services/rouleaux";
import { Cadre, Entete, Info, nb } from "../ui";
import { Imprimer } from "./imprimer";

/* LISTE DE PRÉLÈVEMENT d'un OF : les rouleaux à aller chercher, dans l'ordre
 * de passage — un bain à la fois, les rouleaux entamés d'abord (on finit ce
 * qui est ouvert), puis dans l'ordre des rayons. Elle se lit sur le
 * téléphone et s'imprime (format A4). Elle ne sort rien : la sortie se fait
 * au scan, comme avant. */

export const dynamic = "force-dynamic";
export const metadata = { title: "Liste de prélèvement", robots: { index: false, follow: false } };

export default async function PrelevementPage({ searchParams }: { searchParams: Promise<{ of?: string }> }) {
  const sp = await searchParams;
  const { user } = await accesTissuPage(`/m/tissu/prelevement${sp.of ? `?of=${sp.of}` : ""}`);
  const id = Number(sp.of) || 0;
  const liste = id ? await listePrelevement(id) : null;

  if (!liste) {
    const commandes = (await commandesPourSortie(null)).slice(0, 80);
    return (
      <Cadre retour={{ href: "/m/tissu", label: "Scanner" }}>
        <Entete utilisateur={user.name} titre="Prélèvement" />
        <h1 className="mb-3 text-3xl font-black">Liste de prélèvement</h1>
        <div className="mb-2 text-sm text-slate-600">Choisissez l&apos;OF :</div>
        <div className="divide-y rounded-2xl bg-white">
          {commandes.map((c) => (
            <Link key={c.id} href={`/m/tissu/prelevement?of=${c.id}`} className="block px-4 py-3 font-bold">
              {c.label}
            </Link>
          ))}
        </div>
      </Cadre>
    );
  }

  const { cible, lignes, reserves } = liste;
  /* À PRENDRE : les rouleaux, dans l'ordre, jusqu'à couvrir le reste à sortir.
     Au-delà, ils sont listés « en réserve » (en cas de défaut, de chute). */
  const avecBesoin: ((typeof lignes)[number] & { aPrendre: boolean })[] = [];
  for (let i = 0, cumul = 0; i < lignes.length; i++) {
    avecBesoin.push({ ...lignes[i], aPrendre: cible.reste <= 0.001 || cumul < cible.reste - 0.001 });
    cumul += lignes[i].disponible;
  }
  const bains = [...new Set(lignes.map((l) => l.bain || "—"))];
  const unite = lignes[0]?.unite ?? "m";

  return (
    <Cadre retour={{ href: "/m/tissu/sortie", label: "Sortie groupée" }}>
      <style>{`@media print { @page { size: A4 portrait; margin: 12mm } .no-print { display: none !important } body { background: #fff } }`}</style>
      <Entete utilisateur={user.name} titre="Prélèvement" />
      <h1 className="text-2xl font-black">Prélèvement — {cible.label}</h1>
      <div className="mb-3 text-sm text-slate-600">
        {cible.client || "—"} · {cible.reference || "réf. —"} · {cible.couleur || "couleur —"}
      </div>
      {cible.besoin > 0 && (
        <div className="mb-3 grid grid-cols-3 gap-2 text-center">
          <Info label="Besoin" v={cible.besoin} u={unite} />
          <Info label="Déjà sorti" v={cible.sorti} u={unite} />
          <Info label="Reste" v={cible.reste} u={unite} fort />
        </div>
      )}
      {!reserves && lignes.length > 0 && (
        <div className="mb-3 rounded-xl bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-900">
          Aucun lot n&apos;est encore réservé à cet OF : voici les rouleaux du client qui conviennent (même référence, même couleur). Pensez à affecter le lot.
        </div>
      )}
      {bains.length > 1 && (
        <div className="mb-3 rounded-xl bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-900">
          ⚠ {bains.length} bains différents : prenez un bain à la fois, ne les mélangez pas dans un matelas.
        </div>
      )}
      {lignes.length === 0 ? (
        <div className="rounded-2xl bg-white px-4 py-6 text-center text-sm text-slate-600">Aucun rouleau en rayon pour cet OF.</div>
      ) : (
        <div className="overflow-hidden rounded-2xl bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-[10px] uppercase text-slate-500">
                <th className="px-2 py-2 text-left">✓</th>
                <th className="px-2 py-2 text-left">Emplacement</th>
                <th className="px-2 py-2 text-left">Rouleau</th>
                <th className="px-2 py-2 text-right">Dispo</th>
              </tr>
            </thead>
            <tbody>
              {avecBesoin.map((l, i) => (
                <Fragment key={l.code}>
                  {(i === 0 || l.bain !== avecBesoin[i - 1].bain) && (
                    <tr key={`b-${l.code}`} className="bg-slate-100">
                      <td colSpan={4} className="px-2 py-1 text-xs font-black uppercase text-slate-600">
                        Bain {l.bain || "non renseigné"} · {l.couleur || "—"}
                      </td>
                    </tr>
                  )}
                  <tr className={`border-b last:border-0 ${l.aPrendre ? "" : "text-slate-400"}`}>
                    <td className="px-2 py-2">☐</td>
                    <td className="px-2 py-2 text-lg font-black">{l.emplacement || "?"}</td>
                    <td className="px-2 py-2">
                      <div className="font-mono font-bold">{l.code}</div>
                      <div className="text-xs text-slate-500">
                        {l.lot}
                        {l.disponible + 0.001 < l.initial ? " · entamé" : ""}
                        {!l.aPrendre ? " · en réserve" : ""}
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right font-bold tabular-nums">
                      {nb.format(l.disponible)} {l.unite}
                    </td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="no-print mt-3 grid grid-cols-2 gap-2">
        <Imprimer />
        <Link href="/m/tissu/sortie" className="rounded-2xl bg-amber-500 px-4 py-3 text-center font-extrabold text-white">
          🚚 Sortie groupée
        </Link>
      </div>
    </Cadre>
  );
}
