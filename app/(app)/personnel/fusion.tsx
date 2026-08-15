"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SectionPanel } from "@/components/shared/section-panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { propositionsFusion } from "@/lib/domain/atelier";
import type { NomSaisi, PersonneRow } from "@/lib/services/atelier";
import * as A from "@/lib/actions/atelier";

export type { NomSaisi } from "@/lib/services/atelier";

/** Assistant de fusion : rapprocher les noms tapés en atelier des fiches du
 * registre.
 *
 * C'est ce rattachement qui fait exister le QR de rendement et qui tient
 * l'historique d'une personne au travers des chaînes. L'écran propose, il ne
 * décide pas : seules les correspondances certaines (matricule connu, ou nom
 * strictement identique une fois normalisé) sont pré-sélectionnées ; le reste
 * est affiché comme suggestion et attend un choix.
 */
export function Fusion({
  saisies,
  personnes,
  peutSaisir,
}: {
  saisies: NomSaisi[];
  personnes: PersonneRow[];
  peutSaisir: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [q, setQ] = useState("");
  const [masquerRattachees, setMasquerRattachees] = useState(true);
  /** Choix de l'utilisateur, par nom saisi. Absent = on garde la proposition. */
  const [choix, setChoix] = useState<Record<string, string>>({});

  const lignes = useMemo(() => {
    const retenues = masquerRattachees ? saisies.filter((s) => !s.rattachee) : saisies;
    return propositionsFusion(retenues, personnes);
  }, [saisies, personnes, masquerRattachees]);

  const filtrees = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? lignes.filter((l) => l.nom.toLowerCase().includes(n)) : lignes;
  }, [lignes, q]);

  const valeurDe = (nom: string, defaut: number | null) =>
    choix[nom] !== undefined ? choix[nom] : defaut === null ? "" : String(defaut);

  const aFusionner = filtrees
    .map((l) => ({ nom: l.nom, valeur: valeurDe(l.nom, l.personnelId) }))
    .filter((x) => x.valeur !== "")
    .map((x) => ({ nom: x.nom, personnelId: Number(x.valeur) }));

  const certaines = lignes.filter((l) => l.sur).length;
  const suggerees = lignes.filter((l) => !l.sur && l.suggestionId !== null).length;
  const orphelines = lignes.filter((l) => l.suggestionId === null).length;

  return (
    <SectionPanel
      title={`${filtrees.length} nom(s) saisi(s) en atelier`}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <input
              type="checkbox"
              checked={masquerRattachees}
              onChange={(e) => setMasquerRattachees(e.target.checked)}
            />
            Masquer les noms déjà rattachés
          </label>
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher un nom…"
            className="h-8 w-56 bg-card"
          />
          {peutSaisir && (
            <Button
              size="sm"
              disabled={pending || !aFusionner.length}
              onClick={() =>
                start(async () => {
                  const r = await A.appliquerFusion(aFusionner);
                  if (!r.ok) {
                    toast.error(r.error);
                    return;
                  }
                  toast.success(
                    `${r.data?.ouvrieres ?? 0} ouvrière(s) et ${r.data?.journees ?? 0} journée(s) rattachées`,
                  );
                  setChoix({});
                  router.refresh();
                })
              }
            >
              🔗 Fusionner ({aFusionner.length})
            </Button>
          )}
        </div>
      }
      flush
    >
      <div className="flex flex-wrap gap-4 border-b bg-muted/30 px-4 py-2 text-[11px] text-muted-foreground">
        <span>
          <b className="text-[var(--success-d,var(--ok-d))]">{certaines}</b> correspondance(s) certaine(s), pré-sélectionnée(s)
        </span>
        <span>
          <b>{suggerees}</b> suggestion(s) à vérifier
        </span>
        <span>
          <b>{orphelines}</b> sans correspondance
        </span>
      </div>
      <p className="border-b bg-muted/30 px-4 py-2 text-[11px] text-muted-foreground">
        Fusionner donne à toutes les lignes portant ce nom — effectifs de chaîne comme effectifs figés des journées —
        l&apos;orthographe et le matricule de la fiche choisie. L&apos;historique de rendement suit aussitôt.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-muted/40 text-[10.5px] uppercase text-muted-foreground">
              <th className="px-3 py-2 text-left">Nom saisi en atelier</th>
              <th className="px-3 py-2 text-right">Lignes</th>
              <th className="px-3 py-2 text-left">Fiche du registre</th>
              <th className="px-3 py-2 text-left">Correspondance</th>
            </tr>
          </thead>
          <tbody>
            {filtrees.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-10 text-center text-muted-foreground">
                  {masquerRattachees ? "Tous les noms saisis sont rattachés." : "Aucun nom saisi en atelier."}
                </td>
              </tr>
            ) : (
              filtrees.map((l) => (
                <tr key={l.nom} className={`border-b last:border-0 ${l.suggestionId === null ? "bg-[var(--danger-l)]/30" : ""}`}>
                  <td className="px-3 py-2 font-semibold">{l.nom}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{l.occurrences}</td>
                  <td className="px-3 py-2">
                    <select
                      disabled={!peutSaisir}
                      value={valeurDe(l.nom, l.personnelId)}
                      onChange={(e) => setChoix((p) => ({ ...p, [l.nom]: e.target.value }))}
                      className={`w-full max-w-72 rounded-md border bg-card px-2 py-1 text-xs ${
                        valeurDe(l.nom, l.personnelId) ? "border-[var(--ok)]" : "border-input"
                      }`}
                    >
                      <option value="">— ne rien faire —</option>
                      {personnes.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.matricule} · {p.nom}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    {l.sur ? (
                      <StatusBadge tone="success">Certaine</StatusBadge>
                    ) : l.suggestionId !== null ? (
                      <span className="text-[11px] text-muted-foreground">
                        ≈ {l.suggestionMatricule} · {l.suggestionNom}{" "}
                        <b>({Math.round(l.score * 100)}%)</b> — à vérifier
                      </span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">aucune — fiche à créer ou nom à corriger</span>
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
