"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SectionPanel } from "@/components/shared/section-panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import * as A from "@/lib/actions/portails";

type Acces = {
  id: number;
  type: "client" | "soustraitant";
  cible: string;
  nom: string;
  avecPin: boolean;
  actif: boolean;
  cle: string;
  derniereVisite: string;
  nbVisites: number;
  evenements: { type: string; detail: string; le: string }[];
};
type Choix = { id: number; nom: string };

const lien = (base: string, a: { type: string; cle: string }) => `${base}/portail/${a.type === "client" ? "c" : "s"}/${a.cle}`;
const quand = (iso: string) => {
  if (!iso) return "jamais";
  const d = new Date(iso);
  const j = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  const h = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return j <= 0 ? `aujourd'hui à ${h}` : j === 1 ? `hier à ${h}` : `il y a ${j} jours`;
};
const LIBELLE_EVT: Record<string, string> = {
  visite: "👁 Visite",
  question: "💬 Question",
  decision: "🖱 Décision",
  echantillon: "🧵 Échantillon",
  pin_echec: "⚠ PIN faux",
  pin: "🔑 Nouveau PIN",
  cle: "🔗 Nouvelle clé",
  coupe: "⛔ Coupé",
  active: "✓ Rouvert",
  declaration: "📝 Déclaration",
  livraison: "🚚 Livraison",
  coupe_rapport: "✂ Rapport de coupe",
  reception: "📦 Réception tissu",
};

export function PortailsClient({ acces, clients, ateliers, base }: { acces: Acces[]; clients: Choix[]; ateliers: Choix[]; base: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [type, setType] = useState<"client" | "soustraitant">("client");
  const [cibleId, setCibleId] = useState<number | null>(null);
  const [nom, setNom] = useState("");
  const [avecPin, setAvecPin] = useState(false);
  /** Ce qu'on ne montre qu'une fois : le lien neuf et le PIN en clair. */
  const [revele, setRevele] = useState<{ id: number; lien: string; pin: string } | null>(null);
  const [ouvert, setOuvert] = useState<number | null>(null);

  const lancer = <T,>(p: Promise<A.Result<T>>, ok: (r: T) => void) =>
    start(async () => {
      const r = await p;
      if (!r.ok) return void toast.error(r.error);
      ok(r as T);
      router.refresh();
    });

  const choix = type === "client" ? clients : ateliers;
  return (
    <div className="space-y-4">
      <SectionPanel title="Nouvel accès">
        <div className="flex flex-wrap items-end gap-2 text-xs">
          <label className="flex flex-col gap-1 font-semibold text-muted-foreground">
            Portail
            <select
              value={type}
              onChange={(e) => {
                setType(e.target.value as "client" | "soustraitant");
                setCibleId(null);
              }}
              className="h-9 rounded-md border bg-card px-2"
            >
              <option value="client">Client</option>
              <option value="soustraitant">Sous-traitant</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 font-semibold text-muted-foreground">
            {type === "client" ? "Client" : "Sous-traitant"}
            <select value={cibleId ?? ""} onChange={(e) => setCibleId(Number(e.target.value) || null)} className="h-9 min-w-48 rounded-md border bg-card px-2">
              <option value="">— choisir —</option>
              {choix.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-56 flex-1 flex-col gap-1 font-semibold text-muted-foreground">
            Personne (qui utilisera ce lien)
            <Input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Marie — acheteuse" className="h-9 bg-card" />
          </label>
          {type === "client" ? (
            <label className="flex items-center gap-1.5 pb-2 font-semibold">
              <input type="checkbox" checked={avecPin} onChange={(e) => setAvecPin(e.target.checked)} /> avec PIN
            </label>
          ) : (
            <span className="pb-2 font-semibold text-muted-foreground">PIN obligatoire</span>
          )}
          <Button
            className="h-9"
            disabled={pending || !cibleId || !nom.trim()}
            onClick={() =>
              lancer(A.creerAcces({ type, cibleId: cibleId!, nom, avecPin }), (r: { id: number; cle: string; pin: string }) => {
                setRevele({ id: r.id, lien: lien(base, { type, cle: r.cle }), pin: r.pin });
                setNom("");
                toast.success("Accès créé");
              })
            }
          >
            Créer le lien
          </Button>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Un lien par PERSONNE : si quelqu&apos;un part, on coupe son accès sans gêner les autres. Le PIN n&apos;est montré qu&apos;une fois — notez-le
          ou donnez-le de vive voix. Les questions de la personne arrivent dans votre Messagerie (fil « 🌐 … »).
        </p>
      </SectionPanel>

      {revele && (
        <div className="rounded-lg border-2 border-brand bg-brand/5 p-4 text-sm">
          <div className="font-bold">À transmettre à la personne :</div>
          <div className="mt-1 break-all font-mono text-xs">{revele.lien}</div>
          {revele.pin && (
            <div className="mt-2">
              PIN : <b className="font-mono text-2xl tracking-[0.3em]">{revele.pin}</b>{" "}
              <span className="text-xs text-muted-foreground">(il ne sera plus affiché)</span>
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => void navigator.clipboard?.writeText(revele.lien).then(() => toast.success("Lien copié"))}>
              Copier le lien
            </Button>
            <a href={`/portails/carte/${revele.id}`} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center rounded-md border px-3 text-xs font-semibold">
              🖨 Carte avec QR
            </a>
            <Button size="sm" variant="ghost" onClick={() => setRevele(null)}>
              Fermer
            </Button>
          </div>
        </div>
      )}

      <SectionPanel title={`Accès (${acces.length})`} flush>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-muted/40 text-[10.5px] uppercase text-muted-foreground">
              <th className="px-3 py-2 text-left">Portail</th>
              <th className="px-3 py-2 text-left">Chez</th>
              <th className="px-3 py-2 text-left">Personne</th>
              <th className="px-3 py-2 text-left">Dernière visite</th>
              <th className="px-3 py-2 text-left">État</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {acces.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-muted-foreground">
                  Aucun accès pour l&apos;instant.
                </td>
              </tr>
            )}
            {acces.map((a) => (
              <Fragment key={a.id}>
                <tr className={`border-b ${a.actif ? "" : "opacity-50"}`}>
                  <td className="px-3 py-2">{a.type === "client" ? "🛍 Client" : "🧵 Sous-traitant"}</td>
                  <td className="px-3 py-2 font-semibold">{a.cible}</td>
                  <td className="px-3 py-2">
                    {a.nom}
                    {a.avecPin && <span className="ml-1 text-muted-foreground">· PIN</span>}
                  </td>
                  <td className="px-3 py-2">
                    {quand(a.derniereVisite)}
                    {a.nbVisites > 0 && <span className="text-muted-foreground"> · {a.nbVisites} visite(s)</span>}
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge tone={a.actif ? "success" : "neutral"}>{a.actif ? "Actif" : "Coupé"}</StatusBadge>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <a href={`/portails/carte/${a.id}`} target="_blank" rel="noreferrer" className="mr-1 inline-flex h-7 items-center rounded-md border px-2 font-semibold">
                      🖨 QR
                    </a>
                    <Button size="sm" variant="outline" className="h-7" onClick={() => void navigator.clipboard?.writeText(lien(base, a)).then(() => toast.success("Lien copié"))}>
                      Lien
                    </Button>{" "}
                    <Button size="sm" variant="outline" className="h-7" onClick={() => setOuvert(ouvert === a.id ? null : a.id)}>
                      {ouvert === a.id ? "▾" : "▸"} Plus
                    </Button>
                  </td>
                </tr>
                {ouvert === a.id && (
                  <tr className="border-b bg-muted/20">
                    <td colSpan={6} className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={() => {
                            if (!confirm("Nouveau lien : l'ancien lien et l'ancien QR ne marcheront plus. Continuer ?")) return;
                            lancer(A.regenererCle(a.id), (r: { cle: string }) => setRevele({ id: a.id, lien: lien(base, { type: a.type, cle: r.cle }), pin: "" }));
                          }}
                        >
                          🔗 Nouveau lien
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={() => {
                            if (!confirm("Nouveau PIN : les téléphones déjà reconnus devront le retaper. Continuer ?")) return;
                            lancer(A.regenererPin(a.id), (r: { pin: string }) => setRevele({ id: a.id, lien: lien(base, a), pin: r.pin }));
                          }}
                        >
                          🔑 {a.avecPin ? "Nouveau PIN" : "Ajouter un PIN"}
                        </Button>
                        {a.type === "client" && a.avecPin && (
                          <Button size="sm" variant="outline" disabled={pending} onClick={() => lancer(A.retirerPin(a.id), () => toast.success("PIN retiré"))}>
                            Retirer le PIN
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant={a.actif ? "destructive" : "outline"}
                          disabled={pending}
                          onClick={() => lancer(A.activerAcces(a.id, !a.actif), () => toast.success(a.actif ? "Accès coupé" : "Accès rouvert"))}
                        >
                          {a.actif ? "⛔ Couper l'accès" : "Rouvrir l'accès"}
                        </Button>
                      </div>
                      {a.evenements.length > 0 && (
                        <ul className="mt-2 space-y-0.5 text-[11px]">
                          {a.evenements.map((e, i) => (
                            <li key={i}>
                              <span className="text-muted-foreground">{new Date(e.le).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</span> ·{" "}
                              {LIBELLE_EVT[e.type] ?? e.type} {e.detail && `— ${e.detail}`}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </SectionPanel>
    </div>
  );
}
