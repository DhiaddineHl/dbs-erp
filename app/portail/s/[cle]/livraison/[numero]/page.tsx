import { notFound } from "next/navigation";
import { qrSvg } from "@/lib/atelier/qr";
import { accesParCle, telephoneReconnu } from "@/lib/services/portail-acces";
import { livraisonDeLAtelier } from "@/lib/services/portail-soustraitant";
import { basePortail } from "@/lib/services/portail";
import { BoutonImprimer } from "@/components/shared/bouton-imprimer";

/* Bon de livraison de l'atelier, avec son QR : imprimé et collé sur le carton,
 * ou simplement montré sur le téléphone au magasinier. Le QR ouvre, CHEZ
 * NOUS (avec un compte), l'écran « Marchandise reçue : valider ». */

export const dynamic = "force-dynamic";

const dateFr = (iso: string) => (iso ? new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—");

export default async function BonLivraisonSt({ params }: { params: Promise<{ cle: string; numero: string }> }) {
  const { cle, numero } = await params;
  const a = await accesParCle(cle, "soustraitant");
  if (!a || !(await telephoneReconnu(a))) notFound();
  const l = await livraisonDeLAtelier(a, decodeURIComponent(numero));
  if (!l) notFound();
  const url = `${(await basePortail()).replace(/\/+$/, "")}/suivi_st/livraison/${encodeURIComponent(l.numero)}`;
  const svg = await qrSvg(url, 240);
  const tot = l.lignes.reduce((s, x) => ({ p: s.p + x.premier, s: s.s + x.second }), { p: 0, s: 0 });
  return (
    <div className="min-h-screen bg-white p-4 text-neutral-900">
      <style>{`@media print { .no-print { display: none !important } @page { size: A5 portrait; margin: 10mm } }`}</style>
      <div className="no-print mb-3 flex gap-2">
        <a href={`/portail/s/${cle}`} className="rounded-lg border px-3 py-2 text-sm font-bold">
          ← Retour
        </a>
        <BoutonImprimer label="Imprimer le bon" />
      </div>
      <div className="mx-auto max-w-sm rounded-2xl border-2 border-neutral-900 p-5 text-center">
        <div className="text-[11px] font-bold uppercase tracking-[0.25em]">Livraison à DBS Fashion</div>
        <div className="mt-1 text-3xl font-black">{l.numero}</div>
        <div className="text-sm">
          {l.of} · {l.modele} · {l.couleur}
        </div>
        <div className="mx-auto mt-3 w-60" dangerouslySetInnerHTML={{ __html: svg }} />
        <table className="mx-auto mt-3 text-sm">
          <thead>
            <tr className="text-[10px] uppercase">
              <th className="px-2 text-left">Taille</th>
              <th className="px-2">1er choix</th>
              <th className="px-2">2e choix</th>
            </tr>
          </thead>
          <tbody>
            {l.lignes.map((x) => (
              <tr key={x.taille} className="border-t">
                <td className="px-2 text-left font-bold">{x.taille}</td>
                <td className="px-2">{x.premier}</td>
                <td className="px-2">{x.second || ""}</td>
              </tr>
            ))}
            <tr className="border-t-2 font-black">
              <td className="px-2 text-left">Total</td>
              <td className="px-2">{tot.p}</td>
              <td className="px-2">{tot.s || ""}</td>
            </tr>
          </tbody>
        </table>
        <div className="mt-3 text-xs">Annoncée le {dateFr(l.annonceeLe)} · {l.statut === "recue" ? "REÇUE" : "à valider à l'arrivée"}</div>
        <div className="mt-1 text-[10px] text-neutral-500">Le magasin scanne ce QR, compte et valide : le bon de réception se crée.</div>
      </div>
    </div>
  );
}
