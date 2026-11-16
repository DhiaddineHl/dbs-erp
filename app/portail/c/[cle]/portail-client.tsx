"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as A from "@/lib/actions/portail-client";
import type { CommandeClient, PasseportClient, VueClient } from "@/lib/services/portail-client";

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

type Onglet = "commandes" | "tissu" | "questions";

export function PortailClient({ cle, vue }: { cle: string; vue: VueClient }) {
  const [onglet, setOnglet] = useState<Onglet>("commandes");
  const [questionSur, setQuestionSur] = useState<number | null>(null);
  const enCours = vue.commandes.filter((c) => c.feu.ton !== "bleu");
  const expediees = vue.commandes.filter((c) => c.feu.ton === "bleu");
  return (
    <div className="min-h-screen bg-[#F7F6F2] text-slate-900">
      <Entete titre={vue.client} sous={`Suivi de vos commandes · ${vue.contact}`} />
      <nav className="sticky top-0 z-10 border-b bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl gap-1 px-2">
          {(
            [
              ["commandes", `Commandes (${enCours.length})`],
              ["tissu", "Mon tissu"],
              ["questions", `Questions${vue.questions.length ? ` (${vue.questions.length})` : ""}`],
            ] as const
          ).map(([k, l]) => (
            <button
              key={k}
              onClick={() => setOnglet(k)}
              className={`border-b-2 px-3 py-3 text-sm font-bold ${onglet === k ? "border-[#C9A227] text-[#0F1F3D]" : "border-transparent text-slate-500"}`}
            >
              {l}
            </button>
          ))}
        </div>
      </nav>
      <main className="mx-auto max-w-3xl space-y-4 px-3 py-4">
        {onglet === "commandes" && (
          <>
            {enCours.length === 0 && <Vide texte="Aucune commande en cours." />}
            {enCours.map((c) => (
              <CarteCommande key={c.id} cle={cle} c={c} onQuestion={() => (setQuestionSur(c.id), setOnglet("questions"))} />
            ))}
            {expediees.length > 0 && (
              <details className="rounded-2xl bg-white p-3 shadow-sm">
                <summary className="cursor-pointer font-bold">Expédiées ces 90 derniers jours ({expediees.length})</summary>
                <div className="mt-3 space-y-3">
                  {expediees.map((c) => (
                    <CarteCommande key={c.id} cle={cle} c={c} onQuestion={() => (setQuestionSur(c.id), setOnglet("questions"))} />
                  ))}
                </div>
              </details>
            )}
          </>
        )}
        {onglet === "tissu" && <MonTissu cle={cle} vue={vue} />}
        {onglet === "questions" && <Questions cle={cle} vue={vue} commandeInitiale={questionSur} />}
        <p className="pb-6 text-center text-[11px] text-slate-500">
          Avancement mis à jour le {dateFr(vue.aujourdhui)} · un point par jour · DBS Fashion
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
        <button onClick={onQuestion} className="rounded-lg bg-white px-3 py-2 text-sm font-bold shadow-sm">
          💬 Poser une question
        </button>
        {c.tailles.length > 0 && (
          <span className="self-center text-xs text-slate-500">
            {c.tailles.map((t) => `${t.taille} ${t.qte}`).join(" · ")}
          </span>
        )}
      </div>
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
