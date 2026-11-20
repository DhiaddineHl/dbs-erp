"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as A from "@/lib/actions/portail-client";
import type { CommandeClient, PasseportClient, VueClient } from "@/lib/services/portail-client";
import { libelleEcart } from "@/lib/domain/performance-client";

/* Le portail que voit le client : ses commandes en frise, son tissu, la
 * preuve de ce qu'on en a fait, ses échantillons, et ses questions. */

const nb = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const dateFr = (iso: string) => (/^\d{4}-\d{2}-\d{2}/.test(iso ?? "") ? iso.slice(0, 10).split("-").reverse().join("/") : "—");
const FEU = {
  vert: "bg-emerald-100 text-emerald-900",
  orange: "bg-amber-100 text-amber-900",
  rouge: "bg-red-100 text-red-900",
  bleu: "bg-sky-100 text-sky-900",
} as const;

function Entete({ titre, sous }: { titre: string; sous: string }) {
  return (
    <header className="bg-[#0F1F3D] px-4 pb-5 pt-6 text-white">
      <div className="mx-auto max-w-3xl">
        <div className="text-[11px] font-bold uppercase tracking-[0.25em] text-[#C9A227]">DBS Fashion</div>
        <h1 className="mt-1 text-2xl font-black">{titre}</h1>
        <div className="text-sm text-white/70">{sous}</div>
      </div>
    </header>
  );
}

export function EcranPin({ cle, nom }: { cle: string; nom: string }) {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [erreur, setErreur] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="min-h-screen bg-[#F7F6F2]">
      <Entete titre="Suivi de vos commandes" sous={nom} />
      <main className="mx-auto max-w-sm px-4 py-8">
        <label className="block text-sm font-semibold text-slate-700">Code PIN (6 chiffres)</label>
        <input
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          autoFocus
          className="mt-2 w-full rounded-xl border-2 border-slate-300 px-4 py-3 text-center text-3xl font-black tracking-[0.4em]"
        />
        {erreur && <div className="mt-2 rounded-lg bg-red-100 px-3 py-2 text-sm text-red-900">{erreur}</div>}
        <button
          disabled={pending || pin.length !== 6}
          onClick={() =>
            start(async () => {
              const r = await A.entrerPin(cle, pin);
              if (!r.ok) return void setErreur(r.error);
              router.refresh();
            })
          }
          className="mt-4 w-full rounded-xl bg-[#0F1F3D] py-3 text-lg font-bold text-white disabled:opacity-40"
        >
          Entrer
        </button>
        <p className="mt-3 text-xs text-slate-500">Ce téléphone sera reconnu pendant 30 jours.</p>
      </main>
    </div>
  );
}

type Onglet = "commandes" | "performance" | "prevision" | "tissu" | "questions";

/** Recherche souple : référence, OF, modèle, couleur, saison (sans accents ni casse). */
const plat = (t: string) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const correspond = (c: CommandeClient, q: string) =>
  !q.trim() || plat(`${c.reference} ${c.of} ${c.modele} ${c.couleur} ${c.saison}`).includes(plat(q.trim()));

export function PortailClient({ cle, vue }: { cle: string; vue: VueClient }) {
  const router = useRouter();
  /* En direct : la page se recharge toute seule chaque minute tant qu'elle
   * est affichée (et dès qu'on y revient), sans rien perdre de la saisie. */
  useEffect(() => {
    const rafraichir = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const t = setInterval(rafraichir, 60_000);
    document.addEventListener("visibilitychange", rafraichir);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", rafraichir);
    };
  }, [router]);
  const [onglet, setOnglet] = useState<Onglet>("commandes");
  const [questionSur, setQuestionSur] = useState<number | null>(null);
  const [recherche, setRecherche] = useState("");
  const [voirArchives, setVoirArchives] = useState(false);
  /* En cours / archives : tout ce qui est parti, livré ou rangé chez nous
   * passe aux archives. La recherche porte sur les deux. */
  const enCours = vue.commandes.filter((c) => !c.archivee && correspond(c, recherche));
  const archives = vue.commandes.filter((c) => c.archivee && correspond(c, recherche));
  const nbEnCours = vue.commandes.filter((c) => !c.archivee).length;
  return (
    <div className="min-h-screen bg-[#F7F6F2] text-slate-900">
      <Entete titre={vue.client} sous={`Suivi de vos commandes · ${vue.contact}`} />
      <nav className="sticky top-0 z-10 border-b bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl gap-1 overflow-x-auto px-2">
          {(
            [
              ["commandes", `Commandes (${nbEnCours})`],
              ["performance", "📊 Performance"],
              ["prevision", "Prévision d'export"],
              ["tissu", "Mon tissu"],
              ["questions", `Questions${vue.questions.length ? ` (${vue.questions.length})` : ""}`],
            ] as const
          ).map(([k, l]) => (
            <button
              key={k}
              onClick={() => setOnglet(k)}
              className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm font-bold ${onglet === k ? "border-[#C9A227] text-[#0F1F3D]" : "border-transparent text-slate-500"}`}
            >
              {l}
            </button>
          ))}
        </div>
      </nav>
      <main className="mx-auto max-w-3xl space-y-4 px-3 py-4">
        {onglet === "commandes" && (
          <>
            <input
              type="search"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="🔍 Rechercher une référence, un modèle, une couleur…"
              className="w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-base shadow-sm outline-none focus:border-[#C9A227]"
            />
            {enCours.length === 0 && <Vide texte={recherche ? "Aucune commande en cours ne correspond." : "Aucune commande en cours."} />}
            {enCours.map((c) => (
              <CarteCommande key={c.id} cle={cle} c={c} onQuestion={() => (setQuestionSur(c.id), setOnglet("questions"))} />
            ))}
            {archives.length > 0 && (
              <section className="rounded-2xl bg-white p-3 shadow-sm">
                {/* Ouvertes d'office quand une recherche y trouve quelque chose. */}
                <button onClick={() => setVoirArchives(!voirArchives)} className="flex w-full items-center justify-between font-bold">
                  <span>🗄 Archives — parties ou livrées ({archives.length})</span>
                  <span className="text-slate-500">{voirArchives || recherche ? "▾" : "▸"}</span>
                </button>
                {(voirArchives || !!recherche) && (
                  <div className="mt-3 space-y-3">
                    {archives.map((c) => (
                      <CarteCommande key={c.id} cle={cle} c={c} onQuestion={() => (setQuestionSur(c.id), setOnglet("questions"))} />
                    ))}
                  </div>
                )}
              </section>
            )}
          </>
        )}
        {onglet === "performance" && <Performance vue={vue} />}
        {onglet === "prevision" && <Prevision vue={vue} />}
        {onglet === "tissu" && <MonTissu cle={cle} vue={vue} />}
        {onglet === "questions" && <Questions cle={cle} vue={vue} commandeInitiale={questionSur} />}
        <p className="pb-6 text-center text-[11px] text-slate-500">
          Avancement en direct · à jour le {dateFr(vue.aujourdhui)} à{" "}
          {new Date(vue.misAJour).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} · DBS Fashion
        </p>
      </main>
    </div>
  );
}

function Vide({ texte }: { texte: string }) {
  return <div className="rounded-2xl bg-white px-4 py-8 text-center text-sm text-slate-500 shadow-sm">{texte}</div>;
}

function CarteCommande({ cle, c, onQuestion }: { cle: string; c: CommandeClient; onQuestion: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [passeport, setPasseport] = useState<PasseportClient | null>(null);
  const [traca, setTraca] = useState(false);
  const [message, setMessage] = useState("");
  const [motif, setMotif] = useState<Record<number, string>>({});
  const lancer = (p: Promise<A.Result>, ok: string) =>
    start(async () => {
      const r = await p;
      setMessage(r.ok ? ok : r.error);
      if (r.ok) router.refresh();
    });
  return (
    <article className="overflow-hidden rounded-2xl bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b px-4 py-3">
        <div className="min-w-0">
          <div className="text-xs font-bold text-slate-500">{c.of}</div>
          <div className="text-lg font-black leading-tight">{c.modele}</div>
          <div className="text-sm text-slate-600">
            {[c.reference, c.couleur, c.saison].filter(Boolean).join(" · ")} · {nb.format(c.qte)} pièces
          </div>
        </div>
        <div className="text-right">
          <span className={`inline-block rounded-full px-3 py-1 text-xs font-black ${FEU[c.feu.ton]}`}>{c.feu.label}</span>
          {c.exportPrevu && <div className="mt-1 text-xs text-slate-500">Expédition prévue le {dateFr(c.exportPrevu)}</div>}
        </div>
      </div>

      {/* La frise : six étapes, les mêmes pour toutes les commandes. */}
      <ol className="grid grid-cols-3 gap-2 px-4 py-3 sm:grid-cols-6">
        {c.etapes.map((e) => (
          <li key={e.cle} className="text-center">
            <div
              className={`mx-auto flex size-9 items-center justify-center rounded-full text-sm font-black ${
                e.etat === "fait" ? "bg-emerald-600 text-white" : e.etat === "en_cours" ? "bg-[#C9A227] text-white" : "bg-slate-200 text-slate-500"
              }`}
            >
              {e.etat === "fait" ? "✓" : e.etat === "en_cours" ? "●" : "○"}
            </div>
            <div className="mt-1 text-[12px] font-bold leading-tight">{e.label}</div>
            <div className="text-[10.5px] leading-tight text-slate-500">{e.detail}</div>
          </li>
        ))}
      </ol>

      {c.tissuManquant > 0 && (
        <div className="mx-4 mb-3 rounded-xl bg-amber-50 p-3 text-sm">
          <b>Il manque {nb.format(c.tissuManquant)} m de tissu</b> pour pouvoir lancer cette commande.
          <button
            disabled={pending}
            onClick={() => lancer(A.decider(cle, "complement", `${nb.format(c.tissuManquant)} m pour ${c.of}`, c.id), "Merci, c'est noté : nous attendons le tissu.")}
            className="ml-2 mt-2 rounded-lg bg-[#0F1F3D] px-3 py-1.5 text-xs font-bold text-white"
          >
            J&apos;envoie le complément
          </button>
        </div>
      )}

      {c.echantillons.length > 0 && (
        <div className="border-t px-4 py-3">
          <div className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Échantillons envoyés</div>
          <ul className="space-y-2">
            {c.echantillons.map((e) => (
              <li key={e.id} className="rounded-xl bg-slate-50 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <b>{e.libelle}</b>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                      e.verdict === "ok" ? "bg-emerald-100 text-emerald-900" : e.verdict === "refus" ? "bg-red-100 text-red-900" : "bg-amber-100 text-amber-900"
                    }`}
                  >
                    {e.verdict === "ok" ? "✓ OK donné" : e.verdict === "refus" ? "✕ Refusé" : "En attente de votre avis"}
                  </span>
                </div>
                <div className="mt-1 text-slate-600">
                  Envoyé le {dateFr(e.envoi)}
                  {e.transporteur ? ` · ${e.transporteur}` : ""}
                  {e.suivi && (
                    <>
                      {" · "}
                      {e.lien ? (
                        <a href={e.lien} target="_blank" rel="noreferrer" className="font-bold text-[#0F1F3D] underline">
                          suivre le colis {e.suivi}
                        </a>
                      ) : (
                        `n° ${e.suivi}`
                      )}
                    </>
                  )}
                </div>
                {e.commentaire && <div className="mt-1 text-xs italic text-slate-500">« {e.commentaire} »</div>}
                {e.verdict === "attente" && (
                  <div className="mt-2 space-y-2">
                    <textarea
                      value={motif[e.id] ?? ""}
                      onChange={(x) => setMotif((m) => ({ ...m, [e.id]: x.target.value }))}
                      placeholder="Votre commentaire (obligatoire pour un refus)"
                      className="w-full rounded-lg border px-3 py-2 text-sm"
                      rows={2}
                    />
                    <div className="flex gap-2">
                      <button
                        disabled={pending}
                        onClick={() => lancer(A.repondreEchantillon(cle, e.id, "ok", motif[e.id] ?? ""), "Merci : votre OK est enregistré.")}
                        className="flex-1 rounded-lg bg-emerald-600 py-2 text-sm font-bold text-white"
                      >
                        ✓ OK
                      </button>
                      <button
                        disabled={pending}
                        onClick={() => lancer(A.repondreEchantillon(cle, e.id, "refus", motif[e.id] ?? ""), "Votre refus est enregistré : nous revenons vers vous.")}
                        className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-bold text-white"
                      >
                        ✕ Refuser
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {c.expeditions.length > 0 && (
        <div className="border-t px-4 py-3 text-sm">
          <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-500">Expéditions</div>
          {c.expeditions.map((x) => (
            <div key={x.numero}>
              {x.numero} · {dateFr(x.date)} · {nb.format(x.pieces)} pcs{x.transporteur ? ` · ${x.transporteur}` : ""}
              {x.suivi &&
                (x.lien ? (
                  <a href={x.lien} target="_blank" rel="noreferrer" className="ml-1 font-bold underline">
                    suivre {x.suivi}
                  </a>
                ) : (
                  ` · n° ${x.suivi}`
                ))}
            </div>
          ))}
        </div>
      )}

      {passeport && <Passeport p={passeport} />}

      <div className="flex flex-wrap gap-2 border-t bg-slate-50 px-4 py-3">
        <button
          disabled={pending}
          onClick={() =>
            passeport
              ? setPasseport(null)
              : start(async () => {
                  const r = await A.passeport(cle, c.id);
                  if (r.ok) setPasseport(r.passeport);
                  else setMessage(r.error);
                })
          }
          className="rounded-lg bg-white px-3 py-2 text-sm font-bold shadow-sm"
        >
          🧵 {passeport ? "Masquer le passeport" : "Passeport tissu de la commande"}
        </button>
        <button onClick={() => setTraca(!traca)} className="rounded-lg bg-white px-3 py-2 text-sm font-bold shadow-sm">
          🧭 {traca ? "Masquer la traçabilité" : "Traçabilité"}
        </button>
        <button onClick={onQuestion} className="rounded-lg bg-white px-3 py-2 text-sm font-bold shadow-sm">
          💬 Poser une question
        </button>
        {c.tailles.length > 0 && (
          <span className="self-center text-xs text-slate-500">
            {c.tailles.map((t) => `${t.taille} ${t.qte}`).join(" · ")}
          </span>
        )}
      </div>
      {traca && <Tracabilite c={c} />}
      {message && <div className="border-t bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-900">{message}</div>}
    </article>
  );
}

/** La preuve de ce qu'on a fait de son tissu. */
function Passeport({ p }: { p: PasseportClient }) {
  return (
    <div className="border-t px-4 py-3 text-sm">
      <div className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Passeport tissu — {p.of}</div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Chiffre l="Tissu reçu" v={`${nb.format(p.recu)} m`} />
        <Chiffre l="Coupé" v={`${nb.format(p.consomme)} m`} s={`${nb.format(p.pieces)} pièces`} />
        <Chiffre
          l="Conso réelle / pièce"
          v={p.consoReelle != null ? `${nb.format(p.consoReelle)} m` : "—"}
          s={p.consoClient != null ? `votre conso : ${nb.format(p.consoClient)} m${p.ecartConsoPct != null ? ` (${p.ecartConsoPct > 0 ? "+" : ""}${nb.format(p.ecartConsoPct)} %)` : ""}` : undefined}
        />
        <Chiffre l="Reste chez nous" v={`${nb.format(p.reste)} m`} s={p.rendu ? `rendu : ${nb.format(p.rendu)} m` : undefined} />
      </div>
      {p.rouleaux.length > 0 && (
        <table className="mt-3 w-full text-xs">
          <thead>
            <tr className="border-b text-left text-[10px] uppercase text-slate-500">
              <th className="py-1">Rouleau</th>
              <th className="py-1">Lot · bain</th>
              <th className="py-1 text-right">Mètres</th>
            </tr>
          </thead>
          <tbody>
            {p.rouleaux.map((r) => (
              <tr key={r.code} className="border-b last:border-0">
                <td className="py-1 font-mono">{r.code}</td>
                <td className="py-1">
                  {r.lot}
                  {r.bain ? ` · bain ${r.bain}` : ""}
                </td>
                <td className="py-1 text-right tabular-nums">
                  {nb.format(r.metres)} {r.unite}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Chiffre({ l, v, s }: { l: string; v: string; s?: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2">
      <div className="text-[10px] font-bold uppercase text-slate-500">{l}</div>
      <div className="text-base font-black tabular-nums">{v}</div>
      {s && <div className="text-[11px] text-slate-500">{s}</div>}
    </div>
  );
}

function MonTissu({ cle, vue }: { cle: string; vue: VueClient }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [fait, setFait] = useState<Record<string, string>>({});
  return (
    <>
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-base font-black">Votre tissu chez nous</h2>
        {vue.lots.length === 0 ? (
          <div className="text-sm text-slate-500">Aucun tissu reçu ces derniers mois.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left text-[10px] uppercase text-slate-500">
                  <th className="py-1.5">Lot</th>
                  <th className="py-1.5">Reçu le</th>
                  <th className="py-1.5 text-right">Votre BL</th>
                  <th className="py-1.5 text-right">Mesuré</th>
                  <th className="py-1.5 text-right">En stock</th>
                  <th className="py-1.5">Réservé pour</th>
                </tr>
              </thead>
              <tbody>
                {vue.lots.map((l) => (
                  <tr key={l.identifiant} className="border-b align-top last:border-0">
                    <td className="py-1.5">
                      <b>{l.identifiant}</b>
                      <div className="text-slate-500">{[l.reference, l.couleur, l.bain && `bain ${l.bain}`].filter(Boolean).join(" · ")}</div>
                    </td>
                    <td className="py-1.5">{dateFr(l.recuLe)}</td>
                    <td className="py-1.5 text-right tabular-nums">{l.annonce != null ? `${nb.format(l.annonce)} ${l.unite}` : "—"}</td>
                    <td className="py-1.5 text-right tabular-nums">
                      {nb.format(l.mesure)} {l.unite}
                      {l.manque > 0 && <div className="font-bold text-red-700">manque {nb.format(l.manque)}</div>}
                    </td>
                    <td className="py-1.5 text-right font-bold tabular-nums">
                      {nb.format(l.disponible)} {l.unite}
                    </td>
                    <td className="py-1.5">{l.pour.join(", ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {vue.lots.some((l) => l.motifs.length) && (
          <p className="mt-2 text-[11px] text-slate-500">Les écarts avec votre bon de livraison sont relevés à la réception, avant toute coupe.</p>
        )}
      </section>
      {vue.reliquats.length > 0 && (
        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="mb-1 text-base font-black">Restes de tissu</h2>
          <p className="mb-2 text-xs text-slate-500">Vos commandes sont coupées : ce tissu vous appartient. Que voulez-vous en faire ?</p>
          <ul className="space-y-2">
            {vue.reliquats.map((r) => (
              <li key={r.identifiant} className="rounded-xl bg-slate-50 p-3 text-sm">
                <b>{r.identifiant}</b> · {[r.reference, r.couleur].filter(Boolean).join(" · ")} ·{" "}
                <b>
                  {nb.format(r.disponible)} {r.unite}
                </b>
                {fait[r.identifiant] ? (
                  <div className="mt-1 font-semibold text-emerald-800">✓ {fait[r.identifiant]}</div>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(["rendre", "garder"] as const).map((d) => (
                      <button
                        key={d}
                        disabled={pending}
                        onClick={() =>
                          start(async () => {
                            const res = await A.decider(cle, d, `${r.identifiant} · ${nb.format(r.disponible)} ${r.unite}`, null);
                            if (res.ok) {
                              setFait((x) => ({ ...x, [r.identifiant]: d === "rendre" ? "Demande de retour envoyée" : "Nous le gardons pour vous" }));
                              router.refresh();
                            }
                          })
                        }
                        className="rounded-lg bg-white px-3 py-1.5 text-xs font-bold shadow-sm"
                      >
                        {d === "rendre" ? "Rendez-le-moi" : "Gardez-le pour une prochaine commande"}
                      </button>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function Questions({ cle, vue, commandeInitiale }: { cle: string; vue: VueClient; commandeInitiale: number | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [texte, setTexte] = useState("");
  const [commande, setCommande] = useState<number | null>(commandeInitiale);
  const [erreur, setErreur] = useState("");
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      <h2 className="mb-2 text-base font-black">Vos questions</h2>
      <div className="max-h-[50vh] space-y-2 overflow-y-auto">
        {vue.questions.length === 0 && <div className="text-sm text-slate-500">Aucun message pour l&apos;instant.</div>}
        {vue.questions.map((q) => (
          <div key={q.id} className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${q.interne ? "bg-[#0F1F3D] text-white" : "ml-auto bg-slate-100"}`}>
            <div className={`text-[10px] font-bold ${q.interne ? "text-[#C9A227]" : "text-slate-500"}`}>
              {q.interne ? `DBS Fashion · ${q.auteur}` : q.auteur} · {dateFr(q.le)}
              {q.commande ? ` · ${q.commande}` : ""}
            </div>
            <div className="whitespace-pre-wrap">{q.texte}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 space-y-2">
        <select value={commande ?? ""} onChange={(e) => setCommande(e.target.value ? Number(e.target.value) : null)} className="w-full rounded-lg border px-3 py-2 text-sm">
          <option value="">Question générale</option>
          {vue.commandes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.of} · {c.modele}
            </option>
          ))}
        </select>
        <textarea value={texte} onChange={(e) => setTexte(e.target.value)} rows={3} placeholder="Votre question…" className="w-full rounded-lg border px-3 py-2 text-sm" />
        {erreur && <div className="text-sm text-red-700">{erreur}</div>}
        <button
          disabled={pending || texte.trim().length < 2}
          onClick={() =>
            start(async () => {
              const r = await A.poserQuestion(cle, texte, commande);
              if (!r.ok) return void setErreur(r.error);
              setTexte("");
              setErreur("");
              router.refresh();
            })
          }
          className="w-full rounded-lg bg-[#0F1F3D] py-2.5 font-bold text-white disabled:opacity-40"
        >
          Envoyer
        </button>
      </div>
    </section>
  );
}

/* ─────────── prévision d'export (publiée chaque week-end) ─────────── */

const ETAT_PREV: Record<string, { label: string; cls: string }> = {
  prete: { label: "Prête à partir", cls: "bg-emerald-100 text-emerald-900" },
  emballage: { label: "En emballage", cls: "bg-sky-100 text-sky-900" },
  production: { label: "En production", cls: "bg-slate-100 text-slate-700" },
};
const CHGT: Record<string, { label: string; cls: string }> = {
  nouvelle: { label: "Nouvelle", cls: "bg-sky-100 text-sky-900" },
  avancee: { label: "Avancée", cls: "bg-emerald-100 text-emerald-900" },
  reportee: { label: "Reportée", cls: "bg-amber-100 text-amber-900" },
  quantite: { label: "Quantité modifiée", cls: "bg-amber-100 text-amber-900" },
  retiree: { label: "Reportée après ces 2 semaines", cls: "bg-red-100 text-red-900" },
};
const ajoute = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

function Prevision({ vue }: { vue: VueClient }) {
  const p = vue.prevision;
  if (!p) return <Vide texte="La prévision d'export est publiée chaque week-end : elle apparaîtra ici." />;
  const semaines = [0, 1].map((i) => ({ debut: ajoute(p.debut, 7 * i), fin: ajoute(p.debut, 7 * i + 6) }));
  const retirees = p.lignes.filter((l) => l.changement === "retiree");
  const publie = new Date(p.publieLe).toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "2-digit" });
  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-[#0F1F3D] px-4 py-3 text-white">
        <div className="text-sm font-bold">
          Prévision d&apos;export du {dateFr(p.debut)} au {dateFr(p.fin)}
        </div>
        <div className="text-xs text-white/70">Publiée le {publie} · la prochaine arrive le week-end prochain</div>
        {p.commentaire && <div className="mt-2 rounded-lg bg-white/10 px-3 py-2 text-sm">💬 {p.commentaire}</div>}
      </div>
      {semaines.map((s, i) => {
        const ls = p.lignes.filter((l) => l.changement !== "retiree" && l.date >= s.debut && l.date <= s.fin);
        const pieces = ls.reduce((n, l) => n + l.qte, 0);
        return (
          <section key={s.debut} className="overflow-hidden rounded-2xl bg-white shadow-sm">
            <div className="flex items-baseline justify-between border-b px-4 py-2">
              <div className="font-black">
                {i === 0 ? (s.debut <= vue.aujourdhui ? "Cette semaine" : "Semaine prochaine") : "La semaine d'après"} <span className="text-sm font-normal text-slate-500">· du {dateFr(s.debut)} au {dateFr(s.fin)}</span>
              </div>
              {pieces > 0 && <div className="text-sm font-bold">{nb.format(pieces)} pcs</div>}
            </div>
            {ls.length === 0 ? (
              <div className="px-4 py-4 text-sm text-slate-500">Aucun départ prévu.</div>
            ) : (
              <ul className="divide-y">
                {ls.map((l) => (
                  <li key={`${l.of}-${l.date}`} className="px-4 py-2.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div>
                        <span className="font-bold">{l.modele}</span> <span className="text-xs text-slate-500">{l.of}</span>
                        <div className="text-xs text-slate-600">{[l.reference, l.couleur].filter(Boolean).join(" · ")}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-black">{dateFr(l.date)}</div>
                        <div className="text-xs">
                          <b>{nb.format(l.qte)}</b> / {nb.format(l.qteCommande)} pcs
                        </div>
                      </div>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1 text-[11px] font-semibold">
                      {ETAT_PREV[l.etat] && <span className={`rounded-full px-2 py-0.5 ${ETAT_PREV[l.etat].cls}`}>{ETAT_PREV[l.etat].label}</span>}
                      {CHGT[l.changement] && (
                        <span className={`rounded-full px-2 py-0.5 ${CHGT[l.changement].cls}`}>
                          {CHGT[l.changement].label}
                          {l.dateAvant && ` (prévue le ${dateFr(l.dateAvant)})`}
                          {l.changement === "quantite" && l.qteAvant != null && ` (${nb.format(l.qteAvant)} pcs avant)`}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
      {retirees.length > 0 && (
        <section className="rounded-2xl border-2 border-red-200 bg-white px-4 py-3 shadow-sm">
          <div className="font-bold text-red-900">Annoncées la semaine dernière, reportées au-delà de ces 2 semaines</div>
          <ul className="mt-1 text-sm">
            {retirees.map((l) => (
              <li key={l.of}>
                {l.modele} <span className="text-xs text-slate-500">{l.of}</span> — était prévue le {dateFr(l.dateAvant)}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/* ─────────── traçabilité d'une commande ─────────── */

function Tracabilite({ c }: { c: CommandeClient }) {
  const cy = c.cycle;
  return (
    <div className="border-t bg-slate-50 px-4 py-3">
      <div className="mb-2 flex flex-wrap gap-2 text-xs">
        {cy.total != null && (
          <span className="rounded-full bg-white px-2 py-1 font-bold shadow-sm">
            {cy.enCours ? `En cours depuis ${cy.total} jours` : `Cycle complet : ${cy.total} jours`}
          </span>
        )}
        {cy.delaiUsine != null && <span className="rounded-full bg-white px-2 py-1 shadow-sm">Tissu reçu → départ : {cy.delaiUsine} j</span>}
        {cy.ecartExport != null && <PastilleDelai ecart={cy.ecartExport} />}
      </div>
      {c.evenements.length === 0 ? (
        <p className="text-sm text-slate-500">Pas encore d&apos;événement daté.</p>
      ) : (
        <ol className="relative ml-2 border-l-2 border-slate-300">
          {c.evenements.map((e, i) => (
            <li key={i} className="mb-2 ml-4">
              <span className="absolute -left-[7px] mt-1 h-3 w-3 rounded-full border-2 border-white bg-[#0F1F3D]" />
              <div className="text-[11px] font-bold text-slate-500">{dateFr(e.date)}</div>
              <div className="text-sm font-semibold">{e.quoi}</div>
              {e.detail && <div className="text-xs text-slate-600">{e.detail}</div>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

const TON_DELAI = { vert: "bg-emerald-100 text-emerald-900", orange: "bg-amber-100 text-amber-900", rouge: "bg-red-100 text-red-900", gris: "bg-slate-100 text-slate-600" } as const;
function PastilleDelai({ ecart }: { ecart: number | null }) {
  const l = libelleEcart(ecart);
  return <span className={`whitespace-nowrap rounded-full px-2 py-1 text-xs font-bold ${TON_DELAI[l.ton]}`}>{l.texte}</span>;
}

/* ─────────── performance : respect des délais, cycle de vie, points forts ─────────── */

const PHASES = [
  { cle: "attenteTissu", label: "Attente tissu", cls: "bg-slate-300" },
  { cle: "avantCoupe", label: "Préparation", cls: "bg-sky-300" },
  { cle: "fabrication", label: "Fabrication", cls: "bg-[#0F1F3D]" },
  { cle: "expedition", label: "Expédition", cls: "bg-[#C9A227]" },
] as const;

function ChiffreFort({ titre, valeur, sous, fort }: { titre: string; valeur: string; sous?: string; fort?: boolean }) {
  return (
    <div className={`rounded-2xl px-4 py-3 shadow-sm ${fort ? "bg-[#0F1F3D] text-white" : "bg-white"}`}>
      <div className={`text-[11px] font-bold uppercase tracking-wide ${fort ? "text-[#C9A227]" : "text-slate-500"}`}>{titre}</div>
      <div className="text-2xl font-black">{valeur}</div>
      {sous && <div className={`text-xs ${fort ? "text-white/70" : "text-slate-500"}`}>{sous}</div>}
    </div>
  );
}

const fj = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 1 });

function Performance({ vue }: { vue: VueClient }) {
  const p = vue.performance;
  const parties = vue.commandes.filter((c) => !c.cycle.enCours).sort((a, b) => b.jalons.exportReel.localeCompare(a.jalons.exportReel));
  const enCours = vue.commandes.filter((c) => c.cycle.enCours && !c.archivee);
  const max = Math.max(1, ...vue.commandes.map((c) => c.cycle.total ?? 0));
  if (!parties.length && !enCours.length) return <Vide texte="Les statistiques apparaîtront avec vos premières commandes." />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <ChiffreFort
          fort
          titre="Livrées à l'heure"
          valeur={p.pctALHeure == null ? "—" : `${p.pctALHeure} %`}
          sous={p.expediees ? `${p.aLHeure} sur ${p.expediees} commande(s) parties` : "pas encore de départ"}
        />
        <ChiffreFort
          titre="Écart moyen au délai"
          valeur={p.ecartMoyen == null ? "—" : p.ecartMoyen <= 0 ? `${fj(Math.abs(p.ecartMoyen))} j d'avance` : `+${fj(p.ecartMoyen)} j`}
          sous="date réelle face à la date contractuelle"
        />
        <ChiffreFort titre="Cycle moyen" valeur={p.cycleMoyen == null ? "—" : `${fj(p.cycleMoyen)} j`} sous="de la commande au départ" />
        <ChiffreFort titre="Délai usine moyen" valeur={p.delaiUsineMoyen == null ? "—" : `${fj(p.delaiUsineMoyen)} j`} sous="du tissu reçu au départ" />
        {p.pctTdsOk != null && <ChiffreFort titre="OK dès la 1re tête de série" valeur={`${p.pctTdsOk} %`} sous="des commandes" />}
        <ChiffreFort titre="Pièces livrées" valeur={p.piecesLivrees.toLocaleString("fr-FR")} sous="sur les 12 derniers mois" />
      </div>

      <section className="overflow-hidden rounded-2xl bg-white shadow-sm">
        <div className="border-b px-4 py-2 font-black">Respect des délais</div>
        {parties.length === 0 ? (
          <div className="px-4 py-4 text-sm text-slate-500">Aucune commande partie pour l&apos;instant.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase text-slate-500">
                  <th className="px-3 py-2 text-left">Modèle</th>
                  <th className="px-2 text-right">Export contractuel</th>
                  <th className="px-2 text-right">Export réel</th>
                  <th className="px-3 text-right">Délai</th>
                </tr>
              </thead>
              <tbody>
                {parties.map((c) => (
                  <tr key={c.id} className="border-t">
                    <td className="px-3 py-2">
                      <b>{c.modele}</b> <span className="text-xs text-slate-500">{[c.couleur, c.of].filter(Boolean).join(" · ")}</span>
                    </td>
                    <td className="px-2 text-right tabular-nums">{dateFr(c.jalons.exportContractuel)}</td>
                    <td className="px-2 text-right font-semibold tabular-nums">{dateFr(c.jalons.exportReel)}</td>
                    <td className="px-3 text-right">
                      <PastilleDelai ecart={c.cycle.ecartExport} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl bg-white shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-2">
          <span className="font-black">Cycle de vie de chaque commande</span>
          {p.cycleMoyen != null && <span className="text-sm">moyenne <b>{fj(p.cycleMoyen)} jours</b></span>}
        </div>
        <div className="flex flex-wrap gap-3 px-4 pt-2 text-[11px]">
          {PHASES.map((ph) => (
            <span key={ph.cle} className="flex items-center gap-1">
              <span className={`inline-block h-2.5 w-4 rounded ${ph.cls}`} /> {ph.label}
            </span>
          ))}
        </div>
        <ul className="space-y-2 px-4 py-3">
          {[...enCours, ...parties].map((c) => {
            const cy = c.cycle;
            const total = cy.total ?? 0;
            const connus = PHASES.reduce((s, ph) => s + (cy[ph.cle] ?? 0), 0);
            return (
              <li key={c.id}>
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
                  <span>
                    <b className="text-sm">{c.modele}</b> {[c.couleur, c.of].filter(Boolean).join(" · ")}
                  </span>
                  <span className="font-bold">{cy.total == null ? "début inconnu" : cy.enCours ? `en cours · ${total} j` : `${total} j`}</span>
                </div>
                <div className="mt-1 flex h-3 overflow-hidden rounded-full bg-slate-100" style={{ width: `${Math.max(8, (total / max) * 100)}%` }}>
                  {connus > 0
                    ? PHASES.map((ph) =>
                        (cy[ph.cle] ?? 0) > 0 ? <span key={ph.cle} className={ph.cls} style={{ width: `${((cy[ph.cle] ?? 0) / Math.max(total, connus)) * 100}%` }} title={`${ph.label} : ${cy[ph.cle]} j`} /> : null,
                      )
                    : <span className="bg-slate-300" style={{ width: "100%" }} />}
                </div>
              </li>
            );
          })}
        </ul>
        <p className="border-t px-4 py-2 text-[11px] text-slate-500">
          Calculé sur les dates réelles de vos commandes des 12 derniers mois : commande enregistrée, tissu reçu, coupe, pièces finies, départ. Le détail
          de chaque commande est dans « 🧭 Traçabilité ».
        </p>
      </section>
    </div>
  );
}
