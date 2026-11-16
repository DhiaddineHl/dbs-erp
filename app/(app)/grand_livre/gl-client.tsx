"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Banknote, ChevronLeft, Download, Printer, Wallet } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { SectionPanel } from "@/components/shared/section-panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CATEGORIES_FOURNISSEUR,
  STATUT_SOLDE,
  echeancesAVenir,
  grandLivrePeriode,
  libelleMois,
  moisDe,
  statutSolde,
  toTND,
  urgenceEcheance,
} from "@/lib/domain/finance";
import type { CompteFournisseurRow } from "@/lib/services/finance";
import * as A from "@/lib/actions/finance";
import { cn } from "@/lib/utils";
import { SelecteurPeriode, usePeriode } from "@/components/shared/selecteur-periode";
import { anneesDisponibles, type Periode } from "@/lib/domain/periode";

/** Un compte lu SUR UNE PÉRIODE : mêmes champs que le compte complet (les
 * totaux, le solde et les mouvements sont ceux de la période), plus le solde
 * d'ouverture — le report à nouveau — et le nombre de mouvements postérieurs. */
type ComptePeriode = CompteFournisseurRow & { ouverture: number; ouvertureTND: number; apres: number };

function surPeriode(c: CompteFournisseurRow, p: Periode, taux: number): ComptePeriode {
  const g = grandLivrePeriode(c.transactions, p.du, p.au);
  const soldeTND = Math.round(toTND(g.fin, c.devise, taux) * 1000) / 1000;
  return {
    ...c,
    totalCredit: g.credit,
    totalDebit: g.debit,
    solde: g.fin,
    soldeTND,
    statut: statutSolde(soldeTND),
    nbTransactions: g.lignes.length,
    transactions: g.lignes,
    ouverture: g.ouverture,
    ouvertureTND: Math.round(toTND(g.ouverture, c.devise, taux) * 1000) / 1000,
    apres: g.apres,
  };
}

/** Les montants en dinar se lisent au millième. */
const mt = (n: number, devise: string) =>
  `${Math.abs(n) < 0.001 ? "0,000" : Math.abs(n).toLocaleString("fr-FR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ${devise === "EUR" ? "EUR" : "DT"}`;
const auj = () => new Date().toISOString().slice(0, 10);
const dateFr = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split("-").reverse().join("/") : iso || "—");

export function GrandLivreClient({
  comptes,
  taux,
  peutSaisir,
}: {
  comptes: CompteFournisseurRow[];
  taux: number;
  peutSaisir: boolean;
}) {
  const [vue, setVue] = useState<"liste" | "echeancier">("liste");
  const [selection, setSelection] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [categorie, setCategorie] = useState("");
  const [statut, setStatut] = useState("");

  /* La période s'applique aux comptes et à la fiche ; l'échéancier, lui,
   * montre toujours tout ce qui reste à payer. */
  const [periode, setPeriode] = usePeriode("grand-livre");
  const annees = useMemo(() => anneesDisponibles(comptes.flatMap((c) => c.transactions.map((t) => t.date))), [comptes]);
  const comptesP = useMemo(() => comptes.map((c) => surPeriode(c, periode, taux)), [comptes, periode, taux]);
  const courant = selection !== null ? comptesP.find((c) => c.id === selection) : null;

  const filtres = useMemo(() => {
    const n = q.trim().toLowerCase();
    return comptesP.filter(
      (c) =>
        (!n || c.nom.toLowerCase().includes(n)) &&
        (!categorie || c.categorie === categorie) &&
        (!statut || c.statut === statut),
    );
  }, [comptesP, q, categorie, statut]);

  const totaux = useMemo(() => {
    let du = 0;
    let avoir = 0;
    let soldes = 0;
    let ouverture = 0;
    let apres = 0;
    for (const c of filtres) {
      if (c.statut === "du") du += c.soldeTND;
      else if (c.statut === "avoir") avoir += Math.abs(c.soldeTND);
      else soldes++;
      ouverture += c.ouvertureTND;
      apres += c.apres;
    }
    return { du, avoir, soldes, nb: filtres.length, ouverture, apres };
  }, [filtres]);

  if (courant) {
    return (
      <FicheCompte
        compte={courant}
        periode={periode}
        onPeriode={setPeriode}
        annees={annees}
        taux={taux}
        peutSaisir={peutSaisir}
        onRetour={() => setSelection(null)}
      />
    );
  }

  return (
    <>
      <PageHeader
        icon={Banknote}
        title="Grand Livre Fournisseurs"
        description="Comptabilité fournisseurs — comptes, mouvements, soldes et échéancier"
        actions={<TauxEur taux={taux} peutSaisir={peutSaisir} />}
      />

      <SelecteurPeriode periode={periode} onChange={setPeriode} annees={annees} className="mb-3" />
      <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3">
        <Kpi label="Comptes suivis" valeur={String(totaux.nb)} />
        <Kpi
          label={`Report à nouveau${periode.du ? ` au ${dateFr(periode.du)}` : ""}`}
          valeur={mt(totaux.ouverture, "TND")}
          sub="solde net de tout ce qui précède la période"
        />
        <Kpi
          label={`Total dû${periode.au ? ` au ${dateFr(periode.au)}` : ""}`}
          valeur={mt(totaux.du, "TND")}
          tone="danger"
          sub={totaux.apres ? `taux EUR/TND : ${taux} · ${totaux.apres} mouvement(s) daté(s) après la période non comptés` : `taux EUR/TND : ${taux}`}
        />
        <Kpi label="Avoirs en notre faveur" valeur={mt(totaux.avoir, "TND")} tone="info" />
        <Kpi label="Comptes soldés" valeur={String(totaux.soldes)} tone="success" />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(
          [
            ["liste", "Comptes"],
            ["echeancier", "Échéancier"],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            onClick={() => setVue(k)}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors",
              vue === k ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent",
            )}
          >
            {l}
          </button>
        ))}
        {peutSaisir && vue === "liste" && <NouveauFournisseur />}
      </div>

      {vue === "echeancier" ? (
        <Echeancier comptes={comptes} taux={taux} />
      ) : (
        <SectionPanel
          title="Comptes fournisseurs"
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher…" className="h-8 w-48 bg-card" />
              <select
                value={categorie}
                onChange={(e) => setCategorie(e.target.value)}
                className="h-8 rounded-md border border-input bg-card px-2 text-xs"
              >
                <option value="">Toutes catégories</option>
                {CATEGORIES_FOURNISSEUR.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <select
                value={statut}
                onChange={(e) => setStatut(e.target.value)}
                className="h-8 rounded-md border border-input bg-card px-2 text-xs"
              >
                <option value="">Tous statuts</option>
                <option value="du">Dû</option>
                <option value="avoir">Avoir</option>
                <option value="zero">Soldé</option>
              </select>
              <BoutonCsv comptes={filtres} periode={periode} />
            </div>
          }
          flush
        >
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/40 text-[10.5px] uppercase text-muted-foreground">
                  <th className="px-3 py-2 text-left">Fournisseur</th>
                  <th className="px-3 py-2 text-left">Catégorie</th>
                  <th className="px-3 py-2 text-center">Devise</th>
                  <th className="px-3 py-2 text-center">Mouv.</th>
                  <th className="px-3 py-2 text-right" title="Solde de tout ce qui précède la période">Report à nouveau</th>
                  <th className="px-3 py-2 text-right">Crédit (facturé)</th>
                  <th className="px-3 py-2 text-right">Débit (réglé)</th>
                  <th className="px-3 py-2 text-right">Solde fin</th>
                  <th className="px-3 py-2 text-right">Solde TND</th>
                  <th className="px-3 py-2 text-left">Statut</th>
                </tr>
              </thead>
              <tbody>
                {filtres.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-10 text-center text-muted-foreground">
                      Aucun compte fournisseur.
                    </td>
                  </tr>
                ) : (
                  filtres.map((c) => {
                    const s = STATUT_SOLDE[c.statut];
                    return (
                      <tr
                        key={c.id}
                        className="cursor-pointer border-b hover:bg-accent/50"
                        onClick={() => setSelection(c.id)}
                      >
                        <td className="px-3 py-2 font-semibold">{c.nom}</td>
                        <td className="px-3 py-2 text-muted-foreground">{c.categorie}</td>
                        <td className="px-3 py-2 text-center">{c.devise}</td>
                        <td className="px-3 py-2 text-center tabular-nums">{c.nbTransactions}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{mt(c.ouverture, c.devise)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{mt(c.totalCredit, c.devise)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{mt(c.totalDebit, c.devise)}</td>
                        <td
                          className={cn(
                            "px-3 py-2 text-right font-bold tabular-nums",
                            c.statut === "du" && "text-[var(--danger-d)]",
                            c.statut === "avoir" && "text-info",
                          )}
                        >
                          {mt(c.solde, c.devise)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                          {c.devise === "EUR" ? mt(c.soldeTND, "TND") : "—"}
                        </td>
                        <td className="px-3 py-2">
                          <StatusBadge tone={s.tone}>{s.label}</StatusBadge>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </SectionPanel>
      )}
    </>
  );
}

/* ─────────── fiche d'un compte ─────────── */

function FicheCompte({
  compte,
  periode,
  onPeriode,
  annees,
  taux,
  peutSaisir,
  onRetour,
}: {
  compte: ComptePeriode;
  periode: Periode;
  onPeriode: (cle: string) => void;
  annees: number[];
  taux: number;
  peutSaisir: boolean;
  onRetour: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [date, setDate] = useState(auj());
  const [libelle, setLibelle] = useState("");
  const [debit, setDebit] = useState("");
  const [credit, setCredit] = useState("");
  const s = STATUT_SOLDE[compte.statut];

  const ajouter = () =>
    start(async () => {
      const r = await A.ajouterTransaction({ compteId: compte.id, date, libelle, debit, credit });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setLibelle("");
      setDebit("");
      setCredit("");
      toast.success("Mouvement enregistré");
      router.refresh();
    });

  return (
    <>
      <PageHeader
        icon={Wallet}
        title={compte.nom}
        description={`${compte.categorie} · devise ${compte.devise}${compte.devise === "EUR" ? ` · taux ${taux}` : ""}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={onRetour}>
              <ChevronLeft className="size-3.5" /> Tous les comptes
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="size-3.5" /> Imprimer
            </Button>
          </div>
        }
      />

      <SelecteurPeriode periode={periode} onChange={onPeriode} annees={annees} className="mb-3" />
      <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3">
        <Kpi
          label={`Report à nouveau${periode.du ? ` au ${dateFr(periode.du)}` : ""}`}
          valeur={mt(compte.ouverture, compte.devise)}
          sub="solde de tout ce qui précède la période"
        />
        <Kpi label="Facturé sur la période (crédit)" valeur={mt(compte.totalCredit, compte.devise)} />
        <Kpi label="Réglé sur la période (débit)" valeur={mt(compte.totalDebit, compte.devise)} tone="success" />
        <Kpi
          label={`Solde${periode.au ? ` au ${dateFr(periode.au)}` : ""}`}
          valeur={mt(compte.solde, compte.devise)}
          tone={compte.statut === "du" ? "danger" : compte.statut === "avoir" ? "info" : "success"}
          sub={compte.devise === "EUR" ? `≈ ${mt(compte.soldeTND, "TND")}` : undefined}
        />
        <Kpi label="Statut" valeur={s.label} tone={s.tone === "danger" ? "danger" : s.tone === "info" ? "info" : "success"} />
      </div>

      {peutSaisir && (
        <SectionPanel title="Nouveau mouvement">
          <div className="grid gap-3 sm:grid-cols-[auto_1fr_auto_auto_auto]">
            <Champ label="Date">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="rounded-md border border-input bg-card px-2 py-1 text-xs"
              />
            </Champ>
            <Champ label="Libellé">
              <input
                value={libelle}
                onChange={(e) => setLibelle(e.target.value)}
                placeholder="N° de facture, référence de règlement…"
                className="w-full rounded-md border border-input bg-card px-2 py-1 text-xs"
              />
            </Champ>
            <Champ label="Débit (réglé)">
              <input
                type="number"
                step="0.001"
                value={debit}
                onChange={(e) => setDebit(e.target.value)}
                className="w-32 rounded-md border border-input bg-card px-2 py-1 text-right text-xs"
              />
            </Champ>
            <Champ label="Crédit (facturé)">
              <input
                type="number"
                step="0.001"
                value={credit}
                onChange={(e) => setCredit(e.target.value)}
                className="w-32 rounded-md border border-input bg-card px-2 py-1 text-right text-xs"
              />
            </Champ>
            <div className="flex items-end">
              <Button size="sm" disabled={pending} onClick={ajouter}>
                Ajouter
              </Button>
            </div>
          </div>
        </SectionPanel>
      )}

      <SectionPanel
        title={`Mouvements — ${periode.label} (${compte.transactions.length})${compte.apres ? ` · ${compte.apres} après la période` : ""}`}
        flush
      >
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/40 text-[10.5px] uppercase text-muted-foreground">
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Libellé</th>
                <th className="px-3 py-2 text-right">Débit</th>
                <th className="px-3 py-2 text-right">Crédit</th>
                <th className="px-3 py-2 text-right">Solde cumulé</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {periode.du && (
                <tr className="border-b bg-muted/20 italic">
                  <td className="px-3 py-1.5 whitespace-nowrap">{dateFr(periode.du)}</td>
                  <td className="px-3 py-1.5 font-semibold">Report à nouveau (solde au {dateFr(periode.du)})</td>
                  <td className="px-3 py-1.5" />
                  <td className="px-3 py-1.5" />
                  <td className="px-3 py-1.5 text-right font-semibold tabular-nums">{mt(compte.ouverture, compte.devise)}</td>
                  <td />
                </tr>
              )}
              {compte.transactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-muted-foreground">
                    Aucun mouvement sur la période.
                  </td>
                </tr>
              ) : (
                compte.transactions.map((t) => (
                  <tr key={t.id} className="border-b last:border-0">
                    <td className="px-3 py-1.5 whitespace-nowrap">{dateFr(t.date)}</td>
                    <td className="px-3 py-1.5">{t.libelle || "—"}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-success-foreground">
                      {t.debit ? mt(t.debit, compte.devise) : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-[var(--danger-d)]">
                      {t.credit ? mt(t.credit, compte.devise) : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-right font-semibold tabular-nums">
                      {mt(t.soldeCumule, compte.devise)}
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      {peutSaisir && (
                        <button
                          className="text-muted-foreground hover:text-[var(--danger-d)]"
                          onClick={async () => {
                            if (!confirm("Supprimer ce mouvement ?")) return;
                            const r = await A.supprimerTransaction(t.id);
                            if (!r.ok) toast.error(r.error);
                            else {
                              toast.success("Mouvement supprimé");
                              router.refresh();
                            }
                          }}
                        >
                          ×
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {(compte.transactions.length > 0 || compte.ouverture !== 0) && (
              <tfoot>
                <tr className="border-t-2 bg-muted/40 font-bold">
                  <td className="px-3 py-2" colSpan={2}>
                    TOTAUX DE LA PÉRIODE · SOLDE FIN
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{mt(compte.totalDebit, compte.devise)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{mt(compte.totalCredit, compte.devise)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{mt(compte.solde, compte.devise)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </SectionPanel>
    </>
  );
}

/* ─────────── échéancier ─────────── */

function Echeancier({ comptes, taux }: { comptes: CompteFournisseurRow[]; taux: number }) {
  const aujourdhui = auj();

  const parMois = useMemo(() => {
    const items = comptes.flatMap((c) =>
      echeancesAVenir(c.transactions, aujourdhui).map((t) => ({
        date: t.date,
        fournisseur: c.nom,
        devise: c.devise,
        libelle: t.libelle,
        montant: t.debit,
        montantTND: toTND(t.debit, c.devise, taux),
      })),
    );
    const m = new Map<string, typeof items>();
    for (const it of items) {
      const cle = moisDe(it.date);
      const g = m.get(cle);
      if (g) g.push(it);
      else m.set(cle, [it]);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [comptes, taux, aujourdhui]);

  const total = parMois.reduce((s, [, items]) => s + items.reduce((x, i) => x + i.montantTND, 0), 0);

  if (parMois.length === 0) {
    return (
      <SectionPanel title="Échéancier">
        <div className="py-6 text-center text-xs text-muted-foreground">
          Aucune échéance à venir. Les règlements datés dans le futur apparaissent ici.
        </div>
      </SectionPanel>
    );
  }

  return (
    <>
      <div className="mb-3 rounded-xl border bg-card px-4 py-3 text-xs">
        <b>{mt(total, "TND")}</b> d&apos;échéances à venir, réparties sur {parMois.length} mois.
      </div>
      {parMois.map(([cle, items]) => {
        const totalMois = items.reduce((s, i) => s + i.montantTND, 0);
        return (
          <SectionPanel
            key={cle}
            title={libelleMois(cle)}
            actions={<StatusBadge tone="brand">{mt(totalMois, "TND")}</StatusBadge>}
            flush
          >
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/40 text-[10.5px] uppercase text-muted-foreground">
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Fournisseur</th>
                  <th className="px-3 py-2 text-left">Libellé</th>
                  <th className="px-3 py-2 text-right">Montant</th>
                  <th className="px-3 py-2 text-right">En TND</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, k) => {
                  const u = urgenceEcheance(it.date);
                  return (
                    <tr key={`${it.date}-${k}`} className="border-b last:border-0">
                      <td className="px-3 py-1.5 whitespace-nowrap">
                        {dateFr(it.date)}{" "}
                        <StatusBadge tone={u.tone}>
                          {u.jours === 0 ? "aujourd’hui" : `J+${u.jours}`}
                        </StatusBadge>
                      </td>
                      <td className="px-3 py-1.5 font-semibold">{it.fournisseur}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">{it.libelle || "—"}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{mt(it.montant, it.devise)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{mt(it.montantTND, "TND")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </SectionPanel>
        );
      })}
    </>
  );
}

/* ─────────── éléments ─────────── */

function Kpi({
  label,
  valeur,
  tone = "brand",
  sub,
}: {
  label: string;
  valeur: string;
  tone?: "brand" | "success" | "danger" | "info";
  sub?: string;
}) {
  const couleur = {
    brand: "text-brand",
    success: "text-success-foreground",
    danger: "text-[var(--danger-d)]",
    info: "text-info",
  }[tone];
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-xl font-bold tabular-nums", couleur)}>{valeur}</div>
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Champ({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function TauxEur({ taux, peutSaisir }: { taux: number; peutSaisir: boolean }) {
  const router = useRouter();
  const [v, setV] = useState(String(taux));
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center gap-2 text-xs">
      <label className="font-semibold text-muted-foreground">Taux EUR / TND</label>
      <input
        type="number"
        step="0.001"
        value={v}
        disabled={!peutSaisir || pending}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => {
          if (Number(v) === taux) return;
          start(async () => {
            const r = await A.definirTauxEur(v);
            if (!r.ok) {
              toast.error(r.error);
              setV(String(taux));
              return;
            }
            toast.success("Taux mis à jour");
            router.refresh();
          });
        }}
        className="w-24 rounded-md border border-input bg-card px-2 py-1 text-right"
      />
    </div>
  );
}

function NouveauFournisseur() {
  const router = useRouter();
  const [nom, setNom] = useState("");
  const [categorie, setCategorie] = useState<string>(CATEGORIES_FOURNISSEUR[0]);
  const [devise, setDevise] = useState("TND");
  const [pending, start] = useTransition();

  return (
    <div className="ml-auto flex flex-wrap items-center gap-2">
      <Input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nouveau fournisseur…" className="h-8 w-52 bg-card" />
      <select
        value={categorie}
        onChange={(e) => setCategorie(e.target.value)}
        className="h-8 rounded-md border border-input bg-card px-2 text-xs"
      >
        {CATEGORIES_FOURNISSEUR.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <select
        value={devise}
        onChange={(e) => setDevise(e.target.value)}
        className="h-8 rounded-md border border-input bg-card px-2 text-xs"
      >
        <option value="TND">TND</option>
        <option value="EUR">EUR</option>
      </select>
      <Button
        size="sm"
        disabled={pending || !nom.trim()}
        onClick={() =>
          start(async () => {
            const r = await A.creerCompteFournisseur({ nom, categorie, devise });
            if (!r.ok) {
              toast.error(r.error);
              return;
            }
            setNom("");
            toast.success("Fournisseur créé");
            router.refresh();
          })
        }
      >
        + Créer
      </Button>
    </div>
  );
}

function BoutonCsv({ comptes, periode }: { comptes: ComptePeriode[]; periode: Periode }) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        const entete = ["Fournisseur", "Catégorie", "Devise", "Report à nouveau", "Crédit", "Débit", "Solde fin", "Solde fin TND", "Statut"];
        const lignes = comptes.map((c) =>
          [c.nom, c.categorie, c.devise, c.ouverture, c.totalCredit, c.totalDebit, c.solde, c.soldeTND, STATUT_SOLDE[c.statut].label]
            .map((v) => `"${String(v).replace(/"/g, '""')}"`)
            .join(";"),
        );
        // BOM pour qu'Excel en français reconnaisse l'UTF-8.
        const titre = `"Grand livre fournisseurs — ${periode.label}"`;
        const blob = new Blob(["﻿" + [titre, entete.join(";"), ...lignes].join("\r\n")], {
          type: "text/csv;charset=utf-8",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `grand-livre-fournisseurs-${periode.court.replace(/[^\w-]+/g, "-")}-${auj()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      }}
    >
      <Download className="size-3.5" /> CSV
    </Button>
  );
}
