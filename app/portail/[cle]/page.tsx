import { notFound } from "next/navigation";
import { COULEUR_RENDEMENT, SEUIL_ALERTE, niveau } from "@/lib/domain/rendement";
import { rendementParCle } from "@/lib/services/portail";

/* Portail rendement d'une ouvrière.
 *
 * Hors du groupe (app) : ni barre latérale, ni session, ni permissions. On y
 * arrive en scannant un QR, depuis un téléphone personnel, sans compte.
 *
 * L'accès tient entièrement à la clé de l'URL. Elle est aléatoire et longue,
 * là où l'application d'origine passait le matricule — devinable en comptant
 * de 1 à 109. Une clé compromise se regénère depuis l'écran Personnel. */

export const dynamic = "force-dynamic";

const nb = new Intl.NumberFormat("fr-FR");
const dateFr = (iso: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(iso)
    ? new Date(`${iso}T00:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })
    : iso;

export async function generateMetadata() {
  return { title: "Mon rendement — DBS Fashion", robots: { index: false, follow: false } };
}

export default async function PortailPage({ params }: { params: Promise<{ cle: string }> }) {
  const { cle } = await params;
  const r = await rendementParCle(cle);
  if (!r) notFound();

  const n = niveau(r.general);
  const couleur = n ? COULEUR_RENDEMENT[n] : "#94a3b8";
  const alerte = r.general !== null && r.general < SEUIL_ALERTE;

  return (
    <div className="min-h-screen bg-slate-900 px-4 py-6 text-white" style={{ colorScheme: "dark" }}>
      <div className="mx-auto max-w-md">
        <header className="mb-5">
          <div className="text-[11px] uppercase tracking-widest text-white/50">DBS Fashion</div>
          <h1 className="text-2xl font-extrabold tracking-tight">{r.nom}</h1>
          <div className="text-[13px] text-white/60">
            Matricule {r.matricule}
            {r.poste && ` · ${r.poste}`}
          </div>
        </header>

        {!r.trouve ? (
          <div className="rounded-2xl bg-white/10 px-5 py-10 text-center">
            <div className="text-4xl">⏳</div>
            <p className="mt-3 text-sm text-white/80">
              Aucune production enregistrée pour le moment.
              <br />
              Revenez après le pointage de votre première heure.
            </p>
          </div>
        ) : (
          <>
            {/* rendement général */}
            <div className="rounded-2xl bg-white/10 px-5 py-6 text-center">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-white/60">
                Rendement général
              </div>
              <div className="mt-1 text-6xl font-black tabular-nums" style={{ color: couleur }}>
                {r.general === null ? "—" : `${r.general}%`}
              </div>
              <div className="mt-1 text-[12px] text-white/60">
                moyenne sur {r.jours.length} journée{r.jours.length > 1 ? "s" : ""}
              </div>
            </div>

            {alerte && (
              <div className="mt-3 rounded-xl border border-red-400/40 bg-red-500/15 px-4 py-3 text-[13px]">
                <b>Objectif non atteint.</b> Le seuil est de {SEUIL_ALERTE} %. Voyez votre cheffe de chaîne : un
                réglage machine ou un poste mal équilibré expliquent souvent l&apos;écart.
              </div>
            )}

            {/* journée en cours */}
            {r.dernier && (
              <section className="mt-5">
                <h2 className="mb-2 text-[13px] font-bold">
                  {dateFr(r.dernier.date)}
                  {r.dernier.rendement !== null && (
                    <span
                      className="ml-2 rounded-full px-2 py-0.5 text-[12px] font-extrabold"
                      style={{ background: `${COULEUR_RENDEMENT[niveau(r.dernier.rendement)!]}33`, color: COULEUR_RENDEMENT[niveau(r.dernier.rendement)!] }}
                    >
                      {r.dernier.rendement}%
                    </span>
                  )}
                </h2>
                <div className="rounded-2xl bg-white/10 p-4">
                  <div className="flex items-end justify-between gap-1.5" style={{ height: 120 }}>
                    {r.dernier.barres.map((b) => {
                      const h = b.pct === null ? 0 : Math.max(4, Math.min(100, b.pct));
                      const c = b.pct === null ? "#475569" : COULEUR_RENDEMENT[niveau(b.pct)!];
                      return (
                        <div key={b.col} className="flex flex-1 flex-col items-center justify-end gap-1">
                          <span className="text-[10px] tabular-nums text-white/70">
                            {b.pct === null ? "" : `${b.pct}%`}
                          </span>
                          <span
                            className="w-full rounded-t"
                            style={{ height: `${h}%`, background: c, minHeight: 3 }}
                          />
                          <span className="text-[10px] text-white/50">{b.col}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Chip label="Pièces du jour" valeur={nb.format(r.dernier.pieces)} />
                    <Chip label="Retouches" valeur={nb.format(r.dernier.retouches)} />
                  </div>
                </div>
              </section>
            )}

            {/* historique */}
            <section className="mt-5">
              <h2 className="mb-2 text-[13px] font-bold">Historique</h2>
              <div className="overflow-hidden rounded-2xl bg-white/10">
                {[...r.jours].reverse().slice(0, 20).map((j) => {
                  const nj = niveau(j.rendement);
                  return (
                    <div key={j.date} className="flex items-center justify-between border-b border-white/10 px-4 py-2.5 last:border-0">
                      <div className="text-[13px]">{dateFr(j.date)}</div>
                      <div className="flex items-center gap-3">
                        <span className="text-[11px] text-white/50">{nb.format(j.pieces)} pcs</span>
                        <span
                          className="w-12 text-right text-[15px] font-bold tabular-nums"
                          style={{ color: nj ? COULEUR_RENDEMENT[nj] : "#94a3b8" }}
                        >
                          {j.rendement === null ? "—" : `${j.rendement}%`}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 flex gap-2">
                <Chip label="Total pièces" valeur={nb.format(r.piecesTotal)} />
                <Chip label="Total retouches" valeur={nb.format(r.retouchesTotal)} />
              </div>
            </section>
          </>
        )}

        <footer className="mt-8 text-center text-[10.5px] text-white/35">
          Page personnelle — ne partagez pas ce lien.
        </footer>
      </div>
    </div>
  );
}

function Chip({ label, valeur }: { label: string; valeur: string }) {
  return (
    <div className="flex-1 rounded-xl bg-white/10 px-3 py-2 text-center">
      <div className="text-[17px] font-extrabold tabular-nums">{valeur}</div>
      <div className="text-[10px] text-white/60">{label}</div>
    </div>
  );
}
