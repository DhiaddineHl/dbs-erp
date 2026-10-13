"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Tags } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import * as A from "@/lib/actions/paquets";
import * as pq from "@/lib/domain/paquet";
import type { OfAvecPaquets } from "@/lib/services/paquets";

/* La grille « où est le paquet ».
 *
 * Une ligne par paquet, une colonne par liasse, plus l'assemblage. Une case
 * vide veut dire SANS NOUVELLE — personne n'est passé —, jamais « en
 * retard » : la tournée est facultative et peut sauter des jours. C'est
 * pour cela qu'elle est grise et non rouge. */

type Gabarit = { id: number; nom: string; liasses: string[] };
type CommandeChoix = { id: number; of: string; modele: string };

const CASE: Record<pq.EtatCase, { texte: string; classe: string; titre: string }> = {
  fait: { texte: "✓", classe: "bg-success/15 text-success-foreground", titre: "Liasse finie" },
  probleme: { texte: "⚠", classe: "bg-warning/20 text-warning-foreground", titre: "Problème signalé" },
  vide: { texte: "·", classe: "text-muted-foreground/50", titre: "Sans nouvelle — personne n'est passé" },
};

export function PaquetsClient({
  actif,
  roles,
  ofs,
  ofCourant,
  paquets,
  gabarits,
  commandes,
  ongletInitial,
  peutRelever,
  peutRegler,
}: {
  actif: boolean;
  roles: string[];
  ofs: OfAvecPaquets[];
  ofCourant: number | null;
  paquets: PaquetLigne[];
  gabarits: Gabarit[];
  commandes: CommandeChoix[];
  ongletInitial: "grille" | "reglages";
  peutRelever: boolean;
  peutRegler: boolean;
}) {
  const router = useRouter();
  const [onglet, setOnglet] = useState<"grille" | "reglages">(ongletInitial);
  const of = useMemo(() => ofs.find((o) => o.commandeId === ofCourant) ?? null, [ofs, ofCourant]);

  return (
    <div>
      <PageHeader
        icon={Tags}
        title="Suivi paquets"
        description="Où en est chaque paquet, de la coupe à l'assemblage. Ce tableau ne compte pas la production : elle reste celle de la sortie de chaîne."
        actions={
          <>
            {peutRelever && (
              <Link href="/m/paquets" className="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white">
                📱 Faire la tournée
              </Link>
            )}
            <button
              type="button"
              onClick={() => setOnglet(onglet === "grille" ? "reglages" : "grille")}
              className="rounded-md border px-3 py-1.5 text-xs font-semibold"
            >
              {onglet === "grille" ? "⚙ Réglages & listes de liasses" : "← La grille"}
            </button>
          </>
        }
      />

      {!actif && (
        <div className="mb-4 rounded-lg border border-warning bg-warning/10 px-4 py-3 text-xs">
          <b>Le suivi par paquets n&apos;est pas activé.</b> Tant qu&apos;il est éteint, aucun paquet n&apos;est créé
          quand une fiche de coupe est validée, et rien ne change nulle part. Activez-le dans les réglages, puis validez
          une nouvelle fiche de coupe : ses paquets apparaîtront ici.
        </div>
      )}

      {onglet === "reglages" ? (
        <Reglages actif={actif} roles={roles} gabarits={gabarits} commandes={commandes} peutRegler={peutRegler} />
      ) : ofs.length === 0 ? (
        <div className="rounded-lg border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
          Aucun paquet pour l&apos;instant.
          <br />
          Les paquets naissent tout seuls à la validation d&apos;une fiche de coupe.
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <select
              value={ofCourant ?? ""}
              onChange={(e) => router.push(`/paquets?of=${e.target.value}`)}
              className="rounded-md border bg-card px-3 py-1.5 text-sm"
            >
              {ofs.map((o) => (
                <option key={o.commandeId} value={o.commandeId}>
                  {o.of} — {o.modele}
                  {o.couleur ? ` · ${o.couleur}` : ""} ({o.bilan.nbPaquets} paquets)
                </option>
              ))}
            </select>
            {of && (
              <Link
                href={`/paquets/etiquettes?of=${of.commandeId}`}
                className="rounded-md border px-3 py-1.5 text-xs font-semibold"
              >
                🖨 Étiquettes QR
              </Link>
            )}
          </div>
          {of && <Grille of={of} paquets={paquets} peutRelever={peutRelever} />}
        </>
      )}
    </div>
  );
}

/* ─────────── la grille d'un OF ─────────── */

function Grille({ of, paquets, peutRelever }: { of: OfAvecPaquets; paquets: PaquetLigne[]; peutRelever: boolean }) {
  const b = of.bilan;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Kpi l="Paquets" v={String(b.nbPaquets)} s={`${b.pieces} pièces`} />
        <Kpi l="Sans nouvelle" v={String(b.vides)} s="personne n'est passé" />
        <Kpi l="En préparation" v={String(b.enCours)} />
        <Kpi l="Prêts à assembler" v={String(b.prets)} ton="warning" />
        <Kpi l="Assemblés" v={String(b.assembles)} s={`${b.piecesAssemblees} pièces`} ton="success" />
      </div>

      {b.liasseEnRetard && (
        <div className="rounded-lg border border-warning bg-warning/10 px-4 py-2.5 text-xs">
          🧵 <b>{b.liasseEnRetard.liasse}</b> manque à {b.liasseEnRetard.manque} paquet(s) déjà commencés : c&apos;est
          elle qui retarde le plus d&apos;assemblages.
        </div>
      )}
      {b.problemes > 0 && (
        <div className="rounded-lg border border-warning bg-warning/10 px-4 py-2.5 text-xs">
          ⚠ {b.problemes} paquet(s) avec un problème signalé.
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-muted/40 text-[10.5px] uppercase text-muted-foreground">
              <th className="px-3 py-2 text-left">Paquet</th>
              <th className="px-2 py-2 text-left">Taille</th>
              <th className="px-2 py-2 text-right">Pièces</th>
              {of.liasses.map((l) => (
                <th key={l} className="px-2 py-2 text-center">
                  {l}
                </th>
              ))}
              <th className="px-2 py-2 text-center">Assemblé</th>
              <th className="px-3 py-2 text-left">État</th>
            </tr>
          </thead>
          <tbody>
            {paquets.length === 0 ? (
              <tr>
                <td colSpan={of.liasses.length + 5} className="py-8 text-center text-muted-foreground">
                  Aucun paquet sur cet OF.
                </td>
              </tr>
            ) : (
              paquets.map((p) => {
                const lib = pq.LIBELLE_AVANCEMENT[p.avancement];
                return (
                  <tr key={p.id} className={`border-b last:border-0 ${p.statut !== "actif" ? "opacity-50 line-through" : ""}`}>
                    <td className="px-3 py-1.5 font-bold text-brand">
                      {p.numero}
                      <span className="ml-1 font-mono text-[10px] font-normal text-muted-foreground">{p.code}</span>
                    </td>
                    <td className="px-2 py-1.5">{p.taille || "—"}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {p.qte}
                      <span className="ml-1 text-[10px] text-muted-foreground">
                        ({p.pieceDebut}–{p.pieceFin})
                      </span>
                    </td>
                    {p.cases.map((c) => (
                      <td key={c.liasse} className="px-2 py-1.5 text-center">
                        <span
                          className={`inline-flex size-6 items-center justify-center rounded font-bold ${CASE[c.etat].classe}`}
                          title={
                            c.etat === "vide"
                              ? CASE.vide.titre
                              : `${CASE[c.etat].titre} — ${c.le} par ${c.par}${c.note ? ` · ${c.note}` : ""}`
                          }
                        >
                          {CASE[c.etat].texte}
                        </span>
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-center">
                      <span
                        className={`inline-flex size-6 items-center justify-center rounded font-bold ${p.assemble ? CASE.fait.classe : CASE.vide.classe}`}
                        title={p.assemble ? `Assemblé le ${p.assembleLe} par ${p.assemblePar}` : CASE.vide.titre}
                      >
                        {p.assemble ? "✓" : "·"}
                      </span>
                    </td>
                    <td className="px-3 py-1.5">
                      <StatusBadge tone={lib.tone}>{lib.label}</StatusBadge>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Une case grise « · » veut dire <b>sans nouvelle</b> : personne n&apos;est passé relever cette liasse. Ce
        n&apos;est pas un retard, et rien n&apos;est bloqué — la production avance de toute façon.
        {peutRelever && (
          <>
            {" "}
            Pour relever, utilisez <Link href="/m/paquets" className="underline">la tournée</Link> depuis un téléphone.
          </>
        )}
      </p>
    </div>
  );
}

export type PaquetLigne = {
  id: number;
  code: string;
  numero: number;
  taille: string;
  qte: number;
  pieceDebut: number;
  pieceFin: number;
  statut: string;
  cases: pq.CaseLiasse[];
  assemble: boolean;
  assembleLe: string;
  assemblePar: string;
  avancement: pq.EtatPaquet["avancement"];
};

function Kpi({ l, v, s, ton }: { l: string; v: string; s?: string; ton?: "success" | "warning" }) {
  const couleur = ton === "success" ? "text-success-foreground" : ton === "warning" ? "text-warning-foreground" : "";
  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <div className="text-[10px] uppercase text-muted-foreground">{l}</div>
      <div className={`text-lg font-extrabold tabular-nums ${couleur}`}>{v}</div>
      {s && <div className="text-[10px] text-muted-foreground">{s}</div>}
    </div>
  );
}

/* ─────────── réglages et listes de liasses ─────────── */

const ROLES_CONNUS = [
  { cle: "resp", label: "Responsable Prod." },
  { cle: "chef", label: "Chef de chaîne" },
  { cle: "analyst", label: "Analyste" },
];

function Reglages({
  actif,
  roles,
  gabarits,
  commandes,
  peutRegler,
}: {
  actif: boolean;
  roles: string[];
  gabarits: Gabarit[];
  commandes: CommandeChoix[];
  peutRegler: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [nom, setNom] = useState("");
  const [liste, setListe] = useState("");
  const [cmd, setCmd] = useState<number | null>(null);
  const [liassesCmd, setLiassesCmd] = useState("");

  const lancer = (p: Promise<A.Result>, succes: string) =>
    start(async () => {
      const r = await p;
      if (!r.ok) return void toast.error(r.error);
      toast.success(succes);
      router.refresh();
    });

  return (
    <div className="space-y-5">
      <section className="rounded-lg border bg-card p-4">
        <h2 className="mb-2 text-sm font-bold">Activer le suivi</h2>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={actif}
            disabled={!peutRegler || pending}
            onChange={(e) => lancer(A.enregistrerReglages({ actif: e.target.checked }), e.target.checked ? "Suivi activé" : "Suivi désactivé")}
          />
          Créer les paquets à la validation des fiches de coupe
        </label>
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Éteint, rien n&apos;est créé et rien ne change nulle part. Les paquets déjà créés restent visibles.
        </p>
      </section>

      <section className="rounded-lg border bg-card p-4">
        <h2 className="mb-2 text-sm font-bold">Qui peut faire la tournée</h2>
        <div className="flex flex-wrap gap-3 text-sm">
          <label className="flex items-center gap-1.5 text-muted-foreground">
            <input type="checkbox" checked disabled /> Administrateur
          </label>
          {ROLES_CONNUS.map((r) => (
            <label key={r.cle} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={roles.includes(r.cle)}
                disabled={!peutRegler || pending}
                onChange={(e) =>
                  lancer(
                    A.enregistrerReglages({
                      roles: e.target.checked ? [...roles, r.cle] : roles.filter((x) => x !== r.cle),
                    }),
                    "Droits de tournée mis à jour",
                  )
                }
              />
              {r.label}
            </label>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          L&apos;administrateur garde toujours la main. Votre agent de méthode travaille avec le compte « Responsable
          Prod. » : cochez-le pour qu&apos;il puisse relever.
        </p>
      </section>

      <section className="rounded-lg border bg-card p-4">
        <h2 className="mb-1 text-sm font-bold">Listes de liasses réutilisables</h2>
        <p className="mb-3 text-[11px] text-muted-foreground">
          Une liste par type de vêtement, tapée une seule fois. Pour une chemise : col et pied de col, devant et patte,
          manches, carrure et dos. Séparez par des virgules.
        </p>
        <div className="mb-3 space-y-1.5">
          {gabarits.length === 0 && <div className="text-xs text-muted-foreground">Aucune liste pour l&apos;instant.</div>}
          {gabarits.map((g) => (
            <div key={g.id} className="flex items-center gap-2 rounded border px-3 py-1.5 text-xs">
              <b className="w-28 shrink-0">{g.nom}</b>
              <span className="flex-1 text-muted-foreground">{g.liasses.join(" · ")}</span>
              {peutRegler && (
                <button
                  type="button"
                  disabled={pending}
                  className="text-[11px] font-semibold text-[var(--danger-d)]"
                  onClick={() => confirm(`Supprimer la liste « ${g.nom} » ?`) && lancer(A.supprimerGabarit(g.id), "Liste supprimée")}
                >
                  Supprimer
                </button>
              )}
            </div>
          ))}
        </div>
        {peutRegler && (
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs">
              <div className="mb-0.5 text-muted-foreground">Nom</div>
              <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Chemise" className="rounded border bg-card px-2 py-1" />
            </label>
            <label className="min-w-[280px] flex-1 text-xs">
              <div className="mb-0.5 text-muted-foreground">Liasses</div>
              <input
                value={liste}
                onChange={(e) => setListe(e.target.value)}
                placeholder="Col et pied de col, Devant et patte, Manches, Carrure et dos"
                className="w-full rounded border bg-card px-2 py-1"
              />
            </label>
            <Button
              size="sm"
              disabled={pending || !nom.trim()}
              onClick={() =>
                lancer(
                  A.enregistrerGabarit({ nom, liasses: liste.split(",") }).then((r) => {
                    if (r.ok) {
                      setNom("");
                      setListe("");
                    }
                    return r;
                  }),
                  "Liste enregistrée",
                )
              }
            >
              Ajouter
            </Button>
          </div>
        )}
      </section>

      <section className="rounded-lg border bg-card p-4">
        <h2 className="mb-1 text-sm font-bold">Liasses d&apos;une commande</h2>
        <p className="mb-3 text-[11px] text-muted-foreground">
          La liste retenue pour cet OF. Elle est <b>figée sur chaque paquet à sa création</b> : la changer plus tard ne
          réécrit pas les étiquettes déjà imprimées. Sans liste, le paquet voyage d&apos;un seul bloc.
        </p>
        {peutRegler && (
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs">
              <div className="mb-0.5 text-muted-foreground">Commande</div>
              <select
                value={cmd ?? ""}
                onChange={(e) => setCmd(Number(e.target.value) || null)}
                className="max-w-[260px] rounded border bg-card px-2 py-1"
              >
                <option value="">— Choisir —</option>
                {commandes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.of} — {c.modele}
                  </option>
                ))}
              </select>
            </label>
            <label className="min-w-[260px] flex-1 text-xs">
              <div className="mb-0.5 text-muted-foreground">Liasses (ou choisissez une liste ci-dessous)</div>
              <input
                value={liassesCmd}
                onChange={(e) => setLiassesCmd(e.target.value)}
                placeholder="Col, Devant, Manches, Dos"
                className="w-full rounded border bg-card px-2 py-1"
              />
            </label>
            <Button
              size="sm"
              disabled={pending || !cmd}
              onClick={() => cmd && lancer(A.enregistrerLiasses(cmd, liassesCmd.split(",")), "Liasses enregistrées pour cet OF")}
            >
              Enregistrer
            </Button>
            {gabarits.length > 0 && (
              <div className="flex w-full flex-wrap gap-1.5 pt-1">
                {gabarits.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    className="rounded border px-2 py-0.5 text-[11px] font-semibold"
                    onClick={() => setListeDepuisGabarit(g, setLiassesCmd)}
                  >
                    ↙ {g.nom}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

const setListeDepuisGabarit = (g: Gabarit, set: (v: string) => void) => set(g.liasses.join(", "));
