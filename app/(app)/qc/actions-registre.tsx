"use client";

import { Fragment, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionPanel } from "@/components/shared/section-panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { STATUTS_ACTION, actionOuverte } from "@/lib/domain/qc";
import {
  CAUSES_5M,
  FILTRE_DEFAUT,
  ORIGINES_ACTION,
  PRIORITES,
  enRetard,
  filtrerActions,
  origineAction,
  syntheseActions,
  trierActions,
  type FiltreActions,
  type OrigineAction,
} from "@/lib/domain/actions-qualite";
import type { ActionRegistreRow, ActionRow } from "@/lib/services/qc";
import * as A from "@/lib/actions/qc";
import { BoutonAction, ChampAction, SelectAction, compresser } from "./primitives";
import type { CommandeChoix } from "./editeur";

const dateFr = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split("-").reverse().join("/") : iso || "—");
const aujourdhui = () => new Date().toISOString().slice(0, 10);

/* ─────────── Onglet « Actions & QRQC » ───────────
 *
 * Le registre unique : actions nées d'un contrôle, problèmes terrain (QRQC,
 * analyse 5M) et plans d'actions. Remplace les anciens écrans « QRQC / 5M »
 * et « Plans d'actions », qui étaient des tableaux libres sans lien avec les
 * commandes ni les contrôles. */
export function ActionsRegistre({
  actions,
  commandes,
  peutSaisir,
  origineInitiale,
  onOuvrirInspection,
}: {
  actions: ActionRegistreRow[];
  commandes: CommandeChoix[];
  peutSaisir: boolean;
  origineInitiale: "" | OrigineAction;
  onOuvrirInspection: (id: number) => void;
}) {
  const [filtre, setFiltre] = useState<FiltreActions>({ ...FILTRE_DEFAUT, origine: origineInitiale });
  const [ouverte, setOuverte] = useState<number | null>(null);
  const [creation, setCreation] = useState(false);
  const jour = aujourdhui();

  const synthese = useMemo(() => syntheseActions(actions, jour), [actions, jour]);
  const visibles = useMemo(() => {
    const avecTexte = actions.map((a) => ({
      ...a,
      texte: `${a.defaut} ${a.cause} ${a.action} ${a.responsable} ${a.of} ${a.client} ${a.modele} ${a.inspection}`,
    }));
    return trierActions(filtrerActions(avecTexte, filtre, jour), jour);
  }, [actions, filtre, jour]);

  const maj = (p: Partial<FiltreActions>) => setFiltre((f) => ({ ...f, ...p }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
        <Tuile label="Actions ouvertes" valeur={synthese.ouvertes} tone={synthese.ouvertes ? "warning" : "success"} onClick={() => maj({ etat: "ouvertes", origine: "" })} />
        <Tuile label="En retard" valeur={synthese.enRetard} tone={synthese.enRetard ? "danger" : "success"} onClick={() => maj({ etat: "retard", origine: "" })} />
        <Tuile
          label="QRQC ouverts"
          valeur={synthese.parOrigine.qrqc}
          tone={synthese.parOrigine.qrqc ? "danger" : "success"}
          onClick={() => maj({ etat: "ouvertes", origine: "qrqc" })}
        />
        <Tuile
          label="Sans responsable ou échéance"
          valeur={synthese.sansPilote}
          tone={synthese.sansPilote ? "warning" : "success"}
          aide="Une action sans pilote ni date n'avance pas"
        />
      </div>

      {synthese.parCause.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="font-semibold text-muted-foreground">Causes 5M des actions ouvertes :</span>
          {synthese.parCause.map((c) => (
            <button
              key={c.cause}
              onClick={() => maj({ cause: filtre.cause === c.cause ? "" : c.cause, etat: "ouvertes" })}
              className={`rounded-full border px-2.5 py-0.5 font-semibold ${
                filtre.cause === c.cause ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent"
              }`}
            >
              {c.cause} <span className="opacity-70">{c.n}</span>
            </button>
          ))}
        </div>
      )}

      {creation && peutSaisir && (
        <NouvelleAction
          commandes={commandes}
          origine={filtre.origine === "plan" ? "plan" : "qrqc"}
          onFermer={() => setCreation(false)}
          onCree={(id) => {
            setCreation(false);
            setFiltre({ ...FILTRE_DEFAUT });
            setOuverte(id);
          }}
        />
      )}

      <SectionPanel
        title={`Actions qualité (${visibles.length})`}
        flush
        actions={
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                ["ouvertes", "Ouvertes"],
                ["retard", "En retard"],
                ["closes", "Vérifiées / clôturées"],
                ["toutes", "Toutes"],
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                onClick={() => maj({ etat: k })}
                className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                  filtre.etat === k ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
                }`}
              >
                {l}
              </button>
            ))}
            <select
              value={filtre.origine}
              onChange={(e) => maj({ origine: e.target.value as FiltreActions["origine"] })}
              className="h-8 rounded-md border bg-card px-2 text-xs"
            >
              <option value="">Toutes origines</option>
              {ORIGINES_ACTION.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <select value={filtre.cause} onChange={(e) => maj({ cause: e.target.value })} className="h-8 rounded-md border bg-card px-2 text-xs">
              <option value="">Toutes causes 5M</option>
              {CAUSES_5M.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <Input
              value={filtre.q}
              onChange={(e) => maj({ q: e.target.value })}
              placeholder="OF, problème, responsable…"
              className="h-8 w-52 bg-card"
            />
            {peutSaisir && !creation && (
              <Button size="sm" onClick={() => setCreation(true)}>
                + Nouvelle action
              </Button>
            )}
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/40 text-[10.5px] uppercase text-muted-foreground">
                <th className="w-6" />
                <th className="px-2 py-2 text-left">Origine</th>
                <th className="px-2 py-2 text-left">Ouverte</th>
                <th className="px-2 py-2 text-left">OF / Client</th>
                <th className="px-2 py-2 text-left">Problème</th>
                <th className="px-2 py-2 text-left">5M</th>
                <th className="px-2 py-2 text-left">Action décidée</th>
                <th className="px-2 py-2 text-left">Responsable</th>
                <th className="px-2 py-2 text-left">Échéance</th>
                <th className="px-2 py-2 text-left">Statut</th>
              </tr>
            </thead>
            <tbody>
              {visibles.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-10 text-center text-muted-foreground">
                    {actions.length === 0
                      ? "Aucune action qualité pour l'instant. Un lot refusé au contrôle en ouvre une automatiquement."
                      : "Aucune action ne correspond à ces filtres."}
                  </td>
                </tr>
              ) : (
                visibles.map((a) => {
                  const o = origineAction(a.origine);
                  const st = STATUTS_ACTION.find((s) => s.value === a.statut);
                  const retard = enRetard(a, jour);
                  const prio = PRIORITES.find((p) => p.value === a.priorite);
                  const deplie = ouverte === a.id;
                  return (
                    <Fragment key={a.id}>
                      <tr
                        className={`cursor-pointer border-b hover:bg-accent/50 ${retard ? "bg-[var(--danger-l)]/40" : ""} ${
                          actionOuverte(a.statut) ? "" : "text-muted-foreground"
                        }`}
                        onClick={() => setOuverte(deplie ? null : a.id)}
                      >
                        <td className="pl-2">{deplie ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}</td>
                        <td className="px-2 py-2">
                          <StatusBadge tone={o.tone}>{o.court}</StatusBadge>
                          {prio && prio.value === "haute" && <div className="mt-0.5 text-[10px] font-bold text-[var(--danger-d)]">▲ haute</div>}
                        </td>
                        <td className="px-2 py-2 tabular-nums">{dateFr(a.dateOuverture)}</td>
                        <td className="px-2 py-2">
                          <b>{a.of || "—"}</b>
                          <div className="text-[10px] text-muted-foreground">{[a.client, a.modele].filter(Boolean).join(" · ")}</div>
                          {a.inspectionId && (
                            <button
                              className="text-[10px] font-semibold text-brand underline"
                              onClick={(e) => {
                                e.stopPropagation();
                                onOuvrirInspection(a.inspectionId!);
                              }}
                            >
                              {a.inspection}
                            </button>
                          )}
                        </td>
                        <td className="max-w-[260px] px-2 py-2">
                          <div className="line-clamp-2">{a.defaut || "—"}</div>
                        </td>
                        <td className="px-2 py-2">{a.cause5m || "—"}</td>
                        <td className="max-w-[240px] px-2 py-2">
                          <div className="line-clamp-2">{a.action || <span className="text-[var(--warn)]">à décider</span>}</div>
                        </td>
                        <td className="px-2 py-2">{a.responsable || <span className="text-[var(--warn)]">—</span>}</td>
                        <td className={`px-2 py-2 tabular-nums ${retard ? "font-bold text-[var(--danger-d)]" : ""}`}>
                          {a.echeance ? dateFr(a.echeance) : "—"}
                          {retard && <div className="text-[10px]">en retard</div>}
                        </td>
                        <td className="px-2 py-2">
                          <StatusBadge tone={st?.tone ?? "neutral"}>{st?.label ?? a.statut}</StatusBadge>
                        </td>
                      </tr>
                      {deplie && (
                        <tr className="border-b bg-muted/20">
                          <td colSpan={10} className="p-3">
                            <CarteAction action={a} commandes={commandes} peutSaisir={peutSaisir} registre />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </SectionPanel>
    </div>
  );
}

function Tuile({
  label,
  valeur,
  tone,
  aide,
  onClick,
}: {
  label: string;
  valeur: number;
  tone: "warning" | "danger" | "success";
  aide?: string;
  onClick?: () => void;
}) {
  const couleur = { warning: "text-warning-foreground", danger: "text-[var(--danger-d)]", success: "text-success-foreground" }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      title={aide}
      className="rounded-xl border bg-card px-4 py-3 text-left enabled:hover:bg-accent/40"
    >
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${couleur}`}>{valeur}</div>
    </button>
  );
}

/* ─── Nouvelle action hors contrôle (QRQC ou plan d'actions) ─── */
function NouvelleAction({
  commandes,
  origine: origineInitiale,
  onFermer,
  onCree,
}: {
  commandes: CommandeChoix[];
  origine: "qrqc" | "plan";
  onFermer: () => void;
  onCree: (id: number) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [v, setV] = useState({
    origine: origineInitiale,
    defaut: "",
    cause5m: "",
    action: "",
    responsable: "",
    echeance: "",
    priorite: "",
    commandeId: "",
  });
  const set = (p: Partial<typeof v>) => setV((x) => ({ ...x, ...p }));
  const qrqc = v.origine === "qrqc";

  return (
    <SectionPanel title="Nouvelle action qualité">
      <div className="mb-3 flex gap-1.5">
        {(
          [
            ["qrqc", "🚨 Problème terrain (QRQC)"],
            ["plan", "📋 Action d'amélioration (plan)"],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            type="button"
            onClick={() => set({ origine: k })}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              v.origine === k ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >
            {l}
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Bloc label={qrqc ? "Problème constaté" : "Sujet / constat"}>
          <textarea
            rows={2}
            value={v.defaut}
            onChange={(e) => set({ defaut: e.target.value })}
            placeholder={qrqc ? "Ex. coutures décalées sur col, chaîne 2" : "Ex. réétalonner la boutonnière"}
            className="w-full rounded-md border bg-card px-2 py-1 text-xs"
          />
        </Bloc>
        <Bloc label="Action décidée">
          <textarea
            rows={2}
            value={v.action}
            onChange={(e) => set({ action: e.target.value })}
            placeholder="Qui fait quoi"
            className="w-full rounded-md border bg-card px-2 py-1 text-xs"
          />
        </Bloc>
        <div className="grid grid-cols-2 gap-2">
          <Bloc label="Cause (5M)">
            <select value={v.cause5m} onChange={(e) => set({ cause5m: e.target.value })} className="h-8 w-full rounded-md border bg-card px-2 text-xs">
              <option value="">—</option>
              {CAUSES_5M.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Bloc>
          <Bloc label="Priorité">
            <select value={v.priorite} onChange={(e) => set({ priorite: e.target.value })} className="h-8 w-full rounded-md border bg-card px-2 text-xs">
              <option value="">—</option>
              {PRIORITES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </Bloc>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Bloc label="Responsable">
            <Input value={v.responsable} onChange={(e) => set({ responsable: e.target.value })} className="h-8 bg-card text-xs" />
          </Bloc>
          <Bloc label="Échéance">
            <Input type="date" value={v.echeance} onChange={(e) => set({ echeance: e.target.value })} className="h-8 bg-card text-xs" />
          </Bloc>
        </div>
        <Bloc label="Commande concernée (facultatif)">
          <select value={v.commandeId} onChange={(e) => set({ commandeId: e.target.value })} className="h-8 w-full rounded-md border bg-card px-2 text-xs">
            <option value="">— aucune —</option>
            {commandes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.of} · {c.modele} {c.client ? `(${c.client})` : ""}
              </option>
            ))}
          </select>
        </Bloc>
      </div>
      <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await A.creerActionLibre({
                origine: v.origine,
                defaut: v.defaut,
                cause5m: v.cause5m,
                action: v.action,
                responsable: v.responsable,
                echeance: v.echeance,
                priorite: v.priorite,
                commandeId: v.commandeId ? Number(v.commandeId) : null,
              });
              if (!r.ok) {
                toast.error(r.error);
                return;
              }
              toast.success("Action enregistrée");
              router.refresh();
              if (r.data) onCree(r.data);
            })
          }
        >
          Enregistrer
        </Button>
        <Button size="sm" variant="ghost" onClick={onFermer}>
          Annuler
        </Button>
      </div>
    </SectionPanel>
  );
}

function Bloc({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-bold uppercase text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

/* ─── Action : une carte éditable, avec photos avant/après ───
 *
 * La même carte sert dans l'inspection et dans le registre. Modifiable même
 * après clôture de l'inspection (c'est un suivi). Statuts : à traiter → en
 * cours → corrigé → vérifié → clôturé. */
export function CarteAction({
  action: a,
  commandes,
  peutSaisir = true,
  registre = false,
}: {
  action: ActionRow;
  commandes?: CommandeChoix[];
  peutSaisir?: boolean;
  /** Dans le registre : origine et commande modifiables (hors contrôle). */
  registre?: boolean;
}) {
  const st = STATUTS_ACTION.find((s) => s.value === a.statut);
  const fige = !peutSaisir;
  // Cause 5M héritée d'une valeur hors liste : on la garde visible.
  const options5m = [{ value: "", label: "—" }, ...CAUSES_5M.map((c) => ({ value: c, label: c }))];
  if (a.cause5m && !CAUSES_5M.includes(a.cause5m as (typeof CAUSES_5M)[number])) options5m.push({ value: a.cause5m, label: a.cause5m });
  const libre = registre && a.origine !== "qc";

  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <StatusBadge tone={st?.tone ?? "neutral"}>{st?.label ?? a.statut}</StatusBadge>
        {registre && <StatusBadge tone={origineAction(a.origine).tone}>{origineAction(a.origine).label}</StatusBadge>}
        <div className="ml-auto flex items-center gap-2">
          <div className="w-40">
            <SelectAction
              valeur={a.statut}
              fige={fige}
              options={STATUTS_ACTION.map((s) => ({ value: s.value, label: s.label }))}
              onSave={(x) => A.majAction(a.id, "statut", x)}
            />
          </div>
          {peutSaisir && (
            <BoutonAction variant="ghost" confirmer="Supprimer cette action ?" onRun={() => A.supprimerAction(a.id)}>
              <Trash2 className="size-3.5" />
            </BoutonAction>
          )}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Bloc label="Problème / défaut constaté">
          <ChampAction valeur={a.defaut} fige={fige} placeholder="Défaut…" onSave={(x) => A.majAction(a.id, "defaut", x)} />
        </Bloc>
        <div className="grid grid-cols-[140px_1fr] gap-2">
          <Bloc label="Cause 5M">
            <SelectAction valeur={a.cause5m} fige={fige} options={options5m} onSave={(x) => A.majAction(a.id, "cause5m", x)} />
          </Bloc>
          <Bloc label="Cause racine (analyse)">
            <ChampAction valeur={a.cause} fige={fige} placeholder="Pourquoi ?…" onSave={(x) => A.majAction(a.id, "cause", x)} />
          </Bloc>
        </div>
        <Bloc label="Action décidée">
          <ChampAction valeur={a.action} fige={fige} placeholder="Action décidée…" onSave={(x) => A.majAction(a.id, "action", x)} />
        </Bloc>
        <div className="grid grid-cols-3 gap-2">
          <Bloc label="Responsable">
            <ChampAction valeur={a.responsable} fige={fige} placeholder="Nom…" onSave={(x) => A.majAction(a.id, "responsable", x)} />
          </Bloc>
          <Bloc label="Échéance">
            <ChampAction valeur={a.echeance} fige={fige} type="date" onSave={(x) => A.majAction(a.id, "echeance", x)} />
          </Bloc>
          <Bloc label="Priorité">
            <SelectAction
              valeur={a.priorite}
              fige={fige}
              options={[{ value: "", label: "—" }, ...PRIORITES.map((p) => ({ value: p.value, label: p.label }))]}
              onSave={(x) => A.majAction(a.id, "priorite", x)}
            />
          </Bloc>
        </div>
        {libre && commandes && (
          <div className="grid grid-cols-2 gap-2">
            <Bloc label="Type">
              <SelectAction
                valeur={a.origine}
                fige={fige}
                options={ORIGINES_ACTION.filter((o) => o.value !== "qc").map((o) => ({ value: o.value, label: o.label }))}
                onSave={(x) => A.majAction(a.id, "origine", x)}
              />
            </Bloc>
            <Bloc label="Commande">
              <SelectAction
                valeur={a.commandeId ? String(a.commandeId) : ""}
                fige={fige}
                options={[
                  { value: "", label: a.of && !a.commandeId ? `${a.of} (hors carnet)` : "— aucune —" },
                  ...commandes.map((c) => ({ value: String(c.id), label: `${c.of} · ${c.modele}` })),
                ]}
                onSave={(x) => A.majAction(a.id, "commandeId", x)}
              />
            </Bloc>
          </div>
        )}
        {(registre || a.note) && (
          <Bloc label="Note / suivi">
            <ChampAction valeur={a.note} fige={fige} placeholder="Point d'avancement, vérification…" onSave={(x) => A.majAction(a.id, "note", x)} />
          </Bloc>
        )}
      </div>

      <div className="mt-2 grid grid-cols-2 gap-3">
        <PhotoAction actionId={a.id} quand="avant" hash={a.photoAvant} fige={fige} />
        <PhotoAction actionId={a.id} quand="apres" hash={a.photoApres} fige={fige} />
      </div>
    </div>
  );
}

function PhotoAction({
  actionId,
  quand,
  hash,
  fige,
}: {
  actionId: number;
  quand: "avant" | "apres";
  hash: string | null;
  fige?: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const label = quand === "avant" ? "Photo AVANT" : "Photo APRÈS";

  return (
    <div className="rounded-lg border border-dashed p-2">
      <div className="mb-1 text-[10.5px] font-bold uppercase text-muted-foreground">{label}</div>
      {hash ? (
        <div className="flex items-start gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/fichier/${hash}`} alt={label} className="h-24 w-auto rounded border object-cover" />
          {!fige && (
            <BoutonAction variant="ghost" onRun={() => A.retirerPhotoAction(actionId, quand)}>
              <Trash2 className="size-3.5" />
            </BoutonAction>
          )}
        </div>
      ) : fige ? (
        <div className="text-[11px] text-muted-foreground">—</div>
      ) : (
        <Button variant="outline" size="sm" disabled={pending} onClick={() => input.current?.click()}>
          <Camera className="size-3.5" /> {pending ? "Envoi…" : "Ajouter"}
        </Button>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          const compressee = await compresser(f);
          const fd = new FormData();
          fd.set("actionId", String(actionId));
          fd.set("quand", quand);
          fd.set("fichier", compressee, "photo.jpg");
          start(async () => {
            const r = await A.photoAction(fd);
            if (!r.ok) {
              toast.error(r.error);
              return;
            }
            toast.success("Photo ajoutée");
            router.refresh();
          });
        }}
      />
    </div>
  );
}
