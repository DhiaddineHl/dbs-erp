"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SectionPanel } from "@/components/shared/section-panel";
import { Button } from "@/components/ui/button";
import * as A from "@/lib/actions/suivi-soustraitants";
import type { livraisonBureau } from "@/lib/services/suivi-soustraitants";

type D = NonNullable<Awaited<ReturnType<typeof livraisonBureau>>>;
const eur = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const quand = (iso: string) => (iso ? new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—");
const MOTIFS: Record<string, string> = { partielle: "Livraison partielle — le reste suit", manquant: "Pièces manquantes", defaut: "Pièces en défaut", surplus: "Pièces en plus", autre: "Autre" };

export function ReceptionLivraison({ d, peutValider }: { d: D; peutValider: boolean }) {
  const router = useRouter();
  const l = d.livraison;
  const tailles = [...new Set([...d.comparaison.map((c) => c.taille), ...l.lignes.map((x) => x.taille)])];
  const annonce = (t: string) => l.lignes.find((x) => x.taille === t) ?? { taille: t, premier: 0, second: 0 };
  const [q, setQ] = useState<Record<string, { premier: string; second: string }>>(() =>
    Object.fromEntries(tailles.map((t) => [t, { premier: String(annonce(t).premier || ""), second: String(annonce(t).second || "") }])),
  );
  const [erreur, setErreur] = useState("");
  const [pending, start] = useTransition();
  const n = (s: string) => Number(s || 0);
  const recues = tailles.map((t) => ({ taille: t, premier: n(q[t]?.premier), second: n(q[t]?.second) }));
  const tot = recues.reduce((s, x) => ({ p: s.p + x.premier, s: s.s + x.second }), { p: 0, s: 0 });
  const totA = l.lignes.reduce((s, x) => ({ p: s.p + x.premier, s: s.s + x.second }), { p: 0, s: 0 });
  const enAttente = l.statut === "annoncee";
  const valider = (forcer: boolean) =>
    start(async () => {
      const r = await A.validerLivraison(l.numero, recues, forcer);
      if (!r.ok) return void setErreur(r.error);
      toast.success(`Reçue : ${r.br} créé`);
      setErreur("");
      router.refresh();
    });

  return (
    <div className="space-y-4">
      <SectionPanel title={enAttente ? "À compter et valider" : l.statut === "recue" ? `Reçue le ${quand(l.recueLe)} par ${l.recuePar}` : "Livraison retirée par l'atelier"}>
        <div className="mb-3 grid gap-2 text-xs sm:grid-cols-4">
          <div>
            Annoncée le <b>{quand(l.annonceeLe)}</b> par {l.par}
          </div>
          <div>
            Client : <b>{l.client || "—"}</b>
          </div>
          <div>{l.motif && <>Motif de l&apos;atelier : <b>{MOTIFS[l.motif] ?? l.motif}</b></>}</div>
          <div>{l.note && <>Note : {l.note}</>}</div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-[10.5px] uppercase text-muted-foreground">
              <th className="px-2 py-1 text-left">Taille</th>
              <th className="px-2 text-right">Attendu ({d.attendu.source === "coupe" ? "coupé" : d.attendu.source === "plan" ? "plan" : "commande"})</th>
              <th className="px-2 text-right">Déjà livré</th>
              <th className="px-2 text-right">Annoncé 1er / 2e</th>
              <th className="px-2 text-center">Compté 1er choix</th>
              <th className="px-2 text-center">Compté 2e choix</th>
              <th className="px-2 text-right">Écart / annonce</th>
            </tr>
          </thead>
          <tbody>
            {tailles.map((t) => {
              const c = d.comparaison.find((x) => x.taille === t);
              const a = annonce(t);
              const r = recues.find((x) => x.taille === t)!;
              const ecart = r.premier + r.second - a.premier - a.second;
              return (
                <tr key={t} className="border-b">
                  <td className="px-2 py-1 font-bold">{t}</td>
                  <td className="px-2 text-right">{c?.attendu ?? 0}</td>
                  <td className="px-2 text-right text-muted-foreground">{c?.dejaLivre ?? 0}</td>
                  <td className="px-2 text-right">
                    {a.premier} / {a.second}
                  </td>
                  {(["premier", "second"] as const).map((k) => (
                    <td key={k} className="px-2 py-1 text-center">
                      {enAttente ? (
                        <input
                          inputMode="numeric"
                          value={q[t]?.[k] ?? ""}
                          onChange={(e) => setQ({ ...q, [t]: { ...(q[t] ?? { premier: "", second: "" }), [k]: e.target.value.replace(/\D/g, "") } })}
                          className="h-9 w-20 rounded-md border text-center font-bold"
                        />
                      ) : (
                        <b>{(l.recues.find((x) => x.taille === t) ?? { premier: 0, second: 0 })[k]}</b>
                      )}
                    </td>
                  ))}
                  <td className={`px-2 text-right font-bold ${ecart === 0 ? "text-emerald-700" : "text-amber-700"}`}>{enAttente ? (ecart > 0 ? `+${ecart}` : ecart) : ""}</td>
                </tr>
              );
            })}
            <tr className="font-black">
              <td className="px-2 py-1">Total</td>
              <td colSpan={2} />
              <td className="px-2 text-right">
                {totA.p} / {totA.s}
              </td>
              <td className="px-2 text-center">{tot.p}</td>
              <td className="px-2 text-center">{tot.s}</td>
              <td />
            </tr>
          </tbody>
        </table>
        {enAttente && (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-muted-foreground">
              Comptez et corrigez si besoin. Le BR prendra le 1er choix en conforme (entre au stock, payé{l.prixFacon != null && ` : ${eur.format(tot.p * l.prixFacon)}`}) et
              le 2e choix en non conforme (ni compté, ni payé). L&apos;écart avec l&apos;annonce est gardé pour la fiabilité de l&apos;atelier.
            </p>
            {erreur && (
              <div className="rounded-md bg-amber-100 px-3 py-2 text-sm text-amber-950">
                {erreur}{" "}
                <Button size="sm" variant="outline" className="ml-2 h-7" disabled={pending} onClick={() => valider(true)}>
                  Valider quand même
                </Button>
              </div>
            )}
            <Button disabled={pending || !peutValider || tot.p + tot.s <= 0} onClick={() => valider(false)} className="h-11 text-base">
              ✓ Marchandise reçue : valider
            </Button>
            {!peutValider && <div className="text-xs text-muted-foreground">Validation réservée à la production et au magasin.</div>}
          </div>
        )}
        {l.statut === "recue" && (
          <div className="mt-3 text-sm">
            Bon de réception : <b>{l.brNumero || "—"}</b> ·{" "}
            <a className="underline" href="/magasin?onglet=receptions">
              voir les réceptions
            </a>
          </div>
        )}
      </SectionPanel>
    </div>
  );
}
