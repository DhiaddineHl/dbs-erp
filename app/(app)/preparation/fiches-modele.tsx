"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import { NATURES_DOCUMENT, imprimable, tailleLisible, type NatureDocument } from "@/lib/domain/documents-modele";
import type { DocumentModele } from "@/lib/services/documents-modele";
import * as A from "@/lib/actions/documents-modele";

/* Fiches du modèle (direction technique) : on dépose la fiche technique ou
 * la fiche commentaire du client ; on la consulte et l'imprime ici, et
 * l'atelier sous-traitant la retrouve sur son portail. */

const dateCourte = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" });

export function FichesModele({ commandeId, of, documents, peutDeposer }: { commandeId: number; of: string; documents: DocumentModele[]; peutDeposer: boolean }) {
  const router = useRouter();
  const [nature, setNature] = useState<NatureDocument>("fiche_technique");
  const [note, setNote] = useState("");
  const [visible, setVisible] = useState(true);
  const [envoi, setEnvoi] = useState(false);
  const [pending, start] = useTransition();
  const champ = useRef<HTMLInputElement>(null);

  const deposer = async (f: File) => {
    setEnvoi(true);
    try {
      const fd = new FormData();
      fd.set("commandeId", String(commandeId));
      fd.set("nature", nature);
      fd.set("note", note);
      fd.set("visible", visible ? "1" : "0");
      fd.set("fichier", f);
      const r = await fetch("/api/dt/document", { method: "POST", body: fd });
      const j = await r.json().catch(() => ({ error: "Réponse illisible" }));
      if (!r.ok) throw new Error(j.error ?? "Erreur");
      toast.success(`« ${f.name} » déposée${visible ? " — visible par l'atelier" : ""}`);
      setNote("");
      if (champ.current) champ.current.value = "";
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <b className="text-[12px] uppercase tracking-wide text-muted-foreground">📄 Fiches du modèle</b>
        <span className="text-[11px] text-muted-foreground">fiche technique, fiche commentaire… — consultables et imprimables par l&apos;atelier</span>
      </div>
      {documents.length === 0 ? (
        <div className="mb-2 text-xs text-muted-foreground">Aucune fiche déposée pour ce modèle.</div>
      ) : (
        <ul className="mb-2 divide-y rounded-md border text-xs">
          {documents.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-2 px-2.5 py-1.5">
              <StatusBadge tone={d.nature === "fiche_technique" ? "brand" : d.nature === "fiche_commentaire" ? "info" : "neutral"}>{NATURES_DOCUMENT[d.nature]}</StatusBadge>
              <a href={`/dt/document/${d.id}`} target="_blank" rel="noreferrer" className="font-semibold text-brand underline">
                {d.nom}
              </a>
              <span className="text-muted-foreground">
                {tailleLisible(d.taille)} · {dateCourte(d.le)} · {d.deposePar}
                {d.commandeId !== commandeId && ` · déposée sur ${d.of}`}
              </span>
              {d.note && <span className="italic text-muted-foreground">« {d.note} »</span>}
              <span className="ml-auto flex items-center gap-1.5">
                <StatusBadge tone={d.visibleAtelier ? "success" : "neutral"}>{d.visibleAtelier ? "visible atelier" : "interne"}</StatusBadge>
                {imprimable(d.mime) ? (
                  <a href={`/dt/document/${d.id}`} target="_blank" rel="noreferrer" className="rounded border px-2 py-0.5 font-semibold" title="S'ouvre dans un onglet : Ctrl+P pour imprimer">
                    🖨 Ouvrir / imprimer
                  </a>
                ) : (
                  <a href={`/dt/document/${d.id}?telecharger=1`} className="rounded border px-2 py-0.5 font-semibold">
                    ⬇ Télécharger
                  </a>
                )}
                {peutDeposer && (
                  <>
                    <button
                      disabled={pending}
                      onClick={() =>
                        start(async () => {
                          const r = await A.visibiliteDocument(d.id, !d.visibleAtelier);
                          if (!r.ok) return void toast.error(r.error);
                          router.refresh();
                        })
                      }
                      className="rounded border px-2 py-0.5"
                      title="Montrer ou cacher cette fiche à l'atelier"
                    >
                      {d.visibleAtelier ? "Cacher à l'atelier" : "Montrer à l'atelier"}
                    </button>
                    <button
                      disabled={pending}
                      onClick={() => {
                        if (!confirm(`Retirer « ${d.nom} » ? Elle ne sera plus montrée (ni ici, ni à l'atelier).`)) return;
                        start(async () => {
                          const r = await A.retirerDocument(d.id);
                          if (!r.ok) return void toast.error(r.error);
                          toast.success("Fiche retirée");
                          router.refresh();
                        });
                      }}
                      className="rounded border px-2 py-0.5 text-[var(--danger-d)]"
                    >
                      Retirer
                    </button>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {peutDeposer && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed px-2.5 py-2 text-xs">
          <select value={nature} onChange={(e) => setNature(e.target.value as NatureDocument)} className="h-8 rounded-md border bg-card px-2">
            {Object.entries(NATURES_DOCUMENT).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (facultatif) — ex. version du 14/11" className="h-8 min-w-48 flex-1 rounded-md border px-2" />
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} /> visible par l&apos;atelier
          </label>
          <input
            ref={champ}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.xls,.docx,.doc"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void deposer(f);
            }}
          />
          <Button size="sm" className="h-8" disabled={envoi} onClick={() => champ.current?.click()}>
            {envoi ? "Envoi…" : `📤 Déposer pour ${of}`}
          </Button>
          <span className="w-full text-[10.5px] text-muted-foreground">PDF, photo, Excel ou Word — 25 Mo maximum. La fiche vaut pour tout le groupe d&apos;OF du modèle.</span>
        </div>
      )}
    </div>
  );
}
