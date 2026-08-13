"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ScrollText } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { SectionPanel } from "@/components/shared/section-panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { Input } from "@/components/ui/input";
import type { Tone } from "@/components/shared/status-badge";
import type { EntreeJournal, StatsJournal } from "@/lib/services/activite";
import type { RoleRow } from "@/lib/services/permissions";
import { Kpi, Tuiles } from "../aval/ui";

const nb = new Intl.NumberFormat("fr-FR");

const TONS: Record<string, Tone> = {
  connexion: "brand",
  deconnexion: "neutral",
  creation: "success",
  modification: "warning",
  suppression: "danger",
  validation: "success",
  impression: "neutral",
  import: "purple",
  export: "purple",
};

const LIBELLES: Record<string, string> = {
  connexion: "Connexion",
  deconnexion: "Déconnexion",
  creation: "Création",
  modification: "Modification",
  suppression: "Suppression",
  validation: "Validation",
  impression: "Impression",
  import: "Import",
  export: "Export",
};

const horodatage = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

export function JournalClient({
  entrees,
  stats,
  roles,
  filtres,
}: {
  entrees: EntreeJournal[];
  stats: StatsJournal;
  roles: RoleRow[];
  filtres: { action: string; role: string; jours: number };
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState("");

  /* Les filtres serveur vivent dans l'URL : le journal se partage par lien, et
   * le retour arrière du navigateur fait ce qu'on attend. */
  const naviguer = (cle: string, valeur: string) => {
    const p = new URLSearchParams(params.toString());
    if (valeur) p.set(cle, valeur);
    else p.delete(cle);
    router.push(`/journal?${p.toString()}`);
  };

  const affichees = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return entrees;
    return entrees.filter((e) => `${e.userName} ${e.cible} ${e.detail}`.toLowerCase().includes(n));
  }, [entrees, q]);

  const libelleRole = (k: string) => roles.find((r) => r.key === k)?.label ?? (k || "—");
  const couleurRole = (k: string) => roles.find((r) => r.key === k)?.color ?? "#64748b";

  const ecritures = stats.parAction
    .filter((a) => ["creation", "modification", "suppression"].includes(a.action))
    .reduce((s, a) => s + a.n, 0);

  return (
    <>
      <PageHeader
        icon={ScrollText}
        title="Journal d'activité"
        description="Qui a fait quoi, et quand — écrit côté serveur, non modifiable depuis l'application"
      />

      <Tuiles>
        <Kpi label={`Événements (${filtres.jours || 365} j)`} valeur={nb.format(stats.total)} />
        <Kpi label="Écritures métier" valeur={nb.format(ecritures)} tone="warning" />
        <Kpi
          label="Connexions"
          valeur={nb.format(stats.parAction.find((a) => a.action === "connexion")?.n ?? 0)}
          tone="brand"
        />
        <Kpi
          label="Suppressions"
          valeur={nb.format(stats.parAction.find((a) => a.action === "suppression")?.n ?? 0)}
          tone="danger"
        />
      </Tuiles>

      <div className="mb-4 grid gap-4 lg:grid-cols-[1fr_320px]">
        <SectionPanel
          title={`${affichees.length} entrée(s)`}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Utilisateur, écran, détail…"
                className="h-8 w-52 bg-card"
              />
              <select
                value={filtres.action}
                onChange={(e) => naviguer("action", e.target.value)}
                className="h-8 rounded-md border border-input bg-card px-2 text-xs"
              >
                <option value="">Toutes les actions</option>
                {Object.entries(LIBELLES).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
              <select
                value={filtres.role}
                onChange={(e) => naviguer("role", e.target.value)}
                className="h-8 rounded-md border border-input bg-card px-2 text-xs"
              >
                <option value="">Tous les rôles</option>
                {roles.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.label}
                  </option>
                ))}
              </select>
              <select
                value={String(filtres.jours)}
                onChange={(e) => naviguer("jours", e.target.value)}
                className="h-8 rounded-md border border-input bg-card px-2 text-xs"
              >
                {[
                  [1, "24 heures"],
                  [7, "7 jours"],
                  [30, "30 jours"],
                  [90, "3 mois"],
                  [0, "Tout l'historique"],
                ].map(([v, l]) => (
                  <option key={String(v)} value={String(v)}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          }
          flush
        >
          <div className="max-h-[68vh] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/70 backdrop-blur">
                <tr className="text-[10.5px] uppercase text-muted-foreground">
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Utilisateur</th>
                  <th className="px-3 py-2 text-left">Action</th>
                  <th className="px-3 py-2 text-left">Écran</th>
                  <th className="px-3 py-2 text-left">Détail</th>
                </tr>
              </thead>
              <tbody>
                {affichees.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-muted-foreground">
                      Aucune activité sur la période.
                    </td>
                  </tr>
                ) : (
                  affichees.map((e) => (
                    <tr key={e.id} className="border-b last:border-0">
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums text-muted-foreground">
                        {horodatage(e.ts)}
                      </td>
                      <td className="px-3 py-2">
                        <b>{e.userName || "—"}</b>
                        <div className="text-[10px]" style={{ color: couleurRole(e.role) }}>
                          {libelleRole(e.role)}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge tone={TONS[e.action] ?? "neutral"}>
                          {LIBELLES[e.action] ?? e.action}
                        </StatusBadge>
                      </td>
                      <td className="px-3 py-2 font-semibold">{e.cible || "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{e.detail || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </SectionPanel>

        <div className="space-y-4">
          <SectionPanel title="Par action" flush>
            <div className="divide-y">
              {stats.parAction.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-muted-foreground">Rien à afficher.</p>
              ) : (
                stats.parAction.map((a) => (
                  <div key={a.action} className="flex items-center justify-between px-4 py-2 text-xs">
                    <StatusBadge tone={TONS[a.action] ?? "neutral"}>{LIBELLES[a.action] ?? a.action}</StatusBadge>
                    <b className="tabular-nums">{nb.format(a.n)}</b>
                  </div>
                ))
              )}
            </div>
          </SectionPanel>

          <SectionPanel title="Utilisateurs les plus actifs" flush>
            <div className="divide-y">
              {stats.parUtilisateur.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-muted-foreground">Rien à afficher.</p>
              ) : (
                stats.parUtilisateur.map((u) => (
                  <div key={u.nom} className="flex items-center justify-between px-4 py-2 text-xs">
                    <span className="font-semibold">{u.nom}</span>
                    <b className="tabular-nums">{nb.format(u.n)}</b>
                  </div>
                ))
              )}
            </div>
          </SectionPanel>
        </div>
      </div>
    </>
  );
}
