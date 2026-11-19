"use client";

import { Fragment, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as A from "@/lib/actions/portail-soustraitant";
import type { CommandeSt, EnvoiTissu, VueSt } from "@/lib/services/portail-soustraitant";
import { BarresAvancement, JournalJours } from "@/components/shared/avancement-atelier";

/* L'espace de l'atelier sous-traitant, sur son téléphone : ses commandes, la
 * saisie du soir, ses livraisons par taille, le tissu reçu, le rapport de
 * coupe, et un fil pour signaler un problème. Ce qu'il saisit est une
 * DÉCLARATION : l'usine valide à l'arrivée de la marchandise. */

type Motif = { value: string; label: string };
const nb = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const eur = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
});
const dateFr = (iso: string | null) => (/^\d{4}-\d{2}-\d{2}/.test(iso ?? "") ? iso!.slice(0, 10).split("-").reverse().join("/") : "—");
const ent = (s: string) => (s.trim() === "" ? 0 : Number(s.replace(",", ".")));

function Entete({ titre, sous }: { titre: string; sous: string }) {
  return (
    <header className="bg-[#1F2A1F] px-4 pb-5 pt-6 text-white">
      <div className="mx-auto max-w-3xl">
        <div className="text-[11px] font-bold uppercase tracking-[0.25em] text-[#C9A227]">DBS Fashion · espace atelier</div>
        <h1 className="mt-1 text-2xl font-black">{titre}</h1>
        <div className="text-sm text-white/70">{sous}</div>
      </div>
    </header>
  );
}

export function EcranPinSt({ cle, nom }: { cle: string; nom: string }) {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [erreur, setErreur] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="min-h-screen bg-[#F4F5F0]">
      <Entete titre="Espace atelier" sous={nom} />
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
          className="mt-4 w-full rounded-xl bg-[#1F2A1F] py-3 text-lg font-bold text-white disabled:opacity-40"
        >
          Entrer
        </button>
        <p className="mt-3 text-xs text-slate-500">Ce téléphone sera reconnu pendant 30 jours.</p>
      </main>
    </div>
  );
}

type Onglet = "commandes" | "tissu" | "messages";

export function PortailSt({ cle, vue, motifs }: { cle: string; vue: VueSt; motifs: Motif[] }) {
  const [onglet, setOnglet] = useState<Onglet>("commandes");
  const aConfirmer = vue.tissu.filter((t) => !t.etat).length;
  return (
    <div className="min-h-screen bg-[#F4F5F0] text-slate-900">
      <Entete titre={vue.atelier} sous={`Espace atelier · ${vue.personne}`} />
      <nav className="sticky top-0 z-10 border-b bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl gap-1 px-2">
          {(
            [
              ["commandes", `Commandes (${vue.commandes.filter((c) => !c.avancement.livree).length} en cours)`],
              ["tissu", `Tissu${aConfirmer ? ` · ${aConfirmer} à confirmer` : ""}`],
              ["messages", "Messages"],
            ] as [Onglet, string][]
          ).map(([k, l]) => (
            <button
              key={k}
              onClick={() => setOnglet(k)}
              className={`px-3 py-3 text-sm font-bold ${onglet === k ? "border-b-4 border-[#C9A227]" : "text-slate-500"}`}
            >
              {l}
            </button>
          ))}
        </div>
      </nav>
      <main className="mx-auto max-w-3xl space-y-4 px-3 py-4">
        {onglet === "commandes" && <OngletCommandes cle={cle} vue={vue} motifs={motifs} />}
        {onglet === "tissu" && <OngletTissu cle={cle} tissu={vue.tissu} />}
        {onglet === "messages" && <OngletMessages cle={cle} vue={vue} />}
      </main>
    </div>
  );
}

/* ─────────── commandes : en cours, puis livrées (archives) ─────────── */

function OngletCommandes({ cle, vue, motifs }: { cle: string; vue: VueSt; motifs: Motif[] }) {
  const [archives, setArchives] = useState(false);
  const enCours = vue.commandes.filter((c) => !c.avancement.livree);
  const livrees = vue.commandes.filter((c) => c.avancement.livree);
  return (
    <>
      {enCours.length === 0 ? (
        <p className="rounded-xl bg-white p-6 text-center text-slate-500">Aucune commande en cours pour votre atelier.</p>
      ) : (
        enCours.map((c) => <CarteCommande key={c.id} cle={cle} c={c} motifs={motifs} aujourdhui={vue.aujourdhui} />)
      )}
      {livrees.length > 0 && (
        <section className="rounded-2xl border bg-white/60">
          <button onClick={() => setArchives(!archives)} className="flex w-full items-center justify-between px-4 py-3 text-left font-bold">
            <span>✅ Livrées — archives ({livrees.length})</span>
            <span className="text-slate-500">{archives ? "▾" : "▸"}</span>
          </button>
          {archives && (
            <div className="space-y-3 px-3 pb-3">
              {livrees.map((c) => (
                <CarteCommande key={c.id} cle={cle} c={c} motifs={motifs} aujourdhui={vue.aujourdhui} archivee />
              ))}
            </div>
          )}
        </section>
      )}
    </>
  );
}

/* ─────────── une commande ─────────── */

type Volet = "" | "soir" | "livrer" | "rapport" | "plan" | "jours";

function CarteCommande({ cle, c, motifs, aujourdhui, archivee }: { cle: string; c: CommandeSt; motifs: Motif[]; aujourdhui: string; archivee?: boolean }) {
  const [volet, setVolet] = useState<Volet>("");
  const d = c.declaration;
  const retard = c.aLivrerLe && c.finEstimee && c.finEstimee > c.aLivrerLe;
  const basculer = (v: Volet) => setVolet(volet === v ? "" : v);
  const saisieDuJour = d?.jour === aujourdhui;
  return (
    <article className="overflow-hidden rounded-2xl border bg-white shadow-sm">
      <div className="p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <div className="text-lg font-black">
              {c.of} · {c.modele}
            </div>
            <div className="text-sm text-slate-600">
              {[c.reference, c.couleur, c.client].filter(Boolean).join(" · ")} · <b>{nb.format(c.qte)} pcs</b>
            </div>
          </div>
          {c.prixFacon != null && (
            <div className="rounded-lg bg-emerald-50 px-2 py-1 text-sm font-bold text-emerald-900">Façon {eur.format(c.prixFacon)} / pc</div>
          )}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <Info label="À livrer chez nous" valeur={dateFr(c.aLivrerLe)} fort />
          <Info label="Export" valeur={dateFr(c.exportPrevu)} />
          <Info label="Livré (reçu)" valeur={nb.format(c.avancement.recu)} />
          <Info label={archivee ? "Livrée" : "Reste à livrer"} valeur={archivee ? "✅" : nb.format(c.avancement.reste)} />
        </div>
        <div className="mt-3">
          <BarresAvancement a={c.avancement} />
        </div>
        {d && (
          <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
            Dernière saisie ({dateFr(d.jour)}) : lancé <b>{d.lance}</b> · produit <b>{d.produit}</b> · emballé <b>{d.emballe}</b>
            {c.finEstimee && (
              <span className={retard ? "font-bold text-red-700" : "text-slate-600"}>
                {" "}
                · fin estimée {dateFr(c.finEstimee)}
                {retard && " (après la date à livrer)"}
              </span>
            )}
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <Bouton actif={volet === "jours"} onClick={() => basculer("jours")}>
            📅 Jour par jour
          </Bouton>
          {!archivee && (
            <>
              <Bouton actif={volet === "soir"} onClick={() => basculer("soir")}>
                📝 Saisie du soir
                {!saisieDuJour && <span className="ml-1 rounded bg-amber-300 px-1 text-[10px] text-amber-950">à faire</span>}
              </Bouton>
              <Bouton actif={volet === "livrer"} onClick={() => basculer("livrer")}>
                🚚 Livrer
              </Bouton>
              <Bouton actif={volet === "rapport"} onClick={() => basculer("rapport")}>
                ✂ Rapport de coupe
              </Bouton>
              <Bouton actif={volet === "plan"} onClick={() => basculer("plan")}>
                📐 Plan de coupe
              </Bouton>
            </>
          )}
        </div>
      </div>
      {volet === "soir" && <SaisieSoir cle={cle} c={c} fermer={() => setVolet("")} />}
      {volet === "livrer" && <FormLivraison cle={cle} c={c} motifs={motifs} fermer={() => setVolet("")} />}
      {volet === "rapport" && <FormRapport cle={cle} c={c} fermer={() => setVolet("")} />}
      {volet === "plan" && <PlanCoupe c={c} />}
      {volet === "jours" && (
        <div className="border-t bg-slate-50 p-4">
          <JournalJours journal={c.avancement.journal} />
        </div>
      )}
      {c.livraisons.length > 0 && <Livraisons cle={cle} c={c} />}
    </article>
  );
}

function Info({ label, valeur, fort }: { label: string; valeur: string; fort?: boolean }) {
  return (
    <div className={`rounded-lg px-2 py-1 ${fort ? "bg-amber-50" : "bg-slate-50"}`}>
      <div className="text-[10px] font-bold uppercase text-slate-500">{label}</div>
      <div className={fort ? "font-black text-amber-900" : "font-semibold"}>{valeur}</div>
    </div>
  );
}

function Bouton({ actif, onClick, children }: { actif?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl border-2 px-3 py-2 text-sm font-bold ${actif ? "border-[#1F2A1F] bg-[#1F2A1F] text-white" : "border-slate-300 bg-white"}`}
    >
      {children}
    </button>
  );
}

function Message({ erreur, ok }: { erreur?: string; ok?: string }) {
  if (erreur) return <div className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-900">{erreur}</div>;
  if (ok) return <div className="rounded-lg bg-emerald-100 px-3 py-2 text-sm text-emerald-900">{ok}</div>;
  return null;
}

const champ = "w-full rounded-lg border-2 border-slate-300 px-2 py-2 text-center text-lg font-bold";

function SaisieSoir({ cle, c, fermer }: { cle: string; c: CommandeSt; fermer: () => void }) {
  const router = useRouter();
  const d = c.declaration;
  const [v, setV] = useState({
    lance: String(d?.lance ?? ""),
    produit: String(d?.produit ?? ""),
    emballe: String(d?.emballe ?? ""),
  });
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ erreur?: string; ok?: string }>({});
  const [pending, start] = useTransition();
  return (
    <div className="border-t bg-slate-50 p-4">
      <p className="mb-2 text-sm text-slate-600">Les TOTAUX depuis le début de la commande (pas seulement aujourd&apos;hui).</p>
      <div className="grid grid-cols-3 gap-2">
        {(
          [
            ["lance", "Lancé"],
            ["produit", "Produit"],
            ["emballe", "Emballé"],
          ] as const
        ).map(([k, l]) => (
          <label key={k} className="text-center text-xs font-bold uppercase text-slate-500">
            {l}
            <input inputMode="numeric" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value.replace(/\D/g, "") })} className={`mt-1 ${champ}`} />
          </label>
        ))}
      </div>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Un mot (facultatif)"
        className="mt-2 w-full rounded-lg border px-3 py-2 text-sm"
      />
      <div className="mt-2">
        <Message {...msg} />
      </div>
      <div className="mt-2 flex gap-2">
        <button
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await A.declarer(
                cle,
                c.id,
                {
                  lance: ent(v.lance),
                  produit: ent(v.produit),
                  emballe: ent(v.emballe),
                },
                note,
              );
              if (!r.ok) return void setMsg({ erreur: r.error });
              setMsg({
                ok: r.alertes.length ? `Enregistré. À vérifier : ${r.alertes.join(" ")}` : "Enregistré, merci.",
              });
              router.refresh();
            })
          }
          className="flex-1 rounded-xl bg-[#1F2A1F] py-3 font-bold text-white disabled:opacity-40"
        >
          Enregistrer
        </button>
        <button onClick={fermer} className="rounded-xl border-2 px-4 font-bold">
          Fermer
        </button>
      </div>
    </div>
  );
}

function FormLivraison({ cle, c, motifs, fermer }: { cle: string; c: CommandeSt; motifs: Motif[]; fermer: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState<Record<string, { premier: string; second: string }>>({});
  const [motif, setMotif] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ erreur?: string; ok?: string }>({});
  const [numero, setNumero] = useState("");
  const [pending, start] = useTransition();
  const lignes = c.tailles.map((t) => ({
    taille: t,
    premier: ent(q[t]?.premier ?? ""),
    second: ent(q[t]?.second ?? ""),
  }));
  const ecarts = lignes.map((l) => (c.dejaLivre[l.taille] ?? 0) + l.premier + l.second - (c.attendu[l.taille] ?? 0));
  const total = lignes.reduce((s, l) => s + l.premier + l.second, 0);
  const avecEcart = total > 0 && ecarts.some((e) => e !== 0);
  const maj = (t: string, k: "premier" | "second", val: string) =>
    setQ({
      ...q,
      [t]: {
        premier: q[t]?.premier ?? "",
        second: q[t]?.second ?? "",
        [k]: val.replace(/\D/g, ""),
      },
    });
  if (numero) {
    return (
      <div className="border-t bg-emerald-50 p-4 text-center">
        <div className="text-sm text-emerald-900">Livraison annoncée — l&apos;usine est prévenue.</div>
        <div className="mt-1 text-2xl font-black">{numero}</div>
        <a href={`/portail/s/${cle}/livraison/${numero}`} className="mt-3 inline-block rounded-xl bg-[#1F2A1F] px-4 py-3 font-bold text-white">
          Voir le bon avec son QR (à imprimer ou à montrer)
        </a>
        <div className="mt-2">
          <button onClick={fermer} className="text-sm underline">
            Fermer
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="border-t bg-slate-50 p-4">
      <p className="mb-2 text-sm text-slate-600">
        Ce que vous livrez MAINTENANT, taille par taille. 1er choix = bon ; 2e choix = défaut (ni compté, ni payé).
        <br />
        Attendu = {c.sourceAttendu === "coupe" ? "le coupé" : c.sourceAttendu === "plan" ? "le plan de coupe" : "la commande"}.
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] uppercase text-slate-500">
            <th className="text-left">Taille</th>
            <th>Attendu</th>
            <th>Déjà livré</th>
            <th>1er choix</th>
            <th>2e choix</th>
            <th>Écart</th>
          </tr>
        </thead>
        <tbody>
          {c.tailles.map((t, i) => (
            <tr key={t} className="border-t">
              <td className="py-1 font-black">{t}</td>
              <td className="text-center">{c.attendu[t] ?? 0}</td>
              <td className="text-center text-slate-500">{c.dejaLivre[t] ?? 0}</td>
              <td className="px-1">
                <input inputMode="numeric" value={q[t]?.premier ?? ""} onChange={(e) => maj(t, "premier", e.target.value)} className={champ} />
              </td>
              <td className="px-1">
                <input inputMode="numeric" value={q[t]?.second ?? ""} onChange={(e) => maj(t, "second", e.target.value)} className={champ} />
              </td>
              <td className={`text-center font-bold ${ecarts[i] === 0 ? "text-emerald-700" : "text-amber-700"}`}>
                {ecarts[i] > 0 ? `+${ecarts[i]}` : ecarts[i]}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {avecEcart && (
        <select
          value={motif}
          onChange={(e) => setMotif(e.target.value)}
          className="mt-3 w-full rounded-lg border-2 border-amber-400 bg-white px-2 py-2 text-sm"
        >
          <option value="">— Pourquoi ça ne tombe pas juste ? —</option>
          {motifs.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      )}
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note (nombre de cartons, chauffeur…)"
        className="mt-2 w-full rounded-lg border px-3 py-2 text-sm"
      />
      <div className="mt-2">
        <Message {...msg} />
      </div>
      <div className="mt-2 flex gap-2">
        <button
          disabled={pending || total <= 0}
          onClick={() =>
            start(async () => {
              const r = await A.annoncerLivraison(cle, c.id, lignes, avecEcart ? motif : "", note);
              if (!r.ok) return void setMsg({ erreur: r.error });
              setNumero(r.numero);
              router.refresh();
            })
          }
          className="flex-1 rounded-xl bg-[#1F2A1F] py-3 font-bold text-white disabled:opacity-40"
        >
          Annoncer la livraison ({total} pcs)
        </button>
        <button onClick={fermer} className="rounded-xl border-2 px-4 font-bold">
          Fermer
        </button>
      </div>
    </div>
  );
}

const STATUT_LIV: Record<string, string> = {
  annoncee: "🕓 En route / annoncée",
  en_reception: "📦 En cours de réception",
  recue: "✅ Reçue",
  annulee: "↩ Retirée",
};

function Livraisons({ cle, c }: { cle: string; c: CommandeSt }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="border-t px-4 py-3">
      <div className="mb-1 text-xs font-bold uppercase text-slate-500">Vos livraisons</div>
      <ul className="space-y-1 text-sm">
        {c.livraisons.map((l) => {
          const t = (l.statut === "recue" ? l.recues : l.lignes).reduce((s, x) => ({ p: s.p + x.premier, s: s.s + x.second }), { p: 0, s: 0 });
          return (
            <li key={l.numero} className={`flex flex-wrap items-center gap-2 ${l.statut === "annulee" ? "opacity-50" : ""}`}>
              <b>{l.numero}</b>
              <span>{STATUT_LIV[l.statut] ?? l.statut}</span>
              <span className="text-slate-600">
                {t.p} 1er choix{t.s ? ` · ${t.s} 2e choix` : ""}
                {l.statut === "recue" && c.prixFacon != null && <> · {eur.format(t.p * c.prixFacon)}</>}
              </span>
              {l.statut === "annoncee" && (
                <>
                  <a href={`/portail/s/${cle}/livraison/${l.numero}`} className="rounded border px-2 py-0.5 text-xs font-bold">
                    QR
                  </a>
                  <button
                    disabled={pending}
                    onClick={() => {
                      if (!confirm(`Retirer la livraison ${l.numero} ?`)) return;
                      start(async () => {
                        const r = await A.annulerLivraison(cle, l.numero);
                        if (!r.ok) alert(r.error);
                        router.refresh();
                      });
                    }}
                    className="rounded border px-2 py-0.5 text-xs"
                  >
                    Retirer
                  </button>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function PlanCoupe({ c }: { c: CommandeSt }) {
  if (!c.plan.length) return <div className="border-t bg-slate-50 p-4 text-sm text-slate-500">Le plan de coupe n&apos;est pas encore prêt.</div>;
  return (
    <div className="space-y-3 border-t bg-slate-50 p-4 text-sm">
      <div>
        <b>Par taille (pour cet OF) :</b>{" "}
        {c.tailles.map((t) => (
          <span key={t} className="mr-2 inline-block rounded bg-white px-2 py-0.5">
            {t} <b>{c.attendu[t] ?? 0}</b>
          </span>
        ))}
      </div>
      {c.plan.map((m) => (
        <div key={m.matiere}>
          <div className="font-bold">{m.matiere}</div>
          <table className="mt-1 w-full">
            <thead>
              <tr className="text-[10px] uppercase text-slate-500">
                <th className="text-left">Tracé</th>
                <th>Longueur</th>
                <th>Plis</th>
                <th className="text-left">Pièces par pli</th>
              </tr>
            </thead>
            <tbody>
              {m.traces.map((t, i) => (
                <tr key={i} className="border-t">
                  <td className="py-1 font-semibold">{t.nom || `Tracé ${i + 1}`}</td>
                  <td className="text-center">{t.longueur ? `${nb.format(t.longueur)} m` : "—"}</td>
                  <td className="text-center">{t.plis || "—"}</td>
                  <td>{t.pieces || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

type ContexteRapport = Extract<Awaited<ReturnType<typeof A.contexteRapport>>, { ok: true }>["contexte"];

function FormRapport({ cle, c, fermer }: { cle: string; c: CommandeSt; fermer: () => void }) {
  const router = useRouter();
  const [ctx, setCtx] = useState<ContexteRapport | null>(null);
  const [coupe, setCoupe] = useState<Record<string, Record<string, string>>>({});
  const [rl, setRl] = useState<Record<string, { consomme: string; chute: string; reste: string }>>({});
  /* Constats pour le « Résultat de coupe » du client : laize utile, 2e choix
   * à la coupe, défaut et manquant par rouleau. */
  const [laize, setLaize] = useState("");
  const [second, setSecond] = useState<Record<string, Record<string, string>>>({});
  const [defauts, setDefauts] = useState<Record<string, { defaut: string; manquant: string }>>({});
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ erreur?: string; ok?: string }>({});
  const [pending, start] = useTransition();
  useEffect(() => {
    let vivant = true;
    void A.contexteRapport(cle, c.id).then((r) => {
      if (vivant) return r.ok ? setCtx(r.contexte) : setMsg({ erreur: r.error });
    });
    return () => {
      vivant = false;
    };
  }, [cle, c.id]);
  if (!ctx)
    return (
      <div className="border-t bg-slate-50 p-4">
        <Message erreur={msg.erreur} ok={msg.erreur ? undefined : "Chargement…"} />
      </div>
    );
  if (msg.ok)
    return (
      <div className="border-t bg-emerald-50 p-4 text-center">
        <Message ok={msg.ok} />
        <button onClick={fermer} className="mt-2 text-sm underline">
          Fermer
        </button>
      </div>
    );
  return (
    <div className="border-t bg-slate-50 p-4 text-sm">
      <p className="mb-2 text-slate-600">
        Pièces coupées par taille (et dont 2e choix), la laize constatée, puis pour chaque rouleau : mètres utilisés, chute, ce qu&apos;il en reste (à
        nous rendre), et un défaut ou un manquant s&apos;il y en a. Le « Résultat de coupe » du client est fait avec.
      </p>
      <table className="w-full">
        <thead>
          <tr className="text-[10px] uppercase text-slate-500">
            <th className="text-left">OF</th>
            {ctx.sizes.map((s) => (
              <th key={s}>{s}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ctx.ofs.map((o) => (
            <Fragment key={o.id}>
              {/* Ce qu'on demande de couper (plan de coupe, sinon commande). */}
              <tr className="text-[11px] text-slate-500">
                <td className="pr-1">à couper</td>
                {ctx.sizes.map((s) => (
                  <td key={s} className="text-center font-bold text-slate-700">
                    {o.demande[s] ?? 0}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="pr-1 font-bold">{o.of}</td>
                {ctx.sizes.map((s) => (
                  <td key={s} className="px-0.5">
                    <input
                      inputMode="numeric"
                      value={coupe[o.id]?.[s] ?? ""}
                      onChange={(e) =>
                        setCoupe({
                          ...coupe,
                          [o.id]: {
                            ...(coupe[o.id] ?? {}),
                            [s]: e.target.value.replace(/\D/g, ""),
                          },
                        })
                      }
                      className="w-full min-w-12 rounded border-2 px-1 py-1.5 text-center font-bold"
                    />
                  </td>
                ))}
              </tr>
              <tr className="text-[11px]">
                <td className="pr-1 text-amber-800">dont 2e choix</td>
                {ctx.sizes.map((s) => (
                  <td key={s} className="px-0.5 pb-1">
                    <input
                      inputMode="numeric"
                      value={second[o.id]?.[s] ?? ""}
                      onChange={(e) => setSecond({ ...second, [o.id]: { ...(second[o.id] ?? {}), [s]: e.target.value.replace(/\D/g, "") } })}
                      className="w-full min-w-12 rounded border border-amber-300 bg-amber-50 px-1 py-1 text-center"
                    />
                  </td>
                ))}
              </tr>
            </Fragment>
          ))}
        </tbody>
      </table>
      <label className="mt-3 flex items-center gap-2">
        <span className="font-semibold">Laize utile constatée</span>
        <input inputMode="decimal" value={laize} onChange={(e) => setLaize(e.target.value.replace(/[^\d.,]/g, ""))} placeholder="1,48" className="w-24 rounded border-2 px-2 py-1.5 text-center font-bold" />
        <span className="text-slate-500">m</span>
      </label>
      {ctx.rouleaux.length > 0 && (
        <table className="mt-3 w-full">
          <thead>
            <tr className="text-[10px] uppercase text-slate-500">
              <th className="text-left">Rouleau</th>
              <th>Chez vous (m)</th>
              <th>Utilisé</th>
              <th>Chute</th>
              <th>Reste</th>
            </tr>
          </thead>
          <tbody>
            {ctx.rouleaux.map((r) => (
              <tr key={r.code} className="border-t">
                <td className="py-1">
                  <b>{r.code}</b>
                  <div className="text-[11px] text-slate-500">{r.couleur}</div>
                </td>
                <td className="text-center">{nb.format(r.recu)}</td>
                {(["consomme", "chute", "reste"] as const).map((k) => (
                  <td key={k} className="px-0.5">
                    <input
                      inputMode="decimal"
                      value={rl[r.code]?.[k] ?? ""}
                      onChange={(e) =>
                        setRl({
                          ...rl,
                          [r.code]: {
                            ...(rl[r.code] ?? {
                              consomme: "",
                              chute: "",
                              reste: "",
                            }),
                            [k]: e.target.value.replace(/[^\d.,]/g, ""),
                          },
                        })
                      }
                      className="w-full min-w-14 rounded border-2 px-1 py-1.5 text-center font-bold"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {ctx.rouleaux.length > 0 && (
        <div className="mt-2 space-y-1">
          <div className="text-[11px] font-bold uppercase text-slate-500">Défaut ou manquant sur un rouleau ?</div>
          {ctx.rouleaux.map((r) => (
            <div key={r.code} className="flex items-center gap-1">
              <span className="w-28 shrink-0 text-xs font-bold">{r.code}</span>
              <input
                value={defauts[r.code]?.defaut ?? ""}
                onChange={(e) => setDefauts({ ...defauts, [r.code]: { manquant: defauts[r.code]?.manquant ?? "", defaut: e.target.value } })}
                placeholder="défaut (ex. trou à 12 m)"
                className="min-w-0 flex-1 rounded border px-2 py-1 text-xs"
              />
              <input
                inputMode="decimal"
                value={defauts[r.code]?.manquant ?? ""}
                onChange={(e) => setDefauts({ ...defauts, [r.code]: { defaut: defauts[r.code]?.defaut ?? "", manquant: e.target.value.replace(/[^\d.,]/g, "") } })}
                placeholder="manquant m"
                className="w-24 rounded border px-2 py-1 text-center text-xs"
              />
            </div>
          ))}
        </div>
      )}
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (facultatif)" className="mt-2 w-full rounded-lg border px-3 py-2" />
      <div className="mt-2">
        <Message erreur={msg.erreur} />
      </div>
      <div className="mt-2 flex gap-2">
        <button
          disabled={pending}
          onClick={() =>
            start(async () => {
              const pieces = Object.fromEntries(
                Object.entries(coupe).map(([of, t]) => [of, Object.fromEntries(Object.entries(t).map(([s, q]) => [s, ent(q)]))]),
              );
              const rouleaux = Object.entries(rl).map(([code, x]) => ({
                code,
                consomme: ent(x.consomme),
                chute: ent(x.chute),
                reste: ent(x.reste),
              }));
              const r = await A.envoyerRapport(cle, c.id, pieces, rouleaux, note, {
                laize: laize ? Number(laize.replace(",", ".")) : null,
                second: Object.fromEntries(Object.entries(second).map(([of, t]) => [of, Object.fromEntries(Object.entries(t).map(([s2, q]) => [s2, ent(q)]))])),
                rouleaux: Object.entries(defauts).map(([code, x]) => ({ code, defaut: x.defaut, manquant: ent(x.manquant) })),
              });
              if (!r.ok) return void setMsg({ erreur: r.error });
              setMsg({
                ok: "Rapport envoyé. L'usine le valide et vous prévient.",
              });
              router.refresh();
            })
          }
          className="flex-1 rounded-xl bg-[#1F2A1F] py-3 font-bold text-white disabled:opacity-40"
        >
          Envoyer le rapport
        </button>
        <button onClick={fermer} className="rounded-xl border-2 px-4 font-bold">
          Fermer
        </button>
      </div>
    </div>
  );
}

/* ─────────── tissu reçu ─────────── */

const ETAT_TISSU: Record<string, string> = {
  recu: "✓ Reçu",
  ecart: "⚠ Écart signalé",
  manquant: "⚠ Pas reçu",
};

function OngletTissu({ cle, tissu }: { cle: string; tissu: EnvoiTissu[] }) {
  const router = useRouter();
  const [choix, setChoix] = useState<number[]>([]);
  const [msg, setMsg] = useState<{ erreur?: string; ok?: string }>({});
  const [pending, start] = useTransition();
  if (!tissu.length) return <p className="rounded-xl bg-white p-6 text-center text-slate-500">Aucun tissu envoyé pour l&apos;instant.</p>;
  const bons = [...new Set(tissu.map((t) => t.bon || t.date.slice(0, 10)))];
  const envoyer = (ids: number[], etat: string, metrage: number | null, note: string) =>
    start(async () => {
      const r = await A.confirmerTissu(cle, ids, etat, metrage, note);
      if (!r.ok) return void setMsg({ erreur: r.error });
      setMsg({
        ok: etat === "recu" ? "Merci, réception confirmée." : "Signalé : l'usine est prévenue.",
      });
      setChoix([]);
      router.refresh();
    });
  return (
    <div className="space-y-3">
      <Message {...msg} />
      {bons.map((b) => {
        const ls = tissu.filter((t) => (t.bon || t.date.slice(0, 10)) === b);
        const libres = ls.filter((t) => !t.etat).map((t) => t.mouvementId);
        return (
          <section key={b} className="overflow-hidden rounded-2xl border bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 px-4 py-2">
              <div>
                <div className="font-black">
                  {b.startsWith("BST") ? `Bon ${b}` : `Envoi du ${dateFr(b)}`}{" "}
                  <span className="text-sm font-normal text-slate-500">· {ls.length} rouleau(x)</span>
                </div>
                {/* La commande et le modèle pour lesquels ce tissu est parti. */}
                <div className="text-sm font-semibold text-slate-700">
                  {[...new Map(ls.filter((t) => t.of).map((t) => [t.of, `${t.of} · ${t.modele}`])).values()].join(" — ") || "Commande non précisée"}
                </div>
              </div>
              {libres.length > 0 && (
                <button
                  disabled={pending}
                  onClick={() => envoyer(libres, "recu", null, "")}
                  className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-bold text-white"
                >
                  ✓ Tout bien reçu
                </button>
              )}
            </div>
            <table className="w-full text-sm">
              <tbody>
                {ls.map((t) => (
                  <tr key={t.mouvementId} className="border-t">
                    <td className="px-3 py-2">
                      {!t.etat && (
                        <input
                          type="checkbox"
                          checked={choix.includes(t.mouvementId)}
                          onChange={(e) => setChoix(e.target.checked ? [...choix, t.mouvementId] : choix.filter((x) => x !== t.mouvementId))}
                          className="mr-2"
                        />
                      )}
                      <b>{t.rouleau || "Tissu au mètre"}</b>
                      <div className="text-[11px] text-slate-500">{[t.tissu, t.couleur, t.bain && `bain ${t.bain}`, t.of].filter(Boolean).join(" · ")}</div>
                    </td>
                    <td className="whitespace-nowrap px-2 text-right font-bold">
                      {nb.format(t.metrage)} {t.unite}
                    </td>
                    <td className="whitespace-nowrap px-3 text-right">
                      {t.etat ? (
                        <span className={t.etat === "recu" ? "text-emerald-700" : "font-bold text-amber-700"}>
                          {ETAT_TISSU[t.etat]}
                          {t.metrageConstate != null && ` (${nb.format(t.metrageConstate)})`}
                        </span>
                      ) : (
                        <span className="flex justify-end gap-1">
                          <button
                            disabled={pending}
                            onClick={() => {
                              const m = prompt(`Combien de ${t.unite} mesurés sur ${t.rouleau || "ce tissu"} ?`);
                              if (m == null) return;
                              const note = prompt("Qu'avez-vous constaté ?") ?? "";
                              envoyer([t.mouvementId], "ecart", ent(m), note);
                            }}
                            className="rounded border px-2 py-1 text-xs"
                          >
                            Écart
                          </button>
                          <button
                            disabled={pending}
                            onClick={() => {
                              const note = prompt("Pas reçu : une précision ?") ?? "";
                              if (note) envoyer([t.mouvementId], "manquant", null, note);
                            }}
                            className="rounded border px-2 py-1 text-xs"
                          >
                            Pas reçu
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
      {choix.length > 0 && (
        <button
          disabled={pending}
          onClick={() => envoyer(choix, "recu", null, "")}
          className="sticky bottom-3 w-full rounded-xl bg-emerald-700 py-3 font-bold text-white shadow-lg"
        >
          ✓ Confirmer {choix.length} rouleau(x) reçus
        </button>
      )}
    </div>
  );
}

/* ─────────── messages & problème ─────────── */

/** Réduit une photo de téléphone (souvent 5–10 Mo) avant l'envoi. */
async function reduirePhoto(f: File): Promise<Blob> {
  const img = await createImageBitmap(f);
  const r = Math.min(1, 1600 / Math.max(img.width, img.height));
  const cv = document.createElement("canvas");
  cv.width = Math.round(img.width * r);
  cv.height = Math.round(img.height * r);
  cv.getContext("2d")!.drawImage(img, 0, 0, cv.width, cv.height);
  return new Promise((ok) => cv.toBlob((b) => ok(b ?? f), "image/jpeg", 0.82));
}

function OngletMessages({ cle, vue }: { cle: string; vue: VueSt }) {
  const router = useRouter();
  const [texte, setTexte] = useState("");
  const [commandeId, setCommandeId] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [msg, setMsg] = useState<{ erreur?: string; ok?: string }>({});
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3">
      <section className="rounded-2xl border bg-white p-4">
        <div className="mb-2 font-black">⚠ Un problème, une question</div>
        <select value={commandeId} onChange={(e) => setCommandeId(e.target.value)} className="w-full rounded-lg border px-2 py-2 text-sm">
          <option value="">Général</option>
          {vue.commandes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.of} · {c.modele}
            </option>
          ))}
        </select>
        <textarea
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          rows={3}
          placeholder="Ex. : il manque les étiquettes de composition"
          className="mt-2 w-full rounded-lg border px-3 py-2 text-sm"
        />
        <label className="mt-1 block text-sm">
          📷 Photo (facultatif){" "}
          <input type="file" accept="image/*" capture="environment" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} className="text-xs" />
        </label>
        <div className="mt-2">
          <Message {...msg} />
        </div>
        <button
          disabled={pending || (!texte.trim() && !photo)}
          onClick={() =>
            start(async () => {
              const fd = new FormData();
              fd.set("cle", cle);
              fd.set("commandeId", commandeId);
              fd.set("texte", texte);
              if (photo) {
                const b = await reduirePhoto(photo).catch(() => photo);
                fd.set("photo", new File([b], "photo.jpg", { type: b.type || "image/jpeg" }));
              }
              const r = await A.signalerProbleme(fd);
              if (!r.ok) return void setMsg({ erreur: r.error });
              setTexte("");
              setPhoto(null);
              setMsg({ ok: "Envoyé : l'usine vous répond ici." });
              router.refresh();
            })
          }
          className="mt-2 w-full rounded-xl bg-[#1F2A1F] py-3 font-bold text-white disabled:opacity-40"
        >
          Envoyer
        </button>
      </section>
      <section className="rounded-2xl border bg-white p-4">
        <div className="mb-2 font-black">Échanges avec l&apos;usine</div>
        {vue.messages.length === 0 ? (
          <p className="text-sm text-slate-500">Rien pour l&apos;instant.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {vue.messages.map((m) => (
              <li key={m.id} className={`max-w-[85%] rounded-xl px-3 py-2 ${m.interne ? "bg-slate-100" : "ml-auto bg-emerald-50"}`}>
                <div className="text-[10px] text-slate-500">
                  {m.interne ? `DBS Fashion · ${m.auteur}` : m.auteur} ·{" "}
                  {new Date(m.le).toLocaleString("fr-FR", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                  {m.commande && ` · ${m.commande}`}
                </div>
                <div className="whitespace-pre-wrap">{m.texte}</div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
