"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { SectionPanel } from "@/components/shared/section-panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ecartsReception, prochainIdentifiant } from "@/lib/domain/tissu";
import type { ReceptionRow } from "@/lib/services/tissu";
import { creerReception, supprimerReception, type SaisieLot, type SaisieRouleau } from "@/lib/actions/tissu";

const UNITES = ["m", "kg", "pcs", "rouleau"];
const q2 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const dateFr = (iso: string) => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10).split("-").reverse().join("/") : iso || "—");

type LigneLot = SaisieLot & { cle: number };
let compteur = 1;
const lotVide = (): LigneLot => ({ cle: compteur++, unite: "m" });

/* Bon de réception tissu — le point d'entrée physique du tissu.
 *
 * On peut saisir plusieurs lots d'un coup (réception globale : Aubergine +
 * Marine). L'identifiant de chaque lot est proposé automatiquement à partir de
 * la couleur (AUBER-01…) pour éviter les doublons, mais reste modifiable. */
export function ReceptionTissu({
  receptions,
  identifiantsExistants,
  clients,
}: {
  receptions: ReceptionRow[];
  identifiantsExistants: string[];
  clients: string[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [fournisseur, setFournisseur] = useState("");
  const [client, setClient] = useState("");
  const [blClient, setBlClient] = useState("");
  const [observations, setObservations] = useState("");
  const [commandeFournisseur, setCommandeFournisseur] = useState("");
  const [lots, setLots] = useState<LigneLot[]>([lotVide()]);

  // Aperçu des identifiants qui seront attribués (couleur → AUBER-01…), en
  // tenant compte des lots déjà saisis dans ce même formulaire.
  const apercuIds = useMemo(() => {
    const pris = [...identifiantsExistants];
    return lots.map((l) => {
      if ((l.identifiant ?? "").trim()) {
        pris.push(l.identifiant!.trim().toUpperCase());
        return l.identifiant!.trim().toUpperCase();
      }
      const id = prochainIdentifiant(l.couleur ?? "", pris);
      pris.push(id);
      return id;
    });
  }, [lots, identifiantsExistants]);

  const num = (v?: string) => {
    const n = Number(String(v ?? "").replace(",", "."));
    return v && Number.isFinite(n) && n > 0 ? n : null;
  };
  /** Lot saisi rouleau par rouleau : le mesuré est la somme des rouleaux. */
  const sommeRouleaux = (l: LigneLot) => Math.round((l.rouleaux ?? []).reduce((s, r) => s + (num(r.metrage) ?? 0), 0) * 100) / 100;
  /** Étiquettes « à mesurer » : métrage saisi plus tard, au scan. */
  const nbAMesurer = (l: LigneLot) => Math.max(0, Math.trunc(num(l.aMesurer) ?? 0));
  const parRouleau = (l: LigneLot) => (l.rouleaux ?? []).length > 0 || nbAMesurer(l) > 0;
  const mesure = (l: LigneLot) => (parRouleau(l) ? sommeRouleaux(l) : (num(l.quantiteRecue) ?? 0));
  const ecarts = lots.map((l) =>
    ecartsReception({
      quantiteRecue: mesure(l),
      quantiteAnnoncee: num(l.quantiteAnnoncee),
      laize: num(l.laize),
      laizeAnnoncee: num(l.laizeAnnoncee),
      defauts: l.defauts ?? "",
      unite: l.unite,
      aMesurer: nbAMesurer(l),
    }),
  );

  const setLot = (cle: number, champ: Exclude<keyof SaisieLot, "rouleaux">, val: string) =>
    setLots((s) => s.map((l) => (l.cle === cle ? { ...l, [champ]: val } : l)));
  const setRouleaux = (cle: number, f: (r: SaisieRouleau[]) => SaisieRouleau[]) =>
    setLots((s) => s.map((l) => (l.cle === cle ? { ...l, rouleaux: f(l.rouleaux ?? []) } : l)));

  const enregistrer = () =>
    start(async () => {
      const r = await creerReception({ date, fournisseur, client, blClient, observations, commandeFournisseur, lots });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      if (r.rouleauIds.length) {
        // « Imprimer toutes les étiquettes » : une par rouleau, tout de suite.
        window.open(`/magtissu/etiquettes/rouleaux?reception=${r.receptionId}`, "_blank");
        toast.success(
          lots.some((l) => nbAMesurer(l) > 0)
            ? `${r.rouleauIds.length} étiquette(s) créées : collez-les, le magasinier saisit chaque métrage en scannant (Scanner → Mesurer).`
            : `${r.rouleauIds.length} rouleau(x) créés « en attente » : collez les étiquettes puis scannez-les au magasin.`,
        );
      }
      if (ecarts.some((e) => e.aReclamer)) {
        toast.warning("Réception enregistrée avec des écarts : imprimez la réclamation client avant la coupe.");
        window.open(`/magtissu/reclamation/${r.receptionId}`, "_blank");
      } else toast.success("Bon de réception créé");
      setFournisseur("");
      setClient("");
      setBlClient("");
      setObservations("");
      setCommandeFournisseur("");
      setLots([lotVide()]);
      router.refresh();
    });

  return (
    <div className="space-y-4">
      {/* Retour vers le magasin tissu (point 1). */}
      <div className="flex items-center gap-2">
        <Link
          href="/magtissu"
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input px-2.5 text-[11px] font-semibold hover:bg-muted"
        >
          ← Retour au magasin tissu
        </Link>
      </div>
      <SectionPanel title="Nouveau bon de réception tissu">
        <div className="grid gap-3 sm:grid-cols-6">
          <Champ label="Date de réception">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="bg-card" />
          </Champ>
          <Champ label="Fournisseur">
            <Input value={fournisseur} onChange={(e) => setFournisseur(e.target.value)} placeholder="Fournisseur tissu" className="bg-card" />
          </Champ>
          <Champ label="Client / donneur d'ordre">
            {/* Liste des clients créés + saisie libre en repli (point 3). */}
            <input
              list="clients-reception"
              value={client}
              onChange={(e) => setClient(e.target.value)}
              placeholder="Choisir un client…"
              className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
            />
            <datalist id="clients-reception">
              {clients.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Champ>
          <Champ label="N° BL du client">
            <Input value={blClient} onChange={(e) => setBlClient(e.target.value)} placeholder="Bon de livraison" className="bg-card" />
          </Champ>
          <Champ label="Commande fournisseur">
            <Input value={commandeFournisseur} onChange={(e) => setCommandeFournisseur(e.target.value)} placeholder="N° commande / PO" className="bg-card" />
          </Champ>
          <Champ label="Observations">
            <Input value={observations} onChange={(e) => setObservations(e.target.value)} placeholder="Note libre" className="bg-card" />
          </Champ>
        </div>

        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase text-muted-foreground">Lots reçus</span>
            <Button size="sm" variant="outline" onClick={() => setLots((s) => [...s, lotVide()])}>
              <Plus className="size-3.5" /> Ajouter un lot
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/30 text-[10.5px] uppercase text-muted-foreground">
                  <th className="px-2 py-1.5 text-left">Identifiant lot</th>
                  <th className="px-2 py-1.5 text-left">Couleur</th>
                  <th className="px-2 py-1.5 text-left">Référence</th>
                  <th className="px-2 py-1.5 text-center" title="Métrage écrit sur le bon de livraison du client">Annoncé BL</th>
                  <th className="px-2 py-1.5 text-center" title="Métrage mesuré à la réception : c'est lui qui entre en stock">Mesuré</th>
                  <th className="px-2 py-1.5 text-center">Unité</th>
                  <th className="px-2 py-1.5 text-center">Laize annoncée</th>
                  <th className="px-2 py-1.5 text-center">Laize réelle</th>
                  <th className="px-2 py-1.5 text-center">Rouleaux</th>
                  <th className="px-2 py-1.5 text-left">Saison</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {lots.map((l, i) => (
                  <Fragment key={l.cle}>
                    <tr className="align-top">
                      <td className="px-2 pt-1.5">
                        <Input
                          value={l.identifiant ?? ""}
                          onChange={(e) => setLot(l.cle, "identifiant", e.target.value)}
                          placeholder={apercuIds[i]}
                          className="h-8 bg-card font-mono"
                        />
                        {!(l.identifiant ?? "").trim() && <div className="mt-0.5 text-[10px] text-muted-foreground">auto : {apercuIds[i]}</div>}
                      </td>
                      <td className="px-2 pt-1.5">
                        <Input value={l.couleur ?? ""} onChange={(e) => setLot(l.cle, "couleur", e.target.value)} placeholder="Aubergine" className="h-8 bg-card" />
                      </td>
                      <td className="px-2 pt-1.5">
                        <Input value={l.reference ?? ""} onChange={(e) => setLot(l.cle, "reference", e.target.value)} placeholder="Réf." className="h-8 bg-card" />
                      </td>
                      <td className="px-2 pt-1.5">
                        <Input value={l.quantiteAnnoncee ?? ""} onChange={(e) => setLot(l.cle, "quantiteAnnoncee", e.target.value)} inputMode="decimal" placeholder="BL" className="h-8 bg-card text-center" />
                      </td>
                      <td className="px-2 pt-1.5">
                        {parRouleau(l) ? (
                          <div className="flex h-8 items-center justify-center rounded-md border bg-muted/40 font-semibold tabular-nums" title="Somme des rouleaux mesurés">
                            {(l.rouleaux ?? []).length ? q2.format(sommeRouleaux(l)) : ""}
                            {nbAMesurer(l) > 0 && <span className="ml-1 text-[10px] font-normal text-muted-foreground">{(l.rouleaux ?? []).length ? "+ " : ""}au scan</span>}
                          </div>
                        ) : (
                          <Input value={l.quantiteRecue ?? ""} onChange={(e) => setLot(l.cle, "quantiteRecue", e.target.value)} inputMode="decimal" placeholder="0" className="h-8 bg-card text-center font-semibold" />
                        )}
                      </td>
                      <td className="px-2 pt-1.5">
                        <select value={l.unite ?? "m"} onChange={(e) => setLot(l.cle, "unite", e.target.value)} className="h-8 w-full rounded-md border border-input bg-card px-1 text-xs">
                          {UNITES.map((u) => (
                            <option key={u}>{u}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 pt-1.5">
                        <Input value={l.laizeAnnoncee ?? ""} onChange={(e) => setLot(l.cle, "laizeAnnoncee", e.target.value)} inputMode="decimal" placeholder="cm" className="h-8 bg-card text-center" />
                      </td>
                      <td className="px-2 pt-1.5">
                        <Input value={l.laize ?? ""} onChange={(e) => setLot(l.cle, "laize", e.target.value)} inputMode="decimal" placeholder="cm" className="h-8 bg-card text-center" />
                      </td>
                      <td className="px-2 pt-1.5">
                        {parRouleau(l) ? (
                          <div className="flex h-8 items-center justify-center rounded-md border bg-muted/40 font-semibold">{(l.rouleaux ?? []).length + nbAMesurer(l)}</div>
                        ) : (
                          <Input value={l.nbRouleaux ?? ""} onChange={(e) => setLot(l.cle, "nbRouleaux", e.target.value)} inputMode="numeric" className="h-8 bg-card text-center" />
                        )}
                      </td>
                      <td className="px-2 pt-1.5">
                        <Input value={l.saison ?? ""} onChange={(e) => setLot(l.cle, "saison", e.target.value)} placeholder="PE26" className="h-8 bg-card" />
                      </td>
                      <td className="px-2 pt-1.5 text-center">
                        {lots.length > 1 && (
                          <button type="button" onClick={() => setLots((s) => s.filter((x) => x.cle !== l.cle))} className="rounded p-1 text-muted-foreground hover:bg-muted" title="Retirer ce lot">
                            <Trash2 className="size-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                    <tr className="border-b">
                      <td colSpan={11} className="px-2 pb-2 pt-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <select value={l.controle ?? ""} onChange={(e) => setLot(l.cle, "controle", e.target.value)} className="h-8 rounded-md border border-input bg-card px-1 text-xs">
                            <option value="">Contrôle : à faire</option>
                            <option value="conforme">✓ Conforme</option>
                            <option value="reserve">Accepté sous réserve</option>
                            <option value="refuse">✗ Refusé</option>
                          </select>
                          <Input
                            value={l.defauts ?? ""}
                            onChange={(e) => setLot(l.cle, "defauts", e.target.value)}
                            placeholder="Défauts constatés (trous, taches, nuance, lisière…)"
                            className="h-8 min-w-[260px] flex-1 bg-card"
                          />
                          <Input value={l.lotFournisseur ?? ""} onChange={(e) => setLot(l.cle, "lotFournisseur", e.target.value)} placeholder="Lot fournisseur" className="h-8 w-36 bg-card" />
                          <Input value={l.codeCouleur ?? ""} onChange={(e) => setLot(l.cle, "codeCouleur", e.target.value)} placeholder="Code couleur" className="h-8 w-32 bg-card" />
                          {ecarts[i].aReclamer ? (
                            <span className="rounded-md bg-[var(--danger-l)] px-2 py-1 text-[11px] font-semibold text-[var(--danger-d)]">⚠ {ecarts[i].motifs[0]}</span>
                          ) : ecarts[i].annonce != null ? (
                            <span className="text-[11px] font-semibold text-success-foreground">✓ conforme au BL</span>
                          ) : null}
                        </div>
                        <SaisieRouleaux
                          rouleaux={l.rouleaux ?? []}
                          unite={l.unite ?? "m"}
                          laize={l.laize ?? ""}
                          onChange={(f) => setRouleaux(l.cle, f)}
                          aMesurer={l.aMesurer ?? ""}
                          onAMesurer={(v) => setLot(l.cle, "aMesurer", v)}
                        />
                      </td>
                    </tr>
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex items-center justify-end gap-2">
            <span className="text-[11px] text-muted-foreground">
              Le métrage MESURÉ entre en stock ; l&apos;écart avec le BL du client est à réclamer avant la coupe. Chaque rouleau reçoit
              son ID et son étiquette QR — métrage saisi ici, ou au scan pour les étiquettes « à mesurer ».
            </span>
            <Button disabled={pending} onClick={enregistrer}>
              {pending ? "Enregistrement…" : "Enregistrer la réception"}
            </Button>
          </div>
        </div>
      </SectionPanel>

      {/* Historique des réceptions */}
      <SectionPanel title={`Réceptions récentes (${receptions.length})`} flush>
        {receptions.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">Aucune réception enregistrée.</div>
        ) : (
          <div className="divide-y">
            {receptions.slice(0, 25).map((r) => (
              <div key={r.id} className="px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-bold">{r.numero}</span>
                  <span className="text-xs text-muted-foreground">{dateFr(r.date)}</span>
                  {r.fournisseur && <span className="text-xs">· {r.fournisseur}</span>}
                  {r.client && <StatusBadge tone="info">{r.client}</StatusBadge>}
                  {r.blClient && <span className="text-xs text-muted-foreground">BL {r.blClient}</span>}
                  {r.lots.some((l) => l.ecarts.aReclamer) && (
                    <Link href={`/magtissu/reclamation/${r.id}`} target="_blank" className="text-xs font-semibold text-[var(--danger-d)] underline">
                      🧾 Réclamation client
                    </Link>
                  )}
                  {r.lots.some((l) => l.rouleaux.length > 0) && (
                    <Link href={`/magtissu/etiquettes/rouleaux?reception=${r.id}`} target="_blank" className="text-xs font-semibold text-brand underline">
                      🏷 Imprimer toutes les étiquettes ({r.lots.reduce((n, l) => n + l.rouleaux.length, 0)})
                    </Link>
                  )}
                  <span className="ml-auto text-xs text-muted-foreground">{r.lots.length} lot(s)</span>
                  <button
                    type="button"
                    onClick={() =>
                      start(async () => {
                        if (!confirm(`Supprimer le bon ${r.numero} et ses lots ?`)) return;
                        const res = await supprimerReception(r.id);
                        if (!res.ok) toast.error(res.error);
                        else {
                          toast.success("Réception supprimée");
                          router.refresh();
                        }
                      })
                    }
                    className="rounded p-1 text-muted-foreground hover:bg-muted"
                    title="Supprimer"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
                {r.lots.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {r.lots.map((l) => (
                      <span key={l.id} className="rounded-md border bg-muted/40 px-2 py-0.5 text-[11px]">
                        <b className="font-mono">{l.identifiant}</b> · {l.couleur || "—"} · {q2.format(l.quantiteRecue)} {l.unite}
                        {l.aMesurer > 0 && <b className="text-amber-700"> · {l.aMesurer} à mesurer</b>}
                      </span>
                    ))}
                  </div>
                )}
                {r.observations && <div className="mt-1 text-[11px] text-muted-foreground">{r.observations}</div>}
              </div>
            ))}
          </div>
        )}
      </SectionPanel>
    </div>
  );
}

function Champ({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-bold uppercase text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

/** Rouleaux physiques d'un lot, à la réception. Deux façons, au choix selon
 * le personnel disponible (et combinables sur un même lot) :
 *   📋 saisir ici le métrage de chaque rouleau, puis imprimer les étiquettes ;
 *   🏷 imprimer d'abord N étiquettes « Métrage : ____ m », le magasinier
 *      saisit chaque métrage en scannant le rouleau.
 * Entrée sur la dernière ligne ajoute un rouleau (saisie rapide au clavier). */
function SaisieRouleaux({
  rouleaux,
  unite,
  laize,
  onChange,
  aMesurer,
  onAMesurer,
}: {
  rouleaux: SaisieRouleau[];
  unite: string;
  laize: string;
  onChange: (f: (r: SaisieRouleau[]) => SaisieRouleau[]) => void;
  aMesurer: string;
  onAMesurer: (v: string) => void;
}) {
  const vide = (): SaisieRouleau => ({ metrage: "", annonce: "", laize, poids: "", observations: "" });
  const n = Math.max(0, Math.trunc(Number(aMesurer) || 0));
  const etiquettes =
    aMesurer !== "" ? (
      <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-950">
        <b>🏷 Étiquettes à remplir au magasin :</b>
        <Input
          value={aMesurer}
          onChange={(e) => onAMesurer(e.target.value.replace(/\D/g, "").slice(0, 3))}
          inputMode="numeric"
          autoFocus
          className="h-7 w-16 bg-card text-center font-bold"
        />
        <span>
          {rouleaux.length ? "rouleau(x) de plus, " : "rouleau(x), "}
          {n > 0 ? `${n} étiquette(s) « Métrage : ____ ${unite} » à coller ; le magasinier saisit chaque métrage en scannant.` : "tapez le nombre de rouleaux reçus."}
        </span>
        <button type="button" onClick={() => onAMesurer("")} className="ml-auto rounded p-0.5 text-amber-900 hover:bg-amber-100" title="Retirer">
          <Trash2 className="size-3" />
        </button>
      </div>
    ) : null;
  if (!rouleaux.length) {
    return (
      <>
        {etiquettes ?? (
          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[11px]">
            <span className="font-semibold text-muted-foreground">Étiquettes QR par rouleau :</span>
            <button type="button" onClick={() => onChange(() => [vide()])} className="font-semibold text-brand hover:underline">
              📋 Saisir les métrages maintenant (bureau)
            </button>
            <span className="text-muted-foreground">ou</span>
            <button type="button" onClick={() => onAMesurer("1")} className="font-semibold text-amber-800 hover:underline">
              🏷 Étiquettes à remplir au magasin (métrage au scan)
            </button>
          </div>
        )}
      </>
    );
  }
  const set = (i: number, k: keyof SaisieRouleau, v: string) => onChange((s) => s.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  return (
    <div className="mt-2 rounded-md border bg-muted/20 p-2">
      <div className="mb-1 text-[10.5px] font-bold uppercase text-muted-foreground">Rouleaux ({rouleaux.length})</div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-[10px] uppercase text-muted-foreground">
            <th className="w-8 text-left">#</th>
            <th className="text-left">Mesuré ({unite})</th>
            <th className="text-left">Étiquette fourn. ({unite})</th>
            <th className="text-left">Laize (cm)</th>
            <th className="text-left">Poids (kg)</th>
            <th className="text-left">Observations / défauts</th>
            <th className="w-6" />
          </tr>
        </thead>
        <tbody>
          {rouleaux.map((r, i) => (
            <tr key={i}>
              <td className="text-muted-foreground">{i + 1}</td>
              {(["metrage", "annonce", "laize", "poids", "observations"] as const).map((k) => (
                <td key={k} className="py-0.5 pr-1">
                  <Input
                    value={r[k] ?? ""}
                    onChange={(e) => set(i, k, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && i === rouleaux.length - 1) {
                        e.preventDefault();
                        onChange((s) => [...s, vide()]);
                      }
                    }}
                    inputMode={k === "observations" ? "text" : "decimal"}
                    className={`h-7 bg-card ${k === "metrage" ? "font-semibold" : ""}`}
                  />
                </td>
              ))}
              <td>
                <button type="button" onClick={() => onChange((s) => s.filter((_, j) => j !== i))} className="rounded p-0.5 text-muted-foreground hover:bg-muted">
                  <Trash2 className="size-3" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-1 flex gap-2">
        <Button type="button" size="sm" variant="outline" className="h-7" onClick={() => onChange((s) => [...s, vide()])}>
          + Rouleau
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-7" onClick={() => onChange((s) => [...s, ...Array.from({ length: 5 }, vide)])}>
          + 5 rouleaux
        </Button>
        {aMesurer === "" && (
          <button type="button" onClick={() => onAMesurer("1")} className="ml-2 text-[11px] font-semibold text-amber-800 hover:underline">
            + 🏷 étiquettes à remplir au magasin (rouleaux pas encore mesurés)
          </button>
        )}
      </div>
      {etiquettes}
    </div>
  );
}
