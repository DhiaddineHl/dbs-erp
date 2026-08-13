import { notFound } from "next/navigation";
import { COULEUR_RENDEMENT, niveau } from "@/lib/domain/rendement";
import { vueDirection } from "@/lib/services/portail";
import { getSetting } from "@/lib/services/permissions";

/* QR direction — suivi des chaînes en temps réel, sans nom d'ouvrière.
 *
 * Public comme le portail individuel, mais protégé par un jeton que
 * l'administrateur génère depuis l'écran QR : il donne une vue d'ensemble de
 * la production, ce qui n'a rien à faire sur une URL devinable. */

export const dynamic = "force-dynamic";

const nb = new Intl.NumberFormat("fr-FR");

export async function generateMetadata() {
  return { title: "Suivi chaînes — DBS Fashion", robots: { index: false, follow: false } };
}

export default async function DirectionPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;
  const jeton = await getSetting<string>("jetonDirection", "");
  // Sans jeton configuré, la page reste fermée : pas d'ouverture par défaut.
  if (!jeton || !t || t !== jeton) notFound();

  const v = await vueDirection();
  const n = niveau(v.global);

  return (
    <div className="min-h-screen bg-slate-900 px-4 py-6 text-white" style={{ colorScheme: "dark" }}>
      <div className="mx-auto max-w-3xl">
        <header className="mb-5 flex items-end justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-widest text-white/50">DBS Fashion</div>
            <h1 className="text-2xl font-extrabold tracking-tight">Suivi des chaînes</h1>
          </div>
          <div className="text-right">
            <div className="text-4xl font-black tabular-nums" style={{ color: n ? COULEUR_RENDEMENT[n] : "#94a3b8" }}>
              {v.global === null ? "—" : `${v.global}%`}
            </div>
            <div className="text-[11px] text-white/50">rendement global</div>
          </div>
        </header>

        {v.chaines.length === 0 ? (
          <div className="rounded-2xl bg-white/10 px-5 py-10 text-center text-sm text-white/70">
            Aucune journée de production enregistrée.
          </div>
        ) : (
          <>
            <div className="mb-4 grid grid-cols-2 gap-3">
              <Tuile label="Chaînes en production" valeur={String(v.chaines.length)} />
              <Tuile label="Pièces produites" valeur={nb.format(v.totalPieces)} />
            </div>

            <div className="space-y-3">
              {v.chaines.map((c) => {
                const nc = niveau(c.rendement);
                const max = Math.max(c.objectifHeure, ...c.parHeure.map((h) => h.qte), 1);
                return (
                  <section key={c.chaine} className="rounded-2xl bg-white/10 p-4">
                    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                      <div>
                        <div className="text-[15px] font-bold">{c.chaine}</div>
                        <div className="text-[11px] text-white/55">
                          {c.modele} · {c.effectif} opératrices · objectif {nb.format(c.objectifHeure)} pcs/h
                        </div>
                      </div>
                      <div
                        className="text-2xl font-black tabular-nums"
                        style={{ color: nc ? COULEUR_RENDEMENT[nc] : "#94a3b8" }}
                      >
                        {c.rendement}%
                      </div>
                    </div>

                    <div className="flex items-end gap-1.5" style={{ height: 84 }}>
                      {c.parHeure.map((h) => {
                        const atteint = c.objectifHeure > 0 && h.qte >= c.objectifHeure;
                        return (
                          <div key={h.col} className="flex flex-1 flex-col items-center justify-end gap-1">
                            <span className="text-[10px] tabular-nums text-white/70">{h.qte || ""}</span>
                            <span
                              className="w-full rounded-t"
                              style={{
                                height: `${Math.max(3, (h.qte / max) * 100)}%`,
                                background: atteint ? COULEUR_RENDEMENT.bon : COULEUR_RENDEMENT.moyen,
                              }}
                            />
                            <span className="text-[9.5px] text-white/45">{h.col}</span>
                          </div>
                        );
                      })}
                    </div>

                    <div className="mt-2 text-right text-[11px] text-white/55">
                      {nb.format(c.sortie)} pièces le {c.date.split("-").reverse().join("/")}
                    </div>
                  </section>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Tuile({ label, valeur }: { label: string; valeur: string }) {
  return (
    <div className="rounded-2xl bg-white/10 px-4 py-3">
      <div className="text-2xl font-extrabold tabular-nums">{valeur}</div>
      <div className="text-[11px] text-white/60">{label}</div>
    </div>
  );
}
