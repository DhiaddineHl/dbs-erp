"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import * as A from "@/lib/actions/rouleaux";
import { DESTINATIONS, lireScan } from "@/lib/domain/rouleau";
import type { RouleauRow } from "@/lib/services/rouleaux";
import { ScannerQr } from "@/components/shared/scanner-qr";

const nb = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const lire = (s: string) => Number(String(s).replace(",", ".")) || 0;
const r2 = (n: number) => Math.round(n * 100) / 100;

type Cmd = { id: number; label: string; reservee: boolean };
type Emp = { code: string; libelle: string; zone: string };
type Action = "valider" | "sortie" | "retour" | "conso" | "deplacer" | "rtf" | "corriger";

/* Les gestes du magasinier sur UN rouleau, en gros boutons. Chaque bouton
 * n'apparaît que s'il a un sens (pas de sortie sur un rouleau vide, pas de
 * consommation sans sortie…) ; le serveur revérifie tout de toute façon. */
export function ActionsRouleau({
  rouleau: r,
  commandes,
  emplacements,
  peutSaisir,
}: {
  rouleau: RouleauRow;
  commandes: Cmd[];
  emplacements: Emp[];
  peutSaisir: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [action, setAction] = useState<Action | null>(null);
  const [fait, setFait] = useState<string | null>(null);
  const b = r.bilan;
  const u = r.lot.unite;

  const lancer = (fn: () => Promise<{ ok: boolean; error?: string }>, message: string) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) {
        navigator.vibrate?.([80, 60, 80]);
        toast.error((res as { error: string }).error);
        return;
      }
      navigator.vibrate?.(60);
      setAction(null);
      setFait(message);
      router.refresh();
    });

  if (!peutSaisir) {
    return <div className="rounded-xl bg-white px-4 py-5 text-center text-sm text-slate-600">Consultation seule : ce compte ne peut pas mouvementer le tissu.</div>;
  }

  if (fait) {
    return (
      <div className="rounded-2xl bg-white px-4 py-6 text-center">
        <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-emerald-100 text-3xl">✔</div>
        <div className="mt-3 text-xl font-extrabold">{fait}</div>
        <button onClick={() => setFait(null)} className="mt-4 w-full rounded-2xl bg-slate-900 py-3 text-lg font-bold text-white">
          OK
        </button>
      </div>
    );
  }

  if (!action) {
    const boutons: { a: Action; label: string; cls: string; visible: boolean }[] = [
      { a: "valider", label: "✔ VALIDER RÉCEPTION", cls: "bg-emerald-600 text-white col-span-2 py-5 text-xl", visible: !r.valide },
      { a: "sortie", label: "↗ SORTIE", cls: "bg-slate-900 text-white", visible: r.valide && b.disponible > 0.001 },
      { a: "retour", label: "↩ RETOUR", cls: "bg-sky-600 text-white", visible: b.enCoupe > 0.001 },
      { a: "conso", label: "✂ CONSOMMATION", cls: "bg-indigo-600 text-white", visible: b.enCoupe > 0.001 },
      { a: "deplacer", label: "⇄ DÉPLACER", cls: "bg-white text-slate-900 border-2 border-slate-900", visible: true },
      { a: "rtf", label: "Retour fournisseur", cls: "bg-white text-purple-900 border border-purple-300 text-sm", visible: r.valide && b.disponible > 0.001 },
      { a: "corriger", label: "Corriger le métrage", cls: "bg-white text-amber-900 border border-amber-300 text-sm", visible: r.valide },
    ];
    return (
      <div className="grid grid-cols-2 gap-2">
        {boutons
          .filter((x) => x.visible)
          .map((x) => (
            <button key={x.a} onClick={() => setAction(x.a)} className={`rounded-2xl px-3 py-4 text-base font-extrabold shadow-sm ${x.cls}`}>
              {x.label}
            </button>
          ))}
      </div>
    );
  }

  const annuler = (
    <button onClick={() => setAction(null)} className="w-full rounded-2xl bg-slate-200 py-3 font-bold text-slate-700">
      Annuler
    </button>
  );

  return (
    <div className="space-y-3 rounded-2xl bg-white p-4">
      {action === "valider" && (
        <FormValider emplacements={emplacements} pending={pending} onOk={(emp) => lancer(() => A.validerRouleau({ code: r.code, emplacement: emp }), `${r.code} en stock`)} />
      )}
      {action === "sortie" && (
        <FormSortie
          r={r}
          commandes={commandes}
          pending={pending}
          onOk={(x) => lancer(() => A.sortirRouleau({ code: r.code, ...x }), `${nb.format(lire(x.quantite))} ${u} sortis`)}
        />
      )}
      {action === "retour" && (
        <FormQuantite
          titre="Retour en stock (non utilisé)"
          max={b.enCoupe}
          unite={u}
          defaut={b.enCoupe}
          aide={`Sorti non soldé : ${nb.format(b.enCoupe)} ${u}. Mesurez ce qui revient.`}
          avecEmplacement={emplacements}
          pending={pending}
          bouton="Enregistrer le retour"
          onOk={(q, emp) => lancer(() => A.retournerRouleau({ code: r.code, quantite: q, emplacement: emp }), `${nb.format(lire(q))} ${u} revenus en stock`)}
        />
      )}
      {action === "conso" && <FormConso r={r} pending={pending} onOk={(c, ch) => lancer(() => A.consommerRouleau({ code: r.code, consomme: c, chute: ch }), "Consommation enregistrée")} />}
      {action === "deplacer" && (
        <FormEmplacement
          emplacements={emplacements}
          actuel={r.emplacement}
          pending={pending}
          bouton="Déplacer ici"
          onOk={(emp) => lancer(() => A.deplacerRouleau({ code: r.code, emplacement: emp }), `Rangé en ${emp}`)}
        />
      )}
      {action === "rtf" && (
        <FormAvecMotif
          titre="Retour au fournisseur"
          aide={`Fournisseur : ${r.reception.fournisseur || "—"}. Sort du stock sans être consommé ; bon RTF imprimable.`}
          defaut={String(b.disponible)}
          labelValeur={`Métrage retourné (${u})`}
          pending={pending}
          bouton="Retourner au fournisseur"
          onOk={(q, motif) =>
            start(async () => {
              const res = await A.retourFournisseur({ rouleaux: [{ code: r.code, quantite: q }], motif });
              if (!res.ok) return void toast.error(res.error);
              setAction(null);
              setFait(`Bon ${res.numero} créé`);
              window.open(`/magtissu/retour/${encodeURIComponent(res.numero)}`, "_blank");
              router.refresh();
            })
          }
        />
      )}
      {action === "corriger" && (
        <FormAvecMotif
          titre="Corriger le métrage disponible"
          aide={`Disponible calculé : ${nb.format(b.disponible)} ${u}. Le métrage initial (${nb.format(r.metrageInitial)}) ne change pas : la correction est tracée (avant / après, motif, vous).`}
          defaut={String(b.disponible)}
          labelValeur={`Métrage réellement présent (${u})`}
          pending={pending}
          bouton="Enregistrer la correction"
          onOk={(v, motif) => lancer(() => A.corrigerRouleau({ code: r.code, nouveauDisponible: v, motif }), "Correction enregistrée")}
        />
      )}
      {annuler}
    </div>
  );
}

/* ─────────── formulaires ─────────── */

function Titre({ children }: { children: React.ReactNode }) {
  return <div className="text-lg font-extrabold">{children}</div>;
}

function GrosChiffre({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="text"
      inputMode="decimal"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ""))}
      onFocus={(e) => e.target.select()}
      className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 text-center text-4xl font-black tabular-nums"
    />
  );
}

function Valider({ disabled, pending, children, onClick }: { disabled?: boolean; pending: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button disabled={disabled || pending} onClick={onClick} className="w-full rounded-2xl bg-emerald-600 py-4 text-lg font-extrabold text-white disabled:bg-slate-300">
      {pending ? "Enregistrement…" : children}
    </button>
  );
}

function ChoixEmplacement({ emplacements, value, onChange }: { emplacements: Emp[]; value: string; onChange: (v: string) => void }) {
  const [scan, setScan] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <select value={value} onChange={(e) => onChange(e.target.value)} className="min-w-0 flex-1 rounded-2xl border border-slate-300 bg-white px-3 py-3 text-base">
          <option value="">— emplacement —</option>
          {emplacements.map((e) => (
            <option key={e.code} value={e.code}>
              {e.code}
              {e.libelle ? ` · ${e.libelle}` : ""}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => setScan((s) => !s)} className="rounded-2xl border border-slate-300 bg-white px-3 text-sm font-bold">
          {scan ? "×" : "📷 QR"}
        </button>
      </div>
      {scan && (
        <ScannerQr
          autoCamera
          placeholder="Scanner l'étiquette du rayon"
          onCode={(brut) => {
            const lu = lireScan(brut);
            const code = lu?.type === "emplacement" ? lu.code : brut.trim().toUpperCase();
            if (!emplacements.some((e) => e.code === code)) return void toast.error(`Emplacement ${code} inconnu`);
            onChange(code);
            setScan(false);
          }}
        />
      )}
    </div>
  );
}

function FormValider({ emplacements, pending, onOk }: { emplacements: Emp[]; pending: boolean; onOk: (emp: string) => void }) {
  const [emp, setEmp] = useState("");
  return (
    <>
      <Titre>Réception au magasin</Titre>
      <p className="text-sm text-slate-600">Le rouleau est physiquement arrivé. Rangez-le si vous le pouvez (facultatif).</p>
      <ChoixEmplacement emplacements={emplacements} value={emp} onChange={setEmp} />
      <Valider pending={pending} onClick={() => onOk(emp)}>
        ✔ Passer en stock
      </Valider>
    </>
  );
}

function FormSortie({
  r,
  commandes,
  pending,
  onOk,
}: {
  r: RouleauRow;
  commandes: Cmd[];
  pending: boolean;
  onOk: (x: { quantite: string; destination: string; commandeId: number | null; motif?: string }) => void;
}) {
  const b = r.bilan;
  const reservees = commandes.filter((c) => c.reservee);
  const [dest, setDest] = useState("coupe");
  const [cmd, setCmd] = useState<number | null>(reservees.length === 1 ? reservees[0].id : null);
  const [toutes, setToutes] = useState(reservees.length === 0);
  const [qte, setQte] = useState(String(b.disponible));
  const [motif, setMotif] = useState("");
  const v = lire(qte);
  const liste = toutes ? commandes : reservees;
  const trop = v > b.disponible + 0.001;
  return (
    <>
      <Titre>Sortie du rouleau {r.code}</Titre>
      <div className="text-sm font-bold text-slate-700">1 · Destination</div>
      <div className="grid grid-cols-4 gap-1.5">
        {DESTINATIONS.map((d) => (
          <button key={d.value} onClick={() => setDest(d.value)} className={`rounded-xl border-2 py-2 text-xs font-bold ${dest === d.value ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200"}`}>
            {d.label}
          </button>
        ))}
      </div>
      <div className="text-sm font-bold text-slate-700">2 · Commande / OF</div>
      <div className="max-h-56 space-y-1.5 overflow-y-auto">
        {liste.map((c) => (
          <button
            key={c.id}
            onClick={() => setCmd(c.id)}
            className={`flex w-full items-center justify-between rounded-xl border-2 px-3 py-2.5 text-left text-sm ${cmd === c.id ? "border-slate-900 bg-slate-50" : "border-slate-200"}`}
          >
            <span className="font-bold">{c.label}</span>
            {c.reservee && <span className="text-[10px] font-bold uppercase text-emerald-700">réservé</span>}
          </button>
        ))}
        {liste.length === 0 && <div className="text-sm text-slate-500">Aucune commande réservée sur ce lot.</div>}
      </div>
      {!toutes && (
        <button onClick={() => setToutes(true)} className="text-sm font-semibold text-slate-600 underline">
          Voir toutes les commandes
        </button>
      )}
      {r.lot.controle === "refuse" && <div className="rounded-xl bg-red-100 px-3 py-2 text-sm text-red-900">Lot refusé au contrôle : sortie bloquée.</div>}
      <div className="text-sm font-bold text-slate-700">3 · Métrage sorti ({r.lot.unite})</div>
      <GrosChiffre value={qte} onChange={setQte} />
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setQte(String(b.disponible))} className="rounded-full bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white">
          Tout le rouleau {nb.format(b.disponible)}
        </button>
      </div>
      {trop && <div className="rounded-xl bg-red-100 px-3 py-2 text-sm text-red-900">Il ne reste que {nb.format(b.disponible)} {r.lot.unite}.</div>}
      {(dest === "autre" || !cmd) && (
        <input value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Motif (obligatoire sans commande)" className="w-full rounded-2xl border border-slate-300 px-3 py-3" />
      )}
      <Valider
        pending={pending}
        disabled={v <= 0 || trop || (!cmd && dest !== "autre") || (!cmd && !motif.trim())}
        onClick={() => onOk({ quantite: String(v), destination: dest, commandeId: cmd, motif })}
      >
        ✔ Sortir {nb.format(v)} {r.lot.unite}
      </Valider>
    </>
  );
}

function FormQuantite({
  titre,
  max,
  unite,
  defaut,
  aide,
  avecEmplacement,
  pending,
  bouton,
  onOk,
}: {
  titre: string;
  max: number;
  unite: string;
  defaut: number;
  aide: string;
  avecEmplacement?: Emp[];
  pending: boolean;
  bouton: string;
  onOk: (q: string, emp: string) => void;
}) {
  const [q, setQ] = useState(String(r2(defaut)));
  const [emp, setEmp] = useState("");
  const v = lire(q);
  return (
    <>
      <Titre>{titre}</Titre>
      <p className="text-sm text-slate-600">{aide}</p>
      <GrosChiffre value={q} onChange={setQ} />
      {v > max + 0.001 && (
        <div className="rounded-xl bg-red-100 px-3 py-2 text-sm text-red-900">
          Maximum {nb.format(max)} {unite}.
        </div>
      )}
      {avecEmplacement && <ChoixEmplacement emplacements={avecEmplacement} value={emp} onChange={setEmp} />}
      <Valider pending={pending} disabled={v <= 0 || v > max + 0.001} onClick={() => onOk(String(v), emp)}>
        {bouton}
      </Valider>
    </>
  );
}

function FormConso({ r, pending, onOk }: { r: RouleauRow; pending: boolean; onOk: (c: string, ch: string) => void }) {
  const b = r.bilan;
  const [c, setC] = useState(String(b.enCoupe));
  const [ch, setCh] = useState("0");
  const tot = r2(lire(c) + lire(ch));
  const trop = tot > b.enCoupe + 0.001;
  return (
    <>
      <Titre>Consommation de la coupe</Titre>
      <p className="text-sm text-slate-600">
        Sorti non soldé : <b>{nb.format(b.enCoupe)} {r.lot.unite}</b>
        {r.derniereCommande ? ` · ${r.derniereCommande}` : ""}. Ce qui n&apos;est ni consommé ni chute revient par un RETOUR.
      </p>
      <div className="text-sm font-bold text-slate-700">Consommé ({r.lot.unite})</div>
      <GrosChiffre value={c} onChange={setC} />
      <div className="text-sm font-bold text-slate-700">Chute ({r.lot.unite})</div>
      <GrosChiffre value={ch} onChange={setCh} />
      <div className={`text-sm ${trop ? "font-bold text-red-700" : "text-slate-600"}`}>
        Total {nb.format(tot)} / {nb.format(b.enCoupe)} {r.lot.unite}
        {!trop && tot < b.enCoupe - 0.001 ? ` · reste ${nb.format(r2(b.enCoupe - tot))} en coupe` : ""}
      </div>
      <Valider pending={pending} disabled={tot <= 0 || trop} onClick={() => onOk(String(lire(c)), String(lire(ch)))}>
        ✔ Déclarer
      </Valider>
    </>
  );
}

function FormEmplacement({
  emplacements,
  actuel,
  pending,
  bouton,
  onOk,
}: {
  emplacements: Emp[];
  actuel: string;
  pending: boolean;
  bouton: string;
  onOk: (emp: string) => void;
}) {
  const [emp, setEmp] = useState("");
  return (
    <>
      <Titre>Déplacer le rouleau</Titre>
      <p className="text-sm text-slate-600">Emplacement actuel : {actuel || "non rangé"}</p>
      <ChoixEmplacement emplacements={emplacements} value={emp} onChange={setEmp} />
      <Valider pending={pending} disabled={!emp || emp === actuel} onClick={() => onOk(emp)}>
        {bouton} {emp}
      </Valider>
    </>
  );
}

function FormAvecMotif({
  titre,
  aide,
  defaut,
  labelValeur,
  pending,
  bouton,
  onOk,
}: {
  titre: string;
  aide: string;
  defaut: string;
  labelValeur: string;
  pending: boolean;
  bouton: string;
  onOk: (valeur: string, motif: string) => void;
}) {
  const [v, setV] = useState(defaut);
  const [motif, setMotif] = useState("");
  return (
    <>
      <Titre>{titre}</Titre>
      <p className="text-sm text-slate-600">{aide}</p>
      <div className="text-sm font-bold text-slate-700">{labelValeur}</div>
      <GrosChiffre value={v} onChange={setV} />
      <textarea value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Motif (obligatoire)" rows={2} className="w-full rounded-2xl border border-slate-300 px-3 py-2" />
      <Valider pending={pending} disabled={!motif.trim() || v.trim() === ""} onClick={() => onOk(String(lire(v)), motif)}>
        {bouton}
      </Valider>
    </>
  );
}
