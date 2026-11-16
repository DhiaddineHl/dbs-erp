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

/** 2026-10-12 → « 12/10 » : la grille a trop de colonnes pour une date longue. */
const dateCourte = (iso: string) => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : iso || "·");

const CASE: Record<pq.EtatCase, { texte: string; classe: string; titre: string }> = {
  fait: { texte: "✓", classe: "bg-success/15 text-success-foreground", titre: "Morceau déclaré fini (tournée)" },
  en_cours: { texte: "▸", classe: "bg-info/15 text-info", titre: "Fini à un poste (scan de la saisie horaire)" },
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
  fichesSansPaquets = [],
}: {
  /** Fiches validées avant l'activation : leurs paquets se créent après coup. */
  fichesSansPaquets?: { id: number; numero: string; date: string }[];
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
              {onglet === "grille" ? "⚙ Réglages & listes de morceaux" : "← La grille"}
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

      {actif && fichesSansPaquets.length > 0 && onglet === "grille" && (
        <FichesSansPaquets fiches={fichesSansPaquets} peutRegler={peutRegler} />
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
          <QuiAFait />
          {of && <Grille of={of} paquets={paquets} peutRelever={peutRelever} />}
        </>
      )}
    </div>
  );
}

/* ─────────── la grille d'un OF ─────────── */

function Grille({ of, paquets, peutRelever }: { of: OfAvecPaquets; paquets: PaquetLigne[]; peutRelever: boolean }) {
  const b = of.bilan;
  const router = useRouter();
  const [pending, start] = useTransition();
  const ancienReleve = paquets.some((p) => p.chaine);
  const lancer = (pr: Promise<A.Result>, succes: string) =>
    start(async () => {
      const r = await pr;
      if (!r.ok) return void toast.error(r.error);
      toast.success(succes);
      router.refresh();
    });
  return (
    <div className="space-y-4">
      {peutRelever && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold text-muted-foreground">Morceaux de {of.of} :</span>
          {of.liasses.map((l) => (
            <span key={l} className="rounded-full bg-muted px-2.5 py-1 font-semibold">
              {l}
            </span>
          ))}
          <Button
            size="sm"
            variant="outline"
            className="h-7"
            disabled={pending}
            onClick={() => {
              const nom = prompt("Nom du morceau oublié (ex. « Poignet ») — il s'ajoute à tous les paquets de l'OF :");
              if (nom?.trim()) lancer(A.ajouterMorceau(of.commandeId, nom), `« ${nom.trim()} » ajouté — imprimez ses étiquettes`);
            }}
          >
            ＋ Morceau oublié
          </Button>
          {of.liasses.length > 1 && (
            <Button
              size="sm"
              variant="outline"
              className="h-7"
              disabled={pending}
              onClick={() => {
                const nom = prompt(`Morceau à annuler (il reste dans l'historique) :\n${of.liasses.join(", ")}`);
                if (nom?.trim()) lancer(A.annulerMorceau(of.commandeId, nom), `« ${nom.trim()} » annulé`);
              }}
            >
              Annuler un morceau
            </Button>
          )}
        </div>
      )}
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
              {ancienReleve && (
                <th className="px-2 py-2 text-center" title="Ancien relevé « travaillé dessus » de la saisie horaire">
                  En chaîne (ancien)
                </th>
              )}
              <th className="px-2 py-2 text-center">Assemblé</th>
              <th className="px-3 py-2 text-left">État</th>
            </tr>
          </thead>
          <tbody>
            {paquets.length === 0 ? (
              <tr>
                <td colSpan={of.liasses.length + (ancienReleve ? 6 : 5)} className="py-8 text-center text-muted-foreground">
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
                    <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">
                      {p.qteImprimee !== p.qte && (
                        <span className="mr-1 text-[10px] text-muted-foreground line-through" title="Quantité imprimée sur l'étiquette">
                          {p.qteImprimee}
                        </span>
                      )}
                      <b title={p.qteImprimee !== p.qte ? "Quantité réelle corrigée par la coupe" : undefined}>{p.qte}</b>
                      <span className="ml-1 text-[10px] text-muted-foreground">
                        ({p.pieceDebut}–{p.pieceFin})
                      </span>
                      {peutRelever && p.statut === "actif" && (
                        <button
                          type="button"
                          disabled={pending}
                          title="Corriger la quantité réelle (tracé)"
                          className="ml-1 text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            const q = prompt(`Paquet ${p.numero} : quantité RÉELLE (imprimée : ${p.qteImprimee}) ?`, String(p.qte));
                            if (q == null || q.trim() === String(p.qte)) return;
                            const motif = prompt("Motif de la correction (obligatoire) :");
                            if (!motif?.trim()) return;
                            lancer(A.corrigerQuantitePaquet(p.id, q, motif), `Paquet ${p.numero} : ${q.trim()} pièces`);
                          }}
                        >
                          ✎
                        </button>
                      )}
                    </td>
                    {p.cases.map((c) => (
                      <td key={c.liasse} className="px-2 py-1.5 text-center">
                        <span
                          className={`inline-flex size-6 items-center justify-center rounded font-bold ${CASE[c.etat].classe}`}
                          title={
                            c.etat === "vide"
                              ? CASE.vide.titre
                              : c.etat === "en_cours"
                                ? `Dernier poste : ${c.poste} — ${c.ouvrier || c.par} le ${c.le} · ${c.nbPostes} poste(s) passé(s)`
                                : `${CASE[c.etat].titre} — ${c.le} par ${c.par}${c.note ? ` · ${c.note}` : ""}`
                          }
                        >
                          {c.etat === "en_cours" ? c.nbPostes : CASE[c.etat].texte}
                        </span>
                        {c.etat === "en_cours" && <div className="max-w-24 truncate text-[9.5px] text-muted-foreground">{c.poste}</div>}
                      </td>
                    ))}
                    {ancienReleve && (
                    <td className="px-2 py-1.5 text-center">
                      {p.chaine ? (
                        <span
                          className="text-[10.5px] font-semibold text-brand"
                          title={`Travaillé en chaîne sur ${p.chaine.heures} heure(s)${p.chaine.ouvrieres.length ? ` par ${p.chaine.ouvrieres.join(", ")}` : ""} — relevé dans la saisie horaire`}
                        >
                          {dateCourte(p.chaine.dernier)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/50" title="Aucun passage relevé dans la saisie horaire">
                          ·
                        </span>
                      )}
                    </td>
                    )}
                    <td className="px-2 py-1.5 text-center">
                      {!p.assemble && peutRelever && p.statut === "actif" ? (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => {
                            if (confirm(`Paquet ${p.numero} assemblé ?`)) lancer(A.relever({ code: p.code, etape: "assemble" }), `Paquet ${p.numero} assemblé`);
                          }}
                          className="rounded border px-1.5 py-0.5 text-[10.5px] font-semibold hover:bg-muted"
                        >
                          🧵 Assemblé
                        </button>
                      ) : (
                        <span
                          className={`inline-flex size-6 items-center justify-center rounded font-bold ${p.assemble ? CASE.fait.classe : CASE.vide.classe}`}
                          title={p.assemble ? `Assemblé le ${p.assembleLe} par ${p.assemblePar}` : CASE.vide.titre}
                        >
                          {p.assemble ? "✓" : "·"}
                        </span>
                      )}
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
        Une case grise « · » veut dire <b>sans nouvelle</b> : aucun poste n&apos;a encore fini ce morceau. Ce
        n&apos;est pas un retard, et rien n&apos;est bloqué. Une case bleue donne le <b>nombre de postes</b> déjà
        passés par le morceau, et le dernier : elle se remplit toute seule quand l&apos;agent scanne le paquet
        « fini au poste » dans la saisie horaire — rien n&apos;est saisi deux fois. Le paquet se marque assemblé par
        le bouton 🧵.
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
  /** Quantité réelle (corrigée le cas échéant). */
  qte: number;
  /** Quantité imprimée sur l'étiquette. */
  qteImprimee: number;
  pieceDebut: number;
  pieceFin: number;
  statut: string;
  cases: pq.CaseLiasse[];
  assemble: boolean;
  assembleLe: string;
  assemblePar: string;
  avancement: pq.EtatPaquet["avancement"];
  /** Passage de la chaîne, dérivé de la saisie horaire GPAO. */
  chaine: { dernier: string; heures: number; ouvrieres: string[] } | null;
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

/* ─────────── qui a fait ce paquet ─────────── */

function QuiAFait() {
  const [code, setCode] = useState("");
  const [pending, start] = useTransition();
  const [res, setRes] = useState<Awaited<ReturnType<typeof A.historique>> | null>(null);
  const chercher = () =>
    start(async () => {
      setRes(await A.historique(code));
    });
  return (
    <div className="mb-4 rounded-lg border bg-card p-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <b>🔎 Qui a fait ce paquet ?</b>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && chercher()}
          placeholder="Scannez l'étiquette ou tapez PQ-2026-000145"
          className="h-8 w-72 rounded-md border bg-background px-2 font-mono"
        />
        <Button size="sm" className="h-8" disabled={pending || !code.trim()} onClick={chercher}>
          Chercher
        </Button>
      </div>
      {res && !res.ok && <div className="mt-2 font-semibold text-[var(--danger-d)]">{res.error}</div>}
      {res && res.ok && (
        <div className="mt-2">
          <div className="mb-1 font-semibold">
            Paquet {res.paquet.numero} · {res.paquet.ofNumber}
            {res.paquet.couleur ? ` · ${res.paquet.couleur}` : ""} · T. {res.paquet.taille} · {res.paquet.qteEffective} pcs (pièces{" "}
            {res.paquet.pieceDebut}–{res.paquet.pieceFin})
          </div>
          {res.lignes.length === 0 ? (
            <div className="text-muted-foreground">Aucun passage enregistré pour l&apos;instant.</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b text-[10.5px] uppercase text-muted-foreground">
                  <th className="py-1 text-left">Date</th>
                  <th className="py-1 text-left">Morceau</th>
                  <th className="py-1 text-left">Quoi</th>
                  <th className="py-1 text-left">Ouvrière / par</th>
                  <th className="py-1 text-left">Chaîne · heure</th>
                </tr>
              </thead>
              <tbody>
                {res.lignes.map((l) => (
                  <tr key={l.id} className={`border-b last:border-0 ${l.annule ? "text-muted-foreground line-through" : ""}`}>
                    <td className="py-1">{l.date.split("-").reverse().join("/")}</td>
                    <td className="py-1">{l.liasse || "—"}</td>
                    <td className="py-1">
                      {l.etape === "poste"
                        ? `Fini au poste « ${l.poste} »`
                        : l.etape === "assemble"
                          ? "Assemblé"
                          : l.etape === "probleme"
                            ? `Problème : ${l.note}`
                            : l.etape === "correction"
                              ? `Quantité corrigée : ${l.note}`
                              : "Morceau fini (tournée)"}
                    </td>
                    <td className="py-1 font-semibold">{l.ouvrier || l.createdBy}</td>
                    <td className="py-1 text-muted-foreground">{[l.chaine, l.heure].filter(Boolean).join(" · ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

function FichesSansPaquets({ fiches, peutRegler }: { fiches: { id: number; numero: string; date: string }[]; peutRegler: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="mb-4 rounded-lg border border-info/40 bg-info/5 px-4 py-3 text-xs">
      <b>{fiches.length} fiche(s) de coupe validée(s) sans paquets</b> — validées avant l&apos;activation du suivi. Leurs paquets peuvent être créés maintenant
      (avec les morceaux du plan de coupe) :
      <div className="mt-2 flex flex-wrap gap-2">
        {fiches.slice(0, 12).map((f) => (
          <Button
            key={f.id}
            size="sm"
            variant="outline"
            className="h-7"
            disabled={pending || !peutRegler}
            title={peutRegler ? "Créer les paquets de cette fiche" : "Réservé au responsable de production"}
            onClick={() =>
              start(async () => {
                const r = await A.creerPaquetsApresCoup(f.id);
                if (!r.ok) return void toast.error(r.error);
                toast.success(`${f.numero} : ${r.n} paquet(s) créé(s)`);
                router.refresh();
              })
            }
          >
            {f.numero} · {f.date.split("-").reverse().join("/")}
          </Button>
        ))}
      </div>
    </div>
  );
}
