import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { FAMILLES_DEFAUT, GRAVITES, VERDICTS, libelleType, statutActionLabel, statutPointLabel } from "@/lib/domain/qc";
import { getInspection } from "@/lib/services/qc";
import { BoutonImprimer } from "@/components/shared/bouton-imprimer";

const nb = new Intl.NumberFormat("fr-FR");
const dateFr = (iso: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || "—";
  const [a, m, j] = iso.split("-");
  return `${j}/${m}/${a}`;
};
const graviteLabel = (g: string) => GRAVITES.find((x) => x.value === g)?.label ?? g;

/* Rapport d'inspection — document professionnel partageable avec le client.
 *
 * Deux destinataires :
 *   · client    : résultat, échantillonnage, défauts, mesures, photos — sans le
 *                 nom du façonnier ni les observations internes ;
 *   · façonnier : le détail complet, avec ce qu'il doit corriger.
 *
 * Rendu comme une vraie page : l'impression du navigateur produit le PDF, les
 * photos étant de vraies <img> servies par /api/fichier. Les sauts de page CSS
 * répartissent proprement les défauts et leurs photos sur plusieurs feuilles. */
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
  const pass = insp.verdict === "accepte";
  const p = insp.proposition;
  const mesuresHors = insp.mesures.filter((m) => m.horsTolerance);

  const defautsOrdonnes = FAMILLES_DEFAUT.flatMap((fam) => insp.defauts.filter((d) => d.famille === fam));
  const numeroDe = new Map(defautsOrdonnes.map((d, i) => [d.id, i + 1]));
  const defautsAvecPhotos = defautsOrdonnes.filter((d) => d.photos.length > 0);

  const tone =
    v.tone === "success"
      ? "border-green-700 bg-green-50 text-green-800"
      : v.tone === "warning"
        ? "border-amber-600 bg-amber-50 text-amber-800"
        : "border-red-700 bg-red-50 text-red-800";

  return (
    <div className="mx-auto max-w-4xl bg-white p-8 text-[13px] text-neutral-900 print:p-0">
      <style>{`
        @media print {
          .no-print { display: none !important }
          @page { margin: 13mm }
          .avoid-break { break-inside: avoid }
          .page-break { break-before: page }
        }
      `}</style>

      <div className="no-print mb-4 flex items-center gap-2">
        <BoutonImprimer />
        <a
          href={`/qc/${insp.id}/rapport?type=${pourClient ? "faconnier" : "client"}`}
          className="rounded-md border px-3 py-1.5 text-xs font-semibold"
        >
          Voir la version {pourClient ? "façonnier" : "client"}
        </a>
      </div>

      {/* ═══════════ PAGE 1 — RÉSUMÉ ═══════════ */}
      <div className="flex items-start justify-between border-b-2 border-neutral-900 pb-3">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/dbs-fashion-logo.png" alt="DBS Fashion" className="h-12 w-auto object-contain" />
          <div>
            <div className="text-xl font-extrabold tracking-tight">DBS FASHION</div>
            <div className="text-[11px] uppercase tracking-widest text-neutral-500">Confection export</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold">RAPPORT DE CONTRÔLE QUALITÉ</div>
          <div className="text-[12px]">
            {insp.ref_affichee} · {libelleType(insp.typeControle)} · {dateFr(insp.date)}
          </div>
          <div className="text-[11px] text-neutral-500">Destinataire : {pourClient ? "client" : "façonnier"}</div>
        </div>
      </div>

      <div className={`mt-4 flex items-center justify-between rounded border-2 px-4 py-2.5 ${tone}`}>
        <div className="text-[13px] font-bold uppercase tracking-wide">Résultat global</div>
        <div className="text-[20px] font-extrabold">
          {pass ? "PASS" : "FAIL"} · {v.label}
        </div>
      </div>

      <table className="mt-4 w-full border-collapse text-[12px]">
        <tbody>
          {[
            ["Client", insp.client || "—", "Type de contrôle", libelleType(insp.typeControle)],
            ["Ordre de fabrication", insp.of || "—", "Référence", insp.ref || "—"],
            ["Désignation / Modèle", insp.modele || "—", "Saison", insp.saison || "—"],
            ["Couleur", insp.couleur || "—", "Date du contrôle", dateFr(insp.date)],
            [
              "Contrôleur",
              insp.controleur || "—",
              pourClient ? "Résultat" : "Façonnier",
              pourClient ? (pass ? "PASS" : "FAIL") : insp.faconnier || "—",
            ],
          ].map(([l1, v1, l2, v2], i) => (
            <tr key={i} className="border-b border-neutral-200">
              <th className="w-44 py-1.5 text-left font-semibold text-neutral-500">{l1}</th>
              <td className="py-1.5 font-semibold">{v1}</td>
              <th className="w-40 py-1.5 text-left font-semibold text-neutral-500">{l2}</th>
              <td className="py-1.5 font-semibold">{v2}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 grid grid-cols-4 gap-2">
        {[
          ["Qté commandée", insp.qteCommande ? `${nb.format(insp.qteCommande)} pcs` : "—"],
          ["Qté produite", insp.qteProduite ? `${nb.format(insp.qteProduite)} pcs` : "—"],
          ["Lot présenté", `${nb.format(insp.lot)} pcs`],
          ["Qté contrôlée", `${insp.qteControlee || p.plan.n} pcs`],
        ].map(([l, val]) => (
          <div key={l} className="rounded border border-neutral-300 px-2 py-1.5 text-center">
            <div className="text-[9.5px] font-bold uppercase text-neutral-500">{l}</div>
            <div className="text-[15px] font-extrabold tabular-nums">{val}</div>
          </div>
        ))}
      </div>

      {/* ═══════════ AQL + SYNTHÈSE ═══════════ */}
      <h2 className="mt-5 text-[13px] font-bold uppercase tracking-wide">1 · Échantillonnage (ISO 2859-1, niveau II)</h2>
      <div className="mt-2 grid grid-cols-4 gap-2">
        {[
          ["Lot présenté", `${nb.format(insp.lot)} pcs`],
          ["Échantillon", `${p.plan.n} pcs`],
          ["Majeurs AQL 2,5", `Ac ${p.plan.ac25} · Re ${p.plan.re25}`],
          ["Mineurs AQL 4,0", `Ac ${p.plan.ac40} · Re ${p.plan.re40}`],
        ].map(([l, val]) => (
          <div key={l} className="rounded border border-neutral-300 px-2 py-1.5 text-center">
            <div className="text-[9.5px] font-bold uppercase text-neutral-500">{l}</div>
            <div className="text-[15px] font-extrabold tabular-nums">{val}</div>
          </div>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {[
          ["Critiques", p.critiques, "border-red-300 bg-red-50 text-red-800"],
          ["Majeurs (défauts + mesures hors tol.)", p.majeurs, "border-amber-300 bg-amber-50 text-amber-800"],
          ["Mineurs", p.mineurs, "border-neutral-300 bg-neutral-50 text-neutral-700"],
        ].map(([l, val, cls]) => (
          <div key={l as string} className={`rounded border px-3 py-2 text-center ${cls}`}>
            <div className="text-[9.5px] font-bold uppercase">{l}</div>
            <div className="text-[20px] font-extrabold tabular-nums">{val as number}</div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11.5px] text-neutral-600">
        Décision AQL : {p.raison}.
        {insp.verdictForce && insp.verdictForce !== p.verdict && (
          <> Verdict arbitré par le contrôleur, différent de la proposition automatique.</>
        )}
      </p>

      <h2 className="mt-5 text-[13px] font-bold uppercase tracking-wide">2 · Défauts relevés ({insp.totalDefauts})</h2>
      {defautsOrdonnes.length === 0 ? (
        <p className="mt-1.5 text-[12px] text-neutral-500">Aucun défaut relevé sur l&apos;échantillon.</p>
      ) : (
        <table className="mt-2 w-full border-collapse text-[12px]">
          <thead>
            <tr className="border-y border-neutral-300 bg-neutral-100">
              <th className="py-1.5 pl-1 text-left">#</th>
              <th className="py-1.5 text-left">Catégorie</th>
              <th className="py-1.5 text-left">Emplacement</th>
              <th className="py-1.5 text-left">Description</th>
              <th className="py-1.5 text-center">Gravité</th>
              <th className="py-1.5 pr-1 text-center">Nb</th>
            </tr>
          </thead>
          <tbody>
            {defautsOrdonnes.map((d) => (
              <tr key={d.id} className="border-b border-neutral-200">
                <td className="py-1.5 pl-1 font-bold tabular-nums">#{String(numeroDe.get(d.id)).padStart(2, "0")}</td>
                <td className="py-1.5">{d.famille}</td>
                <td className="py-1.5">{d.emplacement || "—"}</td>
                <td className="py-1.5">{d.description || "—"}</td>
                <td className="py-1.5 text-center font-semibold uppercase">
                  {d.gravite === "critique" ? "⛔ critique" : d.gravite === "majeur" ? "⚠ majeur" : "mineur"}
                </td>
                <td className="py-1.5 pr-1 text-center font-bold tabular-nums">{d.nombre}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* ═══════════ DÉFAUTS EN PHOTOS ═══════════ */}
      {defautsAvecPhotos.length > 0 && (
        <div className="page-break">
          <h2 className="text-[13px] font-bold uppercase tracking-wide">3 · Détail des défauts en images</h2>
          <div className="mt-2 space-y-4">
            {defautsAvecPhotos.map((d) => (
              <div key={d.id} className="avoid-break rounded border border-neutral-300 p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-neutral-200 pb-1.5">
                  <div className="text-[13px] font-extrabold">
                    DÉFAUT #{String(numeroDe.get(d.id)).padStart(2, "0")} — {d.famille}
                  </div>
                  <div className="text-[11px] font-semibold uppercase text-neutral-600">
                    {graviteLabel(d.gravite)}
                    {d.emplacement ? ` · ${d.emplacement}` : ""}
                  </div>
                </div>
                {d.description && <div className="mt-1.5 text-[12px]">{d.description}</div>}
                <div className="mt-2 flex flex-wrap gap-2">
                  {d.photos.map((ph) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={ph.id}
                      src={`/api/fichier/${ph.hash}`}
                      alt={`Défaut ${numeroDe.get(d.id)}`}
                      className="avoid-break h-44 w-auto max-w-full rounded border border-neutral-300 object-contain"
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══════════ MESURES ═══════════ */}
      <div className="mt-6">
        <h2 className="text-[13px] font-bold uppercase tracking-wide">
          4 · Tableau des mesures {mesuresHors.length > 0 && `— ${mesuresHors.length} hors tolérance`}
        </h2>
        {insp.mesures.length === 0 ? (
          <p className="mt-1.5 text-[12px] text-neutral-500">Aucune mesure relevée.</p>
        ) : (
          <table className="mt-2 w-full border-collapse text-[12px]">
            <thead>
              <tr className="border-y border-neutral-300 bg-neutral-100">
                <th className="py-1.5 pl-1 text-left">Point de mesure</th>
                <th className="py-1.5 text-center">Taille</th>
                <th className="py-1.5 text-right">Demandé</th>
                <th className="py-1.5 text-right">Tol. −</th>
                <th className="py-1.5 text-right">Tol. +</th>
                <th className="py-1.5 text-right">Réel</th>
                <th className="py-1.5 text-right">Écart</th>
                <th className="py-1.5 pr-1 text-center">Résultat</th>
              </tr>
            </thead>
            <tbody>
              {insp.mesures.map((m) => {
                const tol = m.tolerance == null ? null : Math.abs(m.tolerance);
                return (
                  <tr key={m.id} className={`border-b border-neutral-200 ${m.horsTolerance ? "bg-red-50" : ""}`}>
                    <td className="py-1.5 pl-1">{m.point || "—"}</td>
                    <td className="py-1.5 text-center">{m.taille || "—"}</td>
                    <td className="py-1.5 text-right tabular-nums">{m.spec ?? "—"}</td>
                    <td className="py-1.5 text-right tabular-nums">{tol == null ? "—" : `−${tol}`}</td>
                    <td className="py-1.5 text-right tabular-nums">{tol == null ? "—" : `+${tol}`}</td>
                    <td className="py-1.5 text-right font-semibold tabular-nums">{m.mesure ?? "—"}</td>
                    <td className={`py-1.5 text-right font-bold tabular-nums ${m.horsTolerance ? "text-red-700" : ""}`}>
                      {m.ecart == null ? "—" : `${m.ecart > 0 ? "+" : ""}${m.ecart}`}
                    </td>
                    <td className="py-1.5 pr-1 text-center font-bold">
                      {m.mesure == null || m.spec == null ? (
                        "—"
                      ) : m.horsTolerance ? (
                        <span className="text-red-700">FAIL</span>
                      ) : (
                        <span className="text-green-700">PASS</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {insp.photosGenerales.length > 0 && (
        <div className="avoid-break mt-6">
          <h2 className="text-[13px] font-bold uppercase tracking-wide">5 · Photos générales</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {insp.photosGenerales.map((ph) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={ph.id}
                src={`/api/fichier/${ph.hash}`}
                alt=""
                className="avoid-break h-36 w-auto rounded border border-neutral-300 object-contain"
              />
            ))}
          </div>
        </div>
      )}

      {/* ═══════════ CHECKLIST ═══════════ */}
      {insp.checklist.length > 0 && (
        <div className="avoid-break mt-6">
          <h2 className="text-[13px] font-bold uppercase tracking-wide">
            Checklist de contrôle ({insp.checklist.filter((c) => c.statut === "ok").length}/{insp.checklist.length}{" "}
            conformes)
          </h2>
          <table className="mt-2 w-full border-collapse text-[12px]">
            <thead>
              <tr className="border-y border-neutral-300 bg-neutral-100">
                <th className="py-1.5 pl-1 text-left">#</th>
                <th className="py-1.5 text-left">Point contrôlé</th>
                <th className="py-1.5 text-center">Résultat</th>
                <th className="py-1.5 pr-1 text-left">Note</th>
              </tr>
            </thead>
            <tbody>
              {insp.checklist.map((c, i) => (
                <tr key={c.id} className={`border-b border-neutral-200 ${c.statut === "ko" ? "bg-red-50" : ""}`}>
                  <td className="py-1.5 pl-1 tabular-nums text-neutral-500">{i + 1}</td>
                  <td className="py-1.5">{c.label}</td>
                  <td className="py-1.5 text-center font-bold">
                    {c.statut === "ok" ? (
                      <span className="text-green-700">OK</span>
                    ) : c.statut === "ko" ? (
                      <span className="text-red-700">KO</span>
                    ) : (
                      <span className="text-neutral-500">{statutPointLabel(c.statut)}</span>
                    )}
                  </td>
                  <td className="py-1.5 pr-1 text-neutral-600">{c.note || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══════════ ACTIONS CORRECTIVES ═══════════ */}
      {insp.actions.length > 0 && (
        <div className="avoid-break mt-6">
          <h2 className="text-[13px] font-bold uppercase tracking-wide">6 · Actions correctives</h2>
          <div className="mt-2 space-y-3">
            {insp.actions.map((a) => (
              <div key={a.id} className="avoid-break rounded border border-neutral-300 p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-neutral-200 pb-1.5">
                  <div className="text-[12.5px] font-bold">{a.defaut || "Action corrective"}</div>
                  <div className="text-[11px] font-semibold uppercase text-neutral-600">
                    {statutActionLabel(a.statut)}
                    {a.responsable ? ` · ${a.responsable}` : ""}
                    {a.echeance ? ` · échéance ${dateFr(a.echeance)}` : ""}
                  </div>
                </div>
                <table className="mt-1.5 w-full text-[11.5px]">
                  <tbody>
                    {a.cause && (
                      <tr>
                        <th className="w-24 py-0.5 text-left align-top font-semibold text-neutral-500">Cause</th>
                        <td className="py-0.5">{a.cause}</td>
                      </tr>
                    )}
                    {a.action && (
                      <tr>
                        <th className="w-24 py-0.5 text-left align-top font-semibold text-neutral-500">Action</th>
                        <td className="py-0.5">{a.action}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
                {(a.photoAvant || a.photoApres) && (
                  <div className="mt-2 flex flex-wrap gap-4">
                    {a.photoAvant && (
                      <div>
                        <div className="mb-0.5 text-[9.5px] font-bold uppercase text-neutral-500">Avant</div>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/api/fichier/${a.photoAvant}`}
                          alt="Avant correction"
                          className="avoid-break h-36 w-auto rounded border border-neutral-300 object-contain"
                        />
                      </div>
                    )}
                    {a.photoApres && (
                      <div>
                        <div className="mb-0.5 text-[9.5px] font-bold uppercase text-neutral-500">Après</div>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/api/fichier/${a.photoApres}`}
                          alt="Après correction"
                          className="avoid-break h-36 w-auto rounded border border-neutral-300 object-contain"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══════════ CONCLUSION ═══════════ */}
      <div className="avoid-break mt-6">
        <h2 className="text-[13px] font-bold uppercase tracking-wide">Conclusion &amp; validation</h2>
        <div className={`mt-2 rounded border-2 px-4 py-3 text-center text-[18px] font-extrabold ${tone}`}>
          {pass ? "PASS" : "FAIL"} · {v.label}
        </div>
        <p className="mt-1.5 text-[11.5px] text-neutral-600">
          Base AQL : critiques {p.critiques} · majeurs (défauts + mesures hors tolérance) {p.majeurs} · mineurs{" "}
          {p.mineurs}. {p.raison}.
        </p>
        {!pourClient && insp.note && (
          <div className="mt-3 rounded border border-neutral-300 bg-neutral-50 px-3 py-2 text-[12px]">
            <b>Observations / conditions :</b> {insp.note}
          </div>
        )}

        <div className="mt-6 grid grid-cols-2 gap-8 text-[11px]">
          {[`Contrôleur — ${insp.controleur || "…"}`, pourClient ? "Validation client" : "Responsable façonnier"].map(
            (l) => (
              <div key={l}>
                <div className="font-semibold text-neutral-500">{l}</div>
                <div className="mt-1 h-14 rounded border border-dashed border-neutral-400" />
              </div>
            ),
          )}
        </div>
      </div>

      <div className="mt-6 flex justify-between border-t border-neutral-300 pt-3 text-[11px] text-neutral-500">
        <div>
          {insp.ref_affichee} · {libelleType(insp.typeControle)}
          {insp.dateCloture && <> · clôturé le {dateFr(insp.dateCloture)}</>}
        </div>
        <div>{insp.statut === "cloture" ? "Document définitif" : "⚠ Brouillon — non clôturé"}</div>
      </div>
    </div>
  );
}
