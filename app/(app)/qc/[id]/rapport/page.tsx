import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { FAMILLES_DEFAUT, VERDICTS } from "@/lib/domain/qc";
import { getInspection } from "@/lib/services/qc";
import { BoutonImprimer } from "@/components/shared/bouton-imprimer";

const nb = new Intl.NumberFormat("fr-FR");
const dateFr = (iso: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || "—";
  const [a, m, j] = iso.split("-");
  return `${j}/${m}/${a}`;
};

/* Rapport d'inspection — deux destinataires :
 *   · client    : le résultat et les conditions, sans le nom du façonnier ;
 *   · façonnier : le détail complet, avec ce qu'il doit corriger.
 * Rendu comme une vraie page pour que l'impression du navigateur produise le
 * document, plutôt qu'une fenêtre construite à la main. */
export default async function RapportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ type?: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const { type } = await searchParams;
  const insp = await getInspection(Number(id));
  if (!insp) notFound();

  const pourClient = type !== "faconnier";
  const v = VERDICTS[insp.verdict];
  const p = insp.proposition;
  const mesuresHors = insp.mesures.filter((m) => m.horsTolerance);

  return (
    <div className="mx-auto max-w-4xl bg-white p-8 text-[13px] text-neutral-900 print:p-0">
      <style>{`@media print { .no-print { display: none !important } @page { margin: 14mm } }`}</style>

      <div className="no-print mb-4 flex items-center gap-2">
        <BoutonImprimer />
        <a
          href={`/qc/${insp.id}/rapport?type=${pourClient ? "faconnier" : "client"}`}
          className="rounded-md border px-3 py-1.5 text-xs font-semibold"
        >
          Voir la version {pourClient ? "façonnier" : "client"}
        </a>
      </div>

      {/* en-tête */}
      <div className="flex items-start justify-between border-b-2 border-neutral-900 pb-3">
        <div>
          <div className="text-xl font-extrabold tracking-tight">DBS FASHION</div>
          <div className="text-[11px] uppercase tracking-widest text-neutral-500">Confection export</div>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold">RAPPORT DE CONTRÔLE QUALITÉ</div>
          <div className="text-[12px]">
            {insp.ref_affichee} · {dateFr(insp.date)}
          </div>
          <div className="text-[11px] text-neutral-500">
            Destinataire : {pourClient ? "client" : "façonnier"}
          </div>
        </div>
      </div>

      {/* identification */}
      <table className="mt-4 w-full border-collapse text-[12px]">
        <tbody>
          {[
            ["Ordre de fabrication", insp.of || "—", "Client", insp.client || "—"],
            ["Modèle", insp.modele || "—", "Référence", insp.ref || "—"],
            ["Couleur", insp.couleur || "—", pourClient ? "Contrôleur" : "Façonnier", pourClient ? insp.controleur : insp.faconnier || "—"],
          ].map(([l1, v1, l2, v2], i) => (
            <tr key={i} className="border-b border-neutral-200">
              <th className="w-40 py-1.5 text-left font-semibold text-neutral-500">{l1}</th>
              <td className="py-1.5 font-semibold">{v1}</td>
              <th className="w-40 py-1.5 text-left font-semibold text-neutral-500">{l2}</th>
              <td className="py-1.5 font-semibold">{v2}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* échantillonnage */}
      <h2 className="mt-5 text-[13px] font-bold uppercase tracking-wide">1 · Échantillonnage (ISO 2859-1, niveau II)</h2>
      <div className="mt-2 grid grid-cols-4 gap-2">
        {[
          ["Lot présenté", `${nb.format(insp.lot)} pcs`],
          ["Échantillon contrôlé", `${p.plan.n} pcs`],
          ["Majeurs AQL 2,5", `Ac ${p.plan.ac25} · Re ${p.plan.re25}`],
          ["Mineurs AQL 4,0", `Ac ${p.plan.ac40} · Re ${p.plan.re40}`],
        ].map(([l, val]) => (
          <div key={l} className="rounded border border-neutral-300 px-2 py-1.5 text-center">
            <div className="text-[9.5px] font-bold uppercase text-neutral-500">{l}</div>
            <div className="text-[15px] font-extrabold tabular-nums">{val}</div>
          </div>
        ))}
      </div>

      {/* défauts */}
      <h2 className="mt-5 text-[13px] font-bold uppercase tracking-wide">
        2 · Défauts relevés ({insp.totalDefauts})
      </h2>
      {insp.defauts.length === 0 ? (
        <p className="mt-1.5 text-[12px] text-neutral-500">Aucun défaut relevé sur l&apos;échantillon.</p>
      ) : (
        <table className="mt-2 w-full border-collapse text-[12px]">
          <thead>
            <tr className="border-y border-neutral-300 bg-neutral-100">
              <th className="py-1.5 text-left">Famille</th>
              <th className="py-1.5 text-left">Description</th>
              <th className="py-1.5 text-center">Gravité</th>
              <th className="py-1.5 text-center">Nb</th>
            </tr>
          </thead>
          <tbody>
            {FAMILLES_DEFAUT.flatMap((fam) =>
              insp.defauts
                .filter((d) => d.famille === fam)
                .map((d) => (
                  <tr key={d.id} className="border-b border-neutral-200">
                    <td className="py-1.5">{d.famille}</td>
                    <td className="py-1.5">{d.description || "—"}</td>
                    <td className="py-1.5 text-center font-semibold uppercase">
                      {d.gravite === "critique" ? "⛔ critique" : d.gravite === "majeur" ? "⚠ majeur" : "mineur"}
                    </td>
                    <td className="py-1.5 text-center tabular-nums font-bold">{d.nombre}</td>
                  </tr>
                )),
            )}
          </tbody>
        </table>
      )}

      {/* mesures */}
      <h2 className="mt-5 text-[13px] font-bold uppercase tracking-wide">
        3 · Prises de mesures {mesuresHors.length > 0 && `— ${mesuresHors.length} hors tolérance`}
      </h2>
      {insp.mesures.length === 0 ? (
        <p className="mt-1.5 text-[12px] text-neutral-500">Aucune mesure relevée.</p>
      ) : (
        <table className="mt-2 w-full border-collapse text-[12px]">
          <thead>
            <tr className="border-y border-neutral-300 bg-neutral-100">
              <th className="py-1.5 text-left">Point de mesure</th>
              <th className="py-1.5 text-center">Taille</th>
              <th className="py-1.5 text-right">Spec</th>
              <th className="py-1.5 text-right">Tol. ±</th>
              <th className="py-1.5 text-right">Mesuré</th>
              <th className="py-1.5 text-right">Écart</th>
            </tr>
          </thead>
          <tbody>
            {insp.mesures.map((m) => (
              <tr key={m.id} className={`border-b border-neutral-200 ${m.horsTolerance ? "bg-red-50" : ""}`}>
                <td className="py-1.5">{m.point || "—"}</td>
                <td className="py-1.5 text-center">{m.taille || "—"}</td>
                <td className="py-1.5 text-right tabular-nums">{m.spec ?? "—"}</td>
                <td className="py-1.5 text-right tabular-nums">{m.tolerance ?? "—"}</td>
                <td className="py-1.5 text-right tabular-nums font-semibold">{m.mesure ?? "—"}</td>
                <td className={`py-1.5 text-right tabular-nums font-bold ${m.horsTolerance ? "text-red-700" : ""}`}>
                  {m.ecart == null ? "—" : `${m.ecart > 0 ? "+" : ""}${m.ecart}${m.horsTolerance ? " ⚠" : ""}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* photos */}
      {insp.photosGenerales.length > 0 && (
        <>
          <h2 className="mt-5 text-[13px] font-bold uppercase tracking-wide">4 · Photos</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {insp.photosGenerales.map((ph) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={ph.id} src={`/api/fichier/${ph.hash}`} alt="" className="h-32 rounded border object-cover" />
            ))}
          </div>
        </>
      )}

      {/* verdict */}
      <h2 className="mt-5 text-[13px] font-bold uppercase tracking-wide">Verdict</h2>
      <div
        className={`mt-2 rounded border-2 px-4 py-3 text-center text-[18px] font-extrabold ${
          v.tone === "success"
            ? "border-green-700 bg-green-50 text-green-800"
            : v.tone === "warning"
              ? "border-amber-600 bg-amber-50 text-amber-800"
              : "border-red-700 bg-red-50 text-red-800"
        }`}
      >
        {v.label}
      </div>
      <p className="mt-1.5 text-[11.5px] text-neutral-600">
        Base AQL : critiques {p.critiques} · majeurs (défauts + mesures hors tolérance) {p.majeurs} · mineurs{" "}
        {p.mineurs}. {p.raison}.
        {insp.verdictForce && insp.verdictForce !== p.verdict && (
          <> Verdict arbitré par le contrôleur, différent de la proposition automatique.</>
        )}
      </p>
      {insp.note && (
        <div className="mt-3 rounded border border-neutral-300 bg-neutral-50 px-3 py-2 text-[12px]">
          <b>Observations / conditions :</b> {insp.note}
        </div>
      )}

      <div className="mt-8 flex justify-between border-t border-neutral-300 pt-3 text-[11px] text-neutral-500">
        <div>
          Contrôleur : <b className="text-neutral-900">{insp.controleur || "—"}</b>
          {insp.dateCloture && <> · clôturé le {dateFr(insp.dateCloture)}</>}
        </div>
        <div>{insp.statut === "cloture" ? "Document définitif" : "⚠ Brouillon — non clôturé"}</div>
      </div>
    </div>
  );
}
