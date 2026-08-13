"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { QrCode } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { SectionPanel } from "@/components/shared/section-panel";
import { BoutonImprimer } from "@/components/shared/bouton-imprimer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { COULEUR_RENDEMENT, SEUIL_ALERTE, niveau } from "@/lib/domain/rendement";
import { Kpi, Tuiles } from "../aval/ui";
import { majBasePortail, regenererJetonDirection, supprimerJetonDirection } from "./actions";

export type CarteAffichee = {
  personnelId: number;
  nom: string;
  matricule: string;
  poste: string;
  chaines: string[];
  general: number | null;
  url: string;
  svg: string;
};

export function QrOuvClient({
  cartes,
  nonRattachees,
  base,
  direction,
  peutSaisir,
}: {
  cartes: CarteAffichee[];
  nonRattachees: number;
  base: string;
  direction: { url: string; svg: string } | null;
  peutSaisir: boolean;
}) {
  const router = useRouter();
  const [adresse, setAdresse] = useState(base);
  const [pending, start] = useTransition();

  const enAlerte = cartes.filter((c) => c.general !== null && c.general < SEUIL_ALERTE).length;
  const sansMesure = cartes.filter((c) => c.general === null).length;

  const run = (p: Promise<{ ok: boolean; error?: string }>, msg: string) =>
    start(async () => {
      const r = await p;
      if (!r.ok) {
        toast.error(r.error ?? "Erreur");
        return;
      }
      toast.success(msg);
      router.refresh();
    });

  return (
    <>
      <div className="no-print">
        <PageHeader
          icon={QrCode}
          title="QR rendement"
          description="Chaque ouvrière scanne son QR et voit son rendement — horaire et général"
          actions={<BoutonImprimer label="Imprimer tous les QR" />}
        />
      </div>
      <style>{`@media print { .no-print { display: none !important } @page { margin: 10mm } .qr-card { break-inside: avoid } }`}</style>

      <div className="no-print">
        <Tuiles>
          <Kpi label="QR disponibles" valeur={String(cartes.length)} />
          <Kpi
            label={`Sous ${SEUIL_ALERTE} %`}
            valeur={String(enAlerte)}
            tone={enAlerte ? "danger" : "success"}
          />
          <Kpi label="Sans production mesurée" valeur={String(sansMesure)} tone="neutral" />
          <Kpi
            label="Ouvrières non rattachées"
            valeur={String(nonRattachees)}
            tone={nonRattachees ? "warning" : "neutral"}
            sub="pas de QR possible"
          />
        </Tuiles>

        {peutSaisir && (
          <SectionPanel title="Adresse du portail" icon="🌐">
            <p className="mb-2 text-xs text-muted-foreground">
              Les QR pointent vers cette adresse. Les téléphones des ouvrières ne sont pas sur le réseau du serveur :
              indiquez l&apos;URL publique de l&apos;application, sinon les QR imprimés ne mèneront nulle part.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={adresse}
                onChange={(e) => setAdresse(e.target.value)}
                placeholder="https://dbs-erp.exemple.com"
                className="h-8 w-96 bg-card"
              />
              <Button
                size="sm"
                disabled={pending || adresse === base}
                onClick={() => run(majBasePortail(adresse), "Adresse enregistrée — réimprimez les QR")}
              >
                Enregistrer
              </Button>
            </div>
          </SectionPanel>
        )}

        <SectionPanel title="QR Direction — suivi des chaînes" icon="📊">
          {direction ? (
            <div className="flex flex-wrap items-center gap-5">
              <div
                className="size-32 shrink-0 [&_svg]:size-full"
                dangerouslySetInnerHTML={{ __html: direction.svg }}
              />
              <div className="min-w-56 flex-1">
                <p className="text-xs text-muted-foreground">
                  Rendement global, rendement par chaîne et production horaire, sans nom d&apos;ouvrière. Le lien
                  contient un jeton : quiconque l&apos;obtient voit la production. Gardez-le pour vous.
                </p>
                <code className="mt-2 block truncate rounded bg-muted px-2 py-1 text-[10.5px]">{direction.url}</code>
                {peutSaisir && (
                  <div className="mt-2 flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => {
                        if (confirm("Regénérer le jeton ? Les QR direction déjà imprimés cesseront de fonctionner."))
                          run(regenererJetonDirection(), "Nouveau jeton — réimprimez le QR");
                      }}
                    >
                      🔑 Regénérer
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => {
                        if (confirm("Désactiver l'accès direction ?"))
                          run(supprimerJetonDirection(), "QR direction désactivé");
                      }}
                    >
                      Désactiver
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                L&apos;accès direction est désactivé : la page de suivi renvoie une erreur, même avec son adresse.
              </p>
              {peutSaisir && (
                <Button size="sm" disabled={pending} onClick={() => run(regenererJetonDirection(), "QR direction activé")}>
                  Activer et générer le QR
                </Button>
              )}
            </div>
          )}
        </SectionPanel>

        {nonRattachees > 0 && (
          <div className="mb-4 rounded-lg border border-[var(--warning-d)]/40 bg-[var(--warning-l)] px-4 py-2.5 text-xs">
            <b>{nonRattachees} ouvrière(s) de chaîne ne sont reliées à personne dans le registre.</b> Leur QR ne peut
            pas être généré — le lien se fait depuis l&apos;écran Personnel, onglet « Rattachement chaînes ».
          </div>
        )}
      </div>

      <h2 className="mb-3 text-sm font-bold">
        QR individuels — {cartes.length} ouvrière{cartes.length > 1 ? "s" : ""}
      </h2>

      {cartes.length === 0 ? (
        <div className="rounded-xl border border-dashed px-4 py-12 text-center text-sm text-muted-foreground">
          Aucun QR : reliez d&apos;abord les ouvrières de chaîne au registre du personnel.
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-3">
          {cartes.map((c) => {
            const n = niveau(c.general);
            return (
              <div key={c.personnelId} className="qr-card rounded-xl border bg-card p-3 text-center">
                <div className="mx-auto size-28 [&_svg]:size-full" dangerouslySetInnerHTML={{ __html: c.svg }} />
                <div className="mt-2 text-[13px] font-bold leading-tight">{c.nom}</div>
                <div className="text-[10.5px] text-muted-foreground">
                  Mat. {c.matricule}
                  {c.chaines.length > 0 && ` · ${c.chaines.join(", ")}`}
                </div>
                {c.poste && <div className="text-[10px] text-muted-foreground">{c.poste}</div>}
                <div
                  className="mt-1 text-[12px] font-extrabold tabular-nums"
                  style={{ color: n ? COULEUR_RENDEMENT[n] : "#94a3b8" }}
                >
                  {c.general === null ? "pas encore mesuré" : `${c.general} %`}
                </div>
                <div className="no-print mt-1.5 text-[9.5px] text-muted-foreground">Scannez pour voir le rendement</div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
