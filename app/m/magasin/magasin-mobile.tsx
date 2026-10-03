"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { AlerteReception } from "@/lib/domain/aval";
import * as A from "@/lib/actions/aval";

const nb = new Intl.NumberFormat("fr-FR");
const dateFr = (iso: string) => iso.split("-").reverse().join("/");

type Base = {
  id: number;
  of: string;
  modele: string;
  couleur: string;
  client: string;
  faconnier: string;
  chaine: string;
  qte: number;
  produit: number;
  stockQte: number;
  produitGpao: number;
  /** Production GPAO en trop (au-delà de la commande et de ses OF frères). */
  gpaoExcedent: number;
  entreesInternes: number;
};
export type LigneInterne = Base & { aEntrer: number };
export type LigneFaconnier = Base & { reste: number };
export type SaisieJour = {
  cle: string;
  genre: "br" | "interne";
  id: number;
  libelle: string;
  of: string;
  modele: string;
  qte: number;
  detail: string;
};

type Ecran =
  | { vue: "liste" }
  | { vue: "interne"; c: LigneInterne }
  | { vue: "faconnier"; c: LigneFaconnier }
  | { vue: "ok"; titre: string; detail: string };

/* Saisie des réceptions au magasin, au téléphone.
 *
 *   1. toucher la commande (la liste ne montre que ce qui est à recevoir) ;
 *   2. vérifier la quantité (pré-remplie : GPAO pour l'interne, reste à
 *      recevoir pour un façonnier) et, pour un façonnier, toucher le contrôle ;
 *   3. valider.
 * Une erreur de saisie s'annule depuis « Saisies d'aujourd'hui ». */
export function MagasinMobile({
  utilisateur,
  jour,
  internes,
  faconniers,
  saisies,
}: {
  utilisateur: string;
  jour: string;
  internes: LigneInterne[];
  faconniers: { faconnier: string; commandes: LigneFaconnier[] }[];
  saisies: SaisieJour[];
}) {
  const [onglet, setOnglet] = useState<"interne" | "faconnier">(
    internes.some((c) => c.aEntrer > 0) || !faconniers.length ? "interne" : "faconnier",
  );
  const [ecran, setEcran] = useState<Ecran>({ vue: "liste" });
  const [q, setQ] = useState("");

  const { internesVus, faconniersVus } = useMemo(() => {
    const n = q.trim().toLowerCase();
    const correspond = (c: Base) => !n || `${c.of} ${c.modele} ${c.couleur} ${c.client} ${c.faconnier}`.toLowerCase().includes(n);
    return {
      internesVus: internes.filter(correspond),
      faconniersVus: faconniers
        .map((f) => ({ ...f, commandes: f.commandes.filter(correspond) }))
        .filter((f) => f.commandes.length),
    };
  }, [internes, faconniers, q]);
  const nbInternes = internes.filter((c) => c.aEntrer > 0).length;
  const nbFaconniers = faconniers.reduce((s, f) => s + f.commandes.length, 0);

  if (ecran.vue === "interne") return <SaisieInterne c={ecran.c} jour={jour} onRetour={() => setEcran({ vue: "liste" })} onFait={(t, d) => setEcran({ vue: "ok", titre: t, detail: d })} />;
  if (ecran.vue === "faconnier") return <SaisieFaconnier c={ecran.c} jour={jour} onRetour={() => setEcran({ vue: "liste" })} onFait={(t, d) => setEcran({ vue: "ok", titre: t, detail: d })} />;
  if (ecran.vue === "ok") {
    return (
      <Cadre>
        <div className="flex min-h-[70vh] flex-col items-center justify-center text-center">
          <div className="flex size-24 items-center justify-center rounded-full bg-emerald-100 text-5xl">✔</div>
          <h1 className="mt-5 text-2xl font-extrabold">{ecran.titre}</h1>
          <p className="mt-2 text-sm text-slate-600">{ecran.detail}</p>
          <button onClick={() => setEcran({ vue: "liste" })} className="mt-8 w-full rounded-2xl bg-slate-900 py-4 text-lg font-bold text-white active:scale-[0.98]">
            + Nouvelle réception
          </button>
        </div>
      </Cadre>
    );
  }

  return (
    <Cadre>
      <header className="mb-4">
        <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">DBS Fashion · Magasin produits finis</div>
        <div className="flex items-end justify-between">
          <h1 className="text-2xl font-extrabold tracking-tight">Réceptions</h1>
          <div className="text-right text-xs text-slate-500">
            {utilisateur}
            <br />
            {dateFr(jour)}
          </div>
        </div>
      </header>

      <div className="mb-3 grid grid-cols-2 gap-2">
        <Onglet actif={onglet === "interne"} onClick={() => setOnglet("interne")} icone="🏭" titre="Production interne" compte={nbInternes} />
        <Onglet actif={onglet === "faconnier"} onClick={() => setOnglet("faconnier")} icone="🚚" titre="Façonniers" compte={nbFaconniers} />
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="🔎 OF, modèle, client…"
        className="mb-3 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base"
      />

      {onglet === "interne" ? (
        internesVus.length === 0 ? (
          <Vide texte="Aucune commande interne en cours." />
        ) : (
          <div className="space-y-2">
            {internesVus.map((c) => (
              <Carte key={c.id} c={c} onClick={() => setEcran({ vue: "interne", c })}>
                {c.aEntrer > 0 ? (
                  <Pastille ton="vert" valeur={c.aEntrer} libelle="à entrer" />
                ) : (
                  <span className="text-right text-[11px] leading-tight text-slate-400">
                    rien de nouveau
                    <br />
                    en GPAO
                  </span>
                )}
              </Carte>
            ))}
          </div>
        )
      ) : faconniersVus.length === 0 ? (
        <Vide texte="Aucune réception façonnier attendue." />
      ) : (
        <div className="space-y-4">
          {faconniersVus.map((f) => (
            <section key={f.faconnier}>
              <h2 className="mb-1.5 px-1 text-xs font-bold uppercase tracking-wide text-slate-500">🚚 {f.faconnier}</h2>
              <div className="space-y-2">
                {f.commandes.map((c) => (
                  <Carte key={c.id} c={c} onClick={() => setEcran({ vue: "faconnier", c })}>
                    <Pastille ton="bleu" valeur={c.reste} libelle="à recevoir" />
                  </Carte>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <SaisiesDuJour saisies={saisies} />
    </Cadre>
  );
}

/* ─────────── entrée de production interne ─────────── */

function SaisieInterne({
  c,
  jour,
  onRetour,
  onFait,
}: {
  c: LigneInterne;
  jour: string;
  onRetour: () => void;
  onFait: (titre: string, detail: string) => void;
}) {
  const router = useRouter();
  const [qte, setQte] = useState(c.aEntrer);
  const [date, setDate] = useState(jour);
  const [pending, start] = useTransition();
  const resteCommande = Math.max(0, c.qte - c.entreesInternes);

  return (
    <Cadre>
      <Retour onClick={onRetour} />
      <EnteteCommande c={c} sous={`🏭 ${c.chaine || "Production interne"}`} />
      <div className="mb-4 grid grid-cols-3 gap-2 text-center">
        <Info label="Sorti GPAO" valeur={c.produitGpao} />
        <Info label="Déjà entré" valeur={c.entreesInternes} />
        <Info label="À entrer" valeur={c.aEntrer} fort />
      </div>
      {c.gpaoExcedent > 0 && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
          ⚠ Production GPAO en trop : {c.gpaoExcedent} pcs, à vérifier (non comptées à entrer).
        </div>
      )}

      <Compteur
        titre="Pièces entrées au stock"
        valeur={qte}
        onChange={setQte}
        raccourcis={[
          ...(c.aEntrer > 0 ? [{ label: `GPAO ${nb.format(c.aEntrer)}`, valeur: c.aEntrer }] : []),
          ...(resteCommande > 0 && resteCommande !== c.aEntrer ? [{ label: `Reste cmd ${nb.format(resteCommande)}`, valeur: resteCommande }] : []),
        ]}
      />
      {c.aEntrer > 0 && qte > c.aEntrer && (
        <Message ton="orange">Plus que ce que la GPAO a sorti ({nb.format(c.aEntrer)} pcs). Vérifiez le comptage.</Message>
      )}
      <ChoixDate date={date} jour={jour} onChange={setDate} />

      <Valider
        disabled={pending || qte <= 0}
        onClick={() =>
          start(async () => {
            const r = await A.receptionMagasin({ commandeId: c.id, date, qte, note: "saisie mobile" });
            if (!r.ok) return void toast.error(r.error);
            router.refresh();
            onFait(`${nb.format(qte)} pcs entrées au stock`, `${c.of} · ${c.modele} — production interne`);
          })
        }
      >
        {pending ? "Enregistrement…" : `✔ Entrer ${nb.format(qte)} pcs au stock`}
      </Valider>
    </Cadre>
  );
}

/* ─────────── réception façonnier (bon de réception) ─────────── */

type Controle = "ok" | "ecart" | "refuse";

function SaisieFaconnier({
  c,
  jour,
  onRetour,
  onFait,
}: {
  c: LigneFaconnier;
  jour: string;
  onRetour: () => void;
  onFait: (titre: string, detail: string) => void;
}) {
  const router = useRouter();
  const [recue, setRecue] = useState(0);
  const [controle, setControle] = useState<Controle>("ok");
  const [nc, setNc] = useState(0);
  const [date, setDate] = useState(jour);
  const [alertes, setAlertes] = useState<AlerteReception[]>([]);
  const [pending, start] = useTransition();

  const ncEff = controle === "refuse" ? recue : controle === "ecart" ? Math.min(nc, recue) : 0;
  const conformes = controle === "refuse" ? 0 : Math.max(0, recue - ncEff);

  // Mêmes contrôles de cohérence que l'enregistrement, calculés côté serveur.
  useEffect(() => {
    if (recue <= 0) return;
    let vivant = true;
    const t = setTimeout(async () => {
      const r = await A.verifierReception(c.id, recue, conformes, ncEff, controle);
      if (vivant && r.ok) setAlertes(r.data ?? []);
    }, 250);
    return () => {
      vivant = false;
      clearTimeout(t);
    };
  }, [c.id, recue, conformes, ncEff, controle]);

  const visibles = recue > 0 ? alertes.filter((a) => a.niveau !== "info") : [];
  const bloquant = visibles.find((a) => a.niveau === "bloquant");
  const avertissement = visibles.find((a) => a.niveau === "warn");

  return (
    <Cadre>
      <Retour onClick={onRetour} />
      <EnteteCommande c={c} sous={`🚚 ${c.faconnier}`} />
      <div className="mb-4 grid grid-cols-3 gap-2 text-center">
        <Info label="Commandé" valeur={c.qte} />
        <Info label="Déjà reçu" valeur={c.produit} />
        <Info label="À recevoir" valeur={c.reste} fort />
      </div>

      <Compteur
        titre="1 · Pièces reçues"
        valeur={recue}
        onChange={setRecue}
        raccourcis={[{ label: `Tout le reste ${nb.format(c.reste)}`, valeur: c.reste }]}
      />

      <div className="mb-4">
        <div className="mb-2 text-sm font-bold text-slate-700">2 · Contrôle à la réception</div>
        <div className="grid grid-cols-3 gap-2">
          <BoutonControle actif={controle === "ok"} onClick={() => setControle("ok")} icone="✅" label="Tout conforme" ton="vert" />
          <BoutonControle actif={controle === "ecart"} onClick={() => setControle("ecart")} icone="⚠️" label="Avec défauts" ton="orange" />
          <BoutonControle actif={controle === "refuse"} onClick={() => setControle("refuse")} icone="⛔" label="Lot refusé" ton="rouge" />
        </div>
      </div>

      {controle === "ecart" && (
        <Compteur titre="Pièces non conformes" valeur={nc} onChange={(v) => setNc(Math.min(v, recue))} petit />
      )}

      {recue > 0 && (
        <div
          className={`mb-3 rounded-2xl px-4 py-3 text-sm ${
            controle === "refuse" ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-900"
          }`}
        >
          {controle === "refuse" ? (
            <>
              <b>Rien n&apos;entre au stock</b> — les {nb.format(recue)} pièces restent non conformes (retouche ou rebut à
              décider au bureau).
            </>
          ) : (
            <>
              Entrent au stock : <b className="text-lg">{nb.format(conformes)}</b> pcs
              {ncEff > 0 && (
                <>
                  {" "}
                  · non conformes : <b>{nb.format(ncEff)}</b>
                </>
              )}
            </>
          )}
        </div>
      )}

      {visibles.map((a, i) => (
        <Message key={i} ton={a.niveau === "bloquant" ? "rouge" : "orange"}>
          {a.niveau === "bloquant" ? "⛔ " : "⚠ "}
          {a.message}
        </Message>
      ))}

      <ChoixDate date={date} jour={jour} onChange={setDate} />

      <Valider
        danger={!!avertissement}
        disabled={pending || recue <= 0 || !!bloquant}
        onClick={() =>
          start(async () => {
            const r = await A.creerBr({
              commandeId: c.id,
              date,
              qteRecue: recue,
              qteOk: conformes,
              qteNc: ncEff,
              controle,
              note: "saisie mobile",
              forcer: !!avertissement,
            });
            if (!r.ok) return void toast.error(r.error);
            router.refresh();
            onFait(
              `${r.data!.numero} enregistré`,
              conformes > 0
                ? `${nb.format(conformes)} pcs entrées au stock — ${c.of} · ${c.faconnier}`
                : `Lot refusé : rien n'entre au stock — ${c.of} · ${c.faconnier}`,
            );
          })
        }
      >
        {pending
          ? "Enregistrement…"
          : avertissement
            ? "Enregistrer quand même"
            : recue > 0
              ? `✔ Valider la réception (${nb.format(recue)} pcs)`
              : "Indiquez les pièces reçues"}
      </Valider>
    </Cadre>
  );
}

/* ─────────── saisies du jour (annulation d'une erreur) ─────────── */

function SaisiesDuJour({ saisies }: { saisies: SaisieJour[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (!saisies.length) return null;
  return (
    <section className="mt-8">
      <h2 className="mb-2 px-1 text-xs font-bold uppercase tracking-wide text-slate-500">Saisies d&apos;aujourd&apos;hui ({saisies.length})</h2>
      <div className="divide-y rounded-2xl border border-slate-200 bg-white">
        {saisies.map((s) => (
          <div key={s.cle} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">
                {s.of} · {s.modele}
              </div>
              <div className="truncate text-xs text-slate-500">
                {s.libelle}
                {s.detail ? ` · ${s.detail}` : ""}
              </div>
            </div>
            <div className="text-right text-sm font-bold tabular-nums">+{nb.format(s.qte)}</div>
            <button
              disabled={pending}
              onClick={() => {
                if (!confirm(`Annuler cette saisie (${s.of}, ${nb.format(s.qte)} pcs) ?`)) return;
                start(async () => {
                  const r = s.genre === "br" ? await A.supprimerBr(s.id) : await A.supprimerMouvementMagasin(s.id);
                  if (!r.ok) return void toast.error(r.error);
                  toast.success("Saisie annulée");
                  router.refresh();
                });
              }}
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-600 active:bg-slate-100"
            >
              Annuler
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─────────── éléments d'écran ─────────── */

function Cadre({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto max-w-md px-4 pb-10 pt-5">{children}</div>
    </div>
  );
}

function Onglet({ actif, onClick, icone, titre, compte }: { actif: boolean; onClick: () => void; icone: string; titre: string; compte: number }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-2xl px-3 py-3 text-left transition active:scale-[0.98] ${
        actif ? "bg-slate-900 text-white shadow" : "border border-slate-300 bg-white text-slate-700"
      }`}
    >
      <div className="text-2xl">{icone}</div>
      <div className="mt-1 text-sm font-bold leading-tight">{titre}</div>
      <div className={`text-xs ${actif ? "text-white/70" : "text-slate-500"}`}>{compte} à traiter</div>
    </button>
  );
}

function Carte({ c, onClick, children }: { c: Base; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-left shadow-sm active:scale-[0.99] active:bg-slate-50">
      <div className="min-w-0 flex-1">
        <div className="text-base font-extrabold">{c.of}</div>
        <div className="truncate text-sm text-slate-700">
          {c.modele}
          {c.couleur ? ` · ${c.couleur}` : ""}
        </div>
        <div className="truncate text-xs text-slate-500">{c.client}</div>
      </div>
      {children}
      <span className="text-xl text-slate-300">›</span>
    </button>
  );
}

function Pastille({ ton, valeur, libelle }: { ton: "vert" | "bleu"; valeur: number; libelle: string }) {
  return (
    <div className={`rounded-xl px-3 py-1.5 text-center ${ton === "vert" ? "bg-emerald-100 text-emerald-800" : "bg-blue-100 text-blue-800"}`}>
      <div className="text-lg font-extrabold tabular-nums leading-none">{nb.format(valeur)}</div>
      <div className="text-[10px] font-semibold">{libelle}</div>
    </div>
  );
}

function Vide({ texte }: { texte: string }) {
  return <div className="rounded-2xl bg-white px-4 py-10 text-center text-sm text-slate-500">{texte}</div>;
}

function Retour({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="mb-3 rounded-xl px-1 py-2 text-sm font-semibold text-slate-600 active:text-slate-900">
      ← Retour à la liste
    </button>
  );
}

function EnteteCommande({ c, sous }: { c: Base; sous: string }) {
  return (
    <div className="mb-3">
      <div className="text-xs font-semibold text-slate-500">{sous}</div>
      <h1 className="text-3xl font-extrabold tracking-tight">{c.of}</h1>
      <div className="text-sm text-slate-700">
        {c.modele}
        {c.couleur ? ` · ${c.couleur}` : ""} — {c.client}
      </div>
    </div>
  );
}

function Info({ label, valeur, fort }: { label: string; valeur: number; fort?: boolean }) {
  return (
    <div className={`rounded-xl px-2 py-2 ${fort ? "bg-slate-900 text-white" : "bg-white"}`}>
      <div className={`text-[10px] font-semibold uppercase ${fort ? "text-white/70" : "text-slate-500"}`}>{label}</div>
      <div className="text-lg font-extrabold tabular-nums">{nb.format(valeur)}</div>
    </div>
  );
}

/** Quantité : gros chiffre modifiable au clavier, boutons ± et raccourcis. */
function Compteur({
  titre,
  valeur,
  onChange,
  raccourcis = [],
  petit,
}: {
  titre: string;
  valeur: number;
  onChange: (v: number) => void;
  raccourcis?: { label: string; valeur: number }[];
  petit?: boolean;
}) {
  const fixer = (v: number) => onChange(Math.max(0, Math.round(v)));
  const pas = petit ? [-5, -1, 1, 5] : [-10, -1, 1, 10];
  return (
    <div className="mb-4 rounded-2xl bg-white p-4 shadow-sm">
      <div className="mb-2 text-sm font-bold text-slate-700">{titre}</div>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={valeur ? String(valeur) : ""}
        placeholder="0"
        onChange={(e) => fixer(Number(e.target.value.replace(/\D/g, "")) || 0)}
        onFocus={(e) => e.target.select()}
        className={`w-full rounded-xl border border-slate-200 bg-slate-50 py-2 text-center font-black tabular-nums outline-none focus:border-slate-900 ${
          petit ? "text-3xl" : "text-5xl"
        }`}
      />
      <div className="mt-3 grid grid-cols-4 gap-2">
        {pas.map((p) => (
          <button
            key={p}
            onClick={() => fixer(valeur + p)}
            className="rounded-xl border border-slate-300 bg-white py-3 text-lg font-bold active:bg-slate-100"
          >
            {p > 0 ? `+${p}` : `−${-p}`}
          </button>
        ))}
      </div>
      {raccourcis.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {raccourcis.map((r) => (
            <button
              key={r.label}
              onClick={() => fixer(r.valeur)}
              className="rounded-full bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white active:scale-[0.98]"
            >
              {r.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function BoutonControle({
  actif,
  onClick,
  icone,
  label,
  ton,
}: {
  actif: boolean;
  onClick: () => void;
  icone: string;
  label: string;
  ton: "vert" | "orange" | "rouge";
}) {
  const couleur = {
    vert: "border-emerald-500 bg-emerald-50 text-emerald-900",
    orange: "border-amber-500 bg-amber-50 text-amber-900",
    rouge: "border-red-500 bg-red-50 text-red-900",
  }[ton];
  return (
    <button
      onClick={onClick}
      className={`rounded-2xl border-2 px-2 py-3 text-center active:scale-[0.98] ${actif ? couleur : "border-slate-200 bg-white text-slate-600"}`}
    >
      <div className="text-2xl">{icone}</div>
      <div className="mt-1 text-xs font-bold leading-tight">{label}</div>
    </button>
  );
}

function ChoixDate({ date, jour, onChange }: { date: string; jour: string; onChange: (d: string) => void }) {
  const [ouvert, setOuvert] = useState(date !== jour);
  return (
    <div className="mb-4 px-1 text-sm text-slate-600">
      {ouvert ? (
        <label className="flex items-center gap-2">
          Date de réception :
          <input type="date" value={date} max={jour} onChange={(e) => onChange(e.target.value || jour)} className="rounded-lg border border-slate-300 bg-white px-2 py-1.5" />
        </label>
      ) : (
        <>
          Date : <b>aujourd&apos;hui</b>{" "}
          <button onClick={() => setOuvert(true)} className="ml-1 font-semibold text-blue-700 underline">
            changer
          </button>
        </>
      )}
    </div>
  );
}

function Message({ ton, children }: { ton: "orange" | "rouge"; children: React.ReactNode }) {
  return (
    <div className={`mb-3 rounded-xl px-3 py-2 text-sm ${ton === "rouge" ? "bg-red-100 text-red-900" : "bg-amber-100 text-amber-900"}`}>{children}</div>
  );
}

function Valider({
  children,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="sticky bottom-3">
      <button
        onClick={onClick}
        disabled={disabled}
        className={`w-full rounded-2xl py-4 text-lg font-extrabold text-white shadow-lg active:scale-[0.98] disabled:bg-slate-300 disabled:shadow-none ${
          danger ? "bg-red-600" : "bg-emerald-600"
        }`}
      >
        {children}
      </button>
    </div>
  );
}
