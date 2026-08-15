"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Users } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { SectionPanel } from "@/components/shared/section-panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GabaritButton } from "@/components/shared/gabarit-button";
import { STATUTS_PERSONNEL, estMatriculeProvisoire, type StatutPersonnel } from "@/lib/domain/atelier";
import type { OuvriereRow, PersonneRow } from "@/lib/services/atelier";
import * as A from "@/lib/actions/atelier";
import { BoutonAction, Kpi, SelectAction, Tuiles } from "../aval/ui";
import { ImportPersonnelButton, type ChaineChoix } from "./import-personnel";
import { Fusion, type NomSaisi } from "./fusion";

const dateFr = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split("-").reverse().join("/") : "—");

const OPTIONS_STATUT = (Object.keys(STATUTS_PERSONNEL) as StatutPersonnel[]).map((k) => ({
  value: k,
  label: STATUTS_PERSONNEL[k].label,
}));

type Onglet = "registre" | "rattachement" | "fusion";

/* Colonnes du gabarit d'import, reprises telles quelles de l'application
 * d'origine : les fichiers que l'atelier a déjà sous la main continuent de
 * passer sans être retouchés. */
const GABARIT_ENTETES = ["Matricule", "Nom", "Atelier", "Fonction", "DateEntree", "Statut", "Poste", "SAM"];
const GABARIT_EXEMPLES = [
  ["MAT001", "Exemple Prénom Nom", "Atelier 1", "Couturière", "2026-01-15", "active", "Assemblage manche", "120"],
  ["MAT002", "Autre Personne", "Atelier 1", "Repasseuse", "2026-02-01", "active", "Repassage", "90"],
];

export function PersonnelClient({
  personnes,
  ouvrieres,
  saisies,
  chaines,
  peutSaisir,
}: {
  personnes: PersonneRow[];
  ouvrieres: OuvriereRow[];
  saisies: NomSaisi[];
  chaines: ChaineChoix[];
  peutSaisir: boolean;
}) {
  const [onglet, setOnglet] = useState<Onglet>("registre");
  const [q, setQ] = useState("");
  const [statut, setStatut] = useState("");
  const [creation, setCreation] = useState(false);

  const filtrees = useMemo(() => {
    const n = q.trim().toLowerCase();
    return personnes.filter(
      (p) =>
        (!statut || p.statut === statut) &&
        (!n || `${p.matricule} ${p.nom} ${p.fonction} ${p.atelier}`.toLowerCase().includes(n)),
    );
  }, [personnes, q, statut]);

  const nonRattachees = ouvrieres.filter((o) => o.personnelId === null);
  /* Noms distincts saisis en atelier et encore reliés à aucune fiche : c'est
   * ce chiffre-là que l'assistant de fusion doit ramener à zéro. */
  const nomsOrphelins = saisies.filter((s) => !s.rattachee).length;
  const provisoires = personnes.filter((p) => estMatriculeProvisoire(p.matricule)).length;

  return (
    <>
      <PageHeader
        icon={Users}
        title="Personnel"
        description="Registre de l'atelier — matricules, fonctions et rattachement aux chaînes"
        actions={
          peutSaisir && (
            <>
              <GabaritButton nom="gabarit_personnel" entetes={GABARIT_ENTETES} exemples={GABARIT_EXEMPLES} />
              <ImportPersonnelButton chaines={chaines} />
              <Button size="sm" onClick={() => setCreation(true)}>
                + Nouvelle personne
              </Button>
            </>
          )
        }
      />

      <Tuiles>
        <Kpi label="Effectif inscrit" valeur={String(personnes.length)} />
        <Kpi
          label="En poste"
          valeur={String(personnes.filter((p) => p.statut === "active").length)}
          tone="success"
        />
        <Kpi
          label="Matricules provisoires"
          valeur={String(provisoires)}
          tone={provisoires ? "warning" : "neutral"}
          sub="créés depuis l'atelier — à compléter"
        />
        <Kpi
          label="Ouvrières non rattachées"
          valeur={String(nonRattachees.length)}
          tone={nonRattachees.length ? "danger" : "neutral"}
          sub="pas de QR de rendement"
        />
      </Tuiles>

      <div className="mb-3 flex gap-1.5">
        {(
          [
            ["registre", "Registre"],
            ["rattachement", `Rattachement chaînes${nonRattachees.length ? ` (${nonRattachees.length})` : ""}`],
            ["fusion", `Fusion des noms${nomsOrphelins ? ` (${nomsOrphelins})` : ""}`],
          ] as [Onglet, string][]
        ).map(([k, l]) => (
          <Button key={k} size="sm" variant={onglet === k ? "default" : "outline"} onClick={() => setOnglet(k)}>
            {l}
          </Button>
        ))}
      </div>

      {onglet === "registre" ? (
        <SectionPanel
          title={`${filtrees.length} personne(s)`}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Matricule, nom, fonction…"
                className="h-8 w-56 bg-card"
              />
              <select
                value={statut}
                onChange={(e) => setStatut(e.target.value)}
                className="h-8 rounded-md border border-input bg-card px-2 text-xs"
              >
                <option value="">Tous les statuts</option>
                {OPTIONS_STATUT.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          }
          flush
        >
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/40 text-[10.5px] uppercase text-muted-foreground">
                  <th className="px-3 py-2 text-left">Matricule</th>
                  <th className="px-3 py-2 text-left">Nom</th>
                  <th className="px-3 py-2 text-left">Fonction</th>
                  <th className="px-3 py-2 text-left">Atelier</th>
                  <th className="px-3 py-2 text-left">Chaînes</th>
                  <th className="px-3 py-2 text-left">Entrée</th>
                  <th className="px-3 py-2 text-left">Statut</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtrees.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-muted-foreground">
                      Aucune personne.
                    </td>
                  </tr>
                ) : (
                  filtrees.map((p) => (
                    <tr key={p.id} className="border-b last:border-0">
                      <td
                        className={`px-3 py-2 font-mono font-bold ${
                          estMatriculeProvisoire(p.matricule) ? "text-[var(--warning-d,#9a6510)]" : "text-brand"
                        }`}
                        title={
                          estMatriculeProvisoire(p.matricule)
                            ? "Matricule provisoire, attribué depuis l'atelier — à remplacer par le matricule de paie"
                            : undefined
                        }
                      >
                        {p.matricule}
                      </td>
                      <td className="px-3 py-2 font-semibold">
                        {peutSaisir ? (
                          <ChampTexte valeur={p.nom} onSave={(v) => A.majPersonne(p.id, { nom: v })} />
                        ) : (
                          p.nom
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {peutSaisir ? (
                          <ChampTexte
                            valeur={p.fonction}
                            placeholder="—"
                            onSave={(v) => A.majPersonne(p.id, { fonction: v })}
                          />
                        ) : (
                          p.fonction || "—"
                        )}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{p.atelier || "—"}</td>
                      <td className="px-3 py-2">
                        {p.chaines.length ? (
                          <span className="text-[11px]">{p.chaines.join(", ")}</span>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">non affectée</span>
                        )}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">{dateFr(p.dateEntree)}</td>
                      <td className="px-3 py-2">
                        {peutSaisir ? (
                          <SelectAction
                            valeur={p.statut}
                            options={OPTIONS_STATUT}
                            onSave={(v) => A.majPersonne(p.id, { statut: v })}
                          />
                        ) : (
                          <StatusBadge tone={STATUTS_PERSONNEL[p.statut as StatutPersonnel]?.tone ?? "neutral"}>
                            {STATUTS_PERSONNEL[p.statut as StatutPersonnel]?.label ?? p.statut}
                          </StatusBadge>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {peutSaisir && (
                          <div className="flex justify-end gap-1.5">
                            <BoutonAction
                              variant="ghost"
                              onRun={() => A.regenererCle(p.id)}
                              confirmer={`Regénérer la clé QR de ${p.nom} ? Les QR déjà imprimés cesseront de fonctionner.`}
                              succes="Nouvelle clé — réimprimez le QR"
                            >
                              🔑
                            </BoutonAction>
                            <BoutonAction
                              variant="ghost"
                              onRun={() => A.supprimerPersonne(p.id)}
                              confirmer={`Supprimer ${p.nom} du registre ?`}
                              succes="Personne supprimée"
                            >
                              🗑
                            </BoutonAction>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </SectionPanel>
      ) : onglet === "rattachement" ? (
        <Rattachement ouvrieres={ouvrieres} personnes={personnes} peutSaisir={peutSaisir} />
      ) : (
        <Fusion saisies={saisies} personnes={personnes} peutSaisir={peutSaisir} />
      )}

      {creation && <DialogPersonne onFermer={() => setCreation(false)} />}
    </>
  );
}

/* ─────────── rattachement ─────────── */

function Rattachement({
  ouvrieres,
  personnes,
  peutSaisir,
}: {
  ouvrieres: OuvriereRow[];
  personnes: PersonneRow[];
  peutSaisir: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const options = useMemo(
    () => [
      { value: "", label: "— non rattachée —" },
      ...personnes.map((p) => ({ value: String(p.id), label: `${p.matricule} · ${p.nom}` })),
    ],
    [personnes],
  );

  return (
    <SectionPanel
      title="Ouvrières de chaîne ↔ registre"
      actions={
        peutSaisir && (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await A.rattacherAuto();
                if (!r.ok) {
                  toast.error(r.error);
                  return;
                }
                toast.success(
                  r.data?.lies
                    ? `${r.data.lies} rattachement(s) — ${r.data.restants} restant(s) à faire à la main`
                    : "Aucun rapprochement certain trouvé",
                );
                router.refresh();
              })
            }
          >
            🔗 Rapprocher automatiquement
          </Button>
        )
      }
      flush
    >
      <p className="border-b bg-muted/30 px-4 py-2 text-[11px] text-muted-foreground">
        Le QR de rendement encode la clé de la personne, pas celle de l&apos;ouvrière : sans rattachement, pas de QR.
        Le rapprochement automatique ne relie que les noms strictement identiques une fois normalisés — un homonyme
        ou une orthographe différente reste à trancher ici.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-muted/40 text-[10.5px] uppercase text-muted-foreground">
              <th className="px-3 py-2 text-left">Chaîne</th>
              <th className="px-3 py-2 text-left">Ouvrière</th>
              <th className="px-3 py-2 text-left">Poste</th>
              <th className="px-3 py-2 text-right">SAM</th>
              <th className="px-3 py-2 text-left">Personne du registre</th>
            </tr>
          </thead>
          <tbody>
            {ouvrieres.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-10 text-center text-muted-foreground">
                  Aucune ouvrière déclarée sur les chaînes.
                </td>
              </tr>
            ) : (
              ouvrieres.map((o) => (
                <tr key={o.id} className={`border-b last:border-0 ${o.personnelId === null ? "bg-[var(--danger-l)]/40" : ""}`}>
                  <td className="px-3 py-2 text-muted-foreground">{o.chaineNom}</td>
                  <td className="px-3 py-2 font-semibold">{o.nom}</td>
                  <td className="px-3 py-2 text-muted-foreground">{o.poste || "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{o.sam} s</td>
                  <td className="px-3 py-2">
                    {peutSaisir ? (
                      <SelectAction
                        valeur={o.personnelId === null ? "" : String(o.personnelId)}
                        options={options}
                        onSave={(v) => A.rattacher(o.id, v ? Number(v) : null)}
                        className="max-w-64"
                      />
                    ) : o.matricule ? (
                      `${o.matricule} · rattachée`
                    ) : (
                      <StatusBadge tone="danger">Non rattachée</StatusBadge>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </SectionPanel>
  );
}

/* ─────────── saisie ─────────── */

function ChampTexte({
  valeur,
  onSave,
  placeholder,
}: {
  valeur: string;
  onSave: (v: string) => Promise<{ ok: boolean; error?: string }>;
  placeholder?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <input
      defaultValue={valeur}
      placeholder={placeholder}
      disabled={pending}
      className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 hover:border-input focus:border-ring focus:bg-card focus:outline-none disabled:opacity-60"
      onBlur={(e) => {
        const v = e.target.value;
        if (v === valeur) return;
        start(async () => {
          const r = await onSave(v);
          if (!r.ok) {
            toast.error(r.error ?? "Erreur");
            return;
          }
          router.refresh();
        });
      }}
    />
  );
}

function DialogPersonne({ onFermer }: { onFermer: () => void }) {
  const router = useRouter();
  const [matricule, setMatricule] = useState("");
  const [nom, setNom] = useState("");
  const [fonction, setFonction] = useState("");
  const [atelier, setAtelier] = useState("");
  const [dateEntree, setDateEntree] = useState("");
  const [pending, start] = useTransition();

  return (
    <Dialog open onOpenChange={(o) => !o && onFermer()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>👤 Nouvelle personne</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ["Matricule *", matricule, setMatricule, "text"],
              ["Nom complet *", nom, setNom, "text"],
              ["Fonction", fonction, setFonction, "text"],
              ["Atelier", atelier, setAtelier, "text"],
              ["Date d'entrée", dateEntree, setDateEntree, "date"],
            ] as [string, string, (v: string) => void, string][]
          ).map(([label, val, set, type]) => (
            <div key={label}>
              <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">{label}</label>
              <input
                type={type}
                value={val}
                onChange={(e) => set(e.target.value)}
                className="w-full rounded-md border border-input bg-card px-2 py-1.5 text-xs"
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFermer}>
            Annuler
          </Button>
          <Button
            disabled={pending || !matricule || !nom}
            onClick={() =>
              start(async () => {
                const r = await A.creerPersonne({ matricule, nom, fonction, atelier, dateEntree });
                if (!r.ok) {
                  toast.error(r.error);
                  return;
                }
                toast.success("Personne ajoutée");
                onFermer();
                router.refresh();
              })
            }
          >
            Ajouter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
