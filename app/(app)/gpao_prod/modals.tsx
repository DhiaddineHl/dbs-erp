"use client";

import { useEffect, useState } from "react";
import { type Chaine, type GpaoState, type Modele, type OperationRef, type CommandeInterne, findC, findM } from "./store";
import { cleOperation } from "@/lib/domain/atelier";

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="gp-ovl" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="gp-mdl">{children}</div>
    </div>
  );
}

/* ─────────── Nouvelle journée ─────────── */
export function NewDayModal({
  state,
  onClose,
  onCreate,
}: {
  state: GpaoState;
  onClose: () => void;
  onCreate: (d: { date: string; chaineId: number; modeleId: number; effectif: number; nbHeures: number }) => void;
}) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [chaineId, setChaineId] = useState(state.chaines[0]?.id ?? 0);
  const [modeleId, setModeleId] = useState(
    () => (state.modeles.find((m) => !m.archive) ?? state.modeles[0])?.id ?? 0,
  );
  /* Effectif PRÉSENT du jour, proposé depuis l'effectif de RÉFÉRENCE de la
   * chaîne sélectionnée (chaine.effectif) — jamais celui d'une autre chaîne ni
   * le nombre de fiches ouvrières. `touche` retient une saisie manuelle pour ne
   * pas l'écraser quand on rouvre la liste ; changer de chaîne repropose son
   * effectif propre. */
  const effectifChaine = (id: number) => {
    const c = findC(state, id);
    return c?.effectif ?? 0;
  };
  const [effectif, setEffectif] = useState(effectifChaine(state.chaines[0]?.id ?? 0));
  const [touche, setTouche] = useState(false);
  const [nbHeures, setNbHeures] = useState("8");

  const choisirChaine = (id: number) => {
    setChaineId(id);
    // Tant que l'utilisateur n'a pas saisi un effectif à la main, on suit la
    // chaîne choisie ; sinon on respecte sa valeur.
    if (!touche) setEffectif(effectifChaine(id));
  };

  /* Les modèles archivés (finis) ne sont plus proposés : on les réactive
   * depuis Cumul si l'on doit vraiment relancer une série. */
  const modelesProposes = state.modeles.filter((mm) => !mm.archive);
  const choix = modelesProposes.length ? modelesProposes : state.modeles;

  const chaineSel = findC(state, chaineId);
  const m = findM(state, modeleId);
  const objH = m && m.sam > 0 ? (effectif * 3600) / m.sam : 0;
  /* Heures saisies : on accepte la virgule comme le point (8,5 ou 8.5), et une
   * saisie en cours de frappe (« 8, ») ne casse pas l'aperçu — elle vaut 8
   * tant qu'aucune décimale n'est tapée. */
  const heures = Math.max(0, Number(String(nbHeures).replace(",", ".")) || 0);

  return (
    <Overlay onClose={onClose}>
      <h2>＋ Nouvelle journée de production</h2>
      <div className="fld">
        <label>Date</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <div className="fld">
        <label>Chaîne</label>
        <select value={chaineId} onChange={(e) => choisirChaine(+e.target.value)}>
          {state.chaines.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nom} — effectif {c.effectif ?? 0}
              {c.ouvrieres.length !== (c.effectif ?? 0) ? ` (${c.ouvrieres.length} fiches)` : ""}
            </option>
          ))}
        </select>
      </div>
      <div className="fld">
        <label>Modèle attribué</label>
        <select value={modeleId} onChange={(e) => setModeleId(+e.target.value)}>
          {choix.map((mm) => (
            <option key={mm.id} value={mm.id}>
              {mm.nom} — {mm.ref} (SAM {mm.sam}s)
            </option>
          ))}
        </select>
      </div>
      <div className="r2">
        <div className="fld">
          <label>Effectif présent</label>
          <input
            type="number"
            min={0}
            value={effectif}
            onChange={(e) => {
              setTouche(true);
              setEffectif(Math.max(0, +e.target.value));
            }}
          />
          {chaineSel && (
            <div style={{ fontSize: 11, color: "#8fa3c8", marginTop: 4 }}>
              Effectif de la chaîne : {chaineSel.effectif ?? 0}
              {effectif !== (chaineSel.effectif ?? 0) ? ` · présent saisi : ${effectif}` : ""}
            </div>
          )}
        </div>
        <div className="fld">
          <label>Heures de travail</label>
          <input
            type="text"
            inputMode="decimal"
            placeholder="8,5"
            value={nbHeures}
            onChange={(e) => setNbHeures(e.target.value.replace(/[^0-9.,]/g, ""))}
          />
        </div>
      </div>
      <div className="note">
        {m && m.sam > 0 ? (
          <>
            🎯 <b>Objectif jour</b> = (effectif présent {effectif} × 3600) / SAM {m.sam}s ={" "}
            <b>{objH.toFixed(1)} p/h</b> → <b>{Math.round(objH * heures)} pièces / jour</b> ({heures || 8}h)
          </>
        ) : (
          "—"
        )}
      </div>
      <div className="macts">
        <button className="btn" onClick={onClose}>
          Annuler
        </button>
        <button
          className="btn primary"
          onClick={() =>
            onCreate({
              date: date || new Date().toISOString().slice(0, 10),
              chaineId,
              modeleId,
              // À défaut de saisie, l'effectif de la chaîne sélectionnée (jamais
              // celui de la 1re chaîne ni le nombre d'ouvrières).
              effectif: effectif || effectifChaine(chaineId),
              nbHeures: heures > 0 ? heures : 8,
            })
          }
        >
          Créer la journée
        </button>
      </div>
    </Overlay>
  );
}

/* ─────────── Chaîne ─────────── */
export function ChaineModal({
  edit,
  onClose,
  onSave,
}: {
  edit: Chaine | null;
  onClose: () => void;
  onSave: (data: { nom: string; chef: string; effectif: number }) => void;
}) {
  const [nom, setNom] = useState(edit?.nom ?? "");
  const [chef, setChef] = useState(edit?.chef ?? "");
  const [effectif, setEffectif] = useState(String(edit?.effectif ?? ""));
  return (
    <Overlay onClose={onClose}>
      <h2>{edit ? "✏ Modifier chaîne" : "＋ Nouvelle chaîne"}</h2>
      <div className="fld">
        <label>Nom de la chaîne</label>
        <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="ex: Chaîne 3" />
      </div>
      <div className="fld">
        <label>Responsable / Chef de chaîne</label>
        <input value={chef} onChange={(e) => setChef(e.target.value)} placeholder="ex: Mme Salha" />
      </div>
      <div className="fld">
        <label>Effectif de la chaîne (nombre d&apos;ouvriers)</label>
        <input
          type="number"
          min={0}
          value={effectif}
          onChange={(e) => setEffectif(e.target.value)}
          placeholder="ex: 20"
        />
        <div style={{ fontSize: 11, color: "#8fa3c8", marginTop: 4 }}>
          Effectif de référence, propre à cette chaîne. Proposé à la création d&apos;une journée sur cette chaîne
          (modifiable ce jour-là). Distinct du nombre de fiches ouvrières.
        </div>
      </div>
      <div className="macts">
        <button className="btn" onClick={onClose}>
          Annuler
        </button>
        <button
          className="btn primary"
          onClick={() =>
            onSave({ nom: nom.trim(), chef: chef.trim(), effectif: Math.max(0, Math.trunc(Number(effectif) || 0)) })
          }
        >
          Enregistrer
        </button>
      </div>
    </Overlay>
  );
}

/* ─────────── Modèle ─────────── */
export function ModeleModal({
  edit,
  clients,
  commandesInternes = [],
  effectifDefaut,
  onClose,
  onSave,
}: {
  edit: Modele | null;
  /** Client names from the shared Clients module (kept in sync). */
  clients: string[];
  /** Commandes attribuées à DBS (interne) : source de nom/référence. */
  commandesInternes?: CommandeInterne[];
  onClose: () => void;
  onSave: (data: { nom: string; ref: string; client: string; sam: number; qte: number; estimEff: number; commandeId: number | null }) => void;
  /** Effectif proposé par défaut pour l'estimation (celui de la 1re chaîne). */
  effectifDefaut?: number;
}) {
  const [nom, setNom] = useState(edit?.nom ?? "");
  const [ref, setRef] = useState(edit?.ref ?? "");
  const [client, setClient] = useState(edit?.client ?? "");
  const [sam, setSam] = useState(edit?.sam ?? 1800);
  const [qte, setQte] = useState(edit?.qte ?? 5000);
  const [estimEff, setEstimEff] = useState(edit?.estimEff || effectifDefaut || 22);
  const [commandeId, setCommandeId] = useState<number | null>(edit?.commandeId ?? null);

  /* Choisir une commande interne (DBS) pré-remplit nom, référence, client,
   * quantité, ET lie la commande (pour remonter la prod GPAO dans son
   * avancement). Plus besoin de retaper ce qui existe déjà côté Commandes. */
  const choisirCommande = (idx: string) => {
    const c = commandesInternes[Number(idx)];
    if (!c) return;
    setNom(c.modele);
    setRef(c.ref);
    if (c.client) setClient(c.client);
    if (c.qte) setQte(c.qte);
    setCommandeId(c.id);
  };

  return (
    <Overlay onClose={onClose}>
      <h2>{edit ? "✏ Modifier modèle" : "＋ Nouveau modèle"}</h2>
      {!edit && commandesInternes.length > 0 && (
        <div className="fld">
          <label>Depuis une commande DBS (interne)</label>
          <select defaultValue="" onChange={(e) => choisirCommande(e.target.value)}>
            <option value="">— Choisir un modèle/référence de commande —</option>
            {commandesInternes.map((c, i) => (
              <option key={`${c.of}-${i}`} value={i}>
                {c.modele}
                {c.ref ? ` — ${c.ref}` : ""}
                {c.client ? ` · ${c.client}` : ""}
                {c.of ? ` (${c.of})` : ""}
              </option>
            ))}
          </select>
          <div className="cinfo">Remplit automatiquement nom, référence, client et quantité — modifiables ensuite.</div>
        </div>
      )}
      {commandeId != null && (
        <div className="cinfo" style={{ color: "#067647", marginTop: -4, marginBottom: 8 }}>
          🔗 Lié à une commande PilotPro — la production GPAO de ce modèle remontera dans son avancement.
        </div>
      )}
      <div className="fld">
        <label>Nom du modèle</label>
        <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="ex: Chemise FEMME" />
      </div>
      <div className="r2">
        <div className="fld">
          <label>Référence</label>
          <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="ex: ami" />
        </div>
        <div className="fld">
          <label>Client</label>
          <select value={client} onChange={(e) => setClient(e.target.value)}>
            <option value="">— Aucun —</option>
            {clients.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            {client && !clients.includes(client) && <option value={client}>{client}</option>}
          </select>
        </div>
      </div>
      <div className="r2">
        <div className="fld">
          <label>SAM total modèle (secondes)</label>
          <input type="number" value={sam} onChange={(e) => setSam(+e.target.value)} />
          <div className="cinfo">
            = {(sam / 60).toFixed(1)} min/pièce · {estimEff || 0} ouvrières ≈{" "}
            <b>{(((estimEff || 0) * 3600) / (sam || 1)).toFixed(1)} p/h</b>
          </div>
        </div>
        <div className="fld">
          <label>Quantité commandée</label>
          <input type="number" value={qte} onChange={(e) => setQte(+e.target.value)} />
        </div>
        <div className="fld">
          <label>Effectif chaîne (estimation p/h)</label>
          <input type="number" value={estimEff} onChange={(e) => setEstimEff(+e.target.value)} />
        </div>
      </div>
      <div className="macts">
        <button className="btn" onClick={onClose}>
          Annuler
        </button>
        <button
          className="btn primary"
          onClick={() =>
            onSave({
              nom: nom.trim(),
              ref: ref.trim(),
              client: client.trim(),
              sam: sam || 1800,
              qte: qte || 0,
              estimEff: estimEff || 0,
              commandeId,
            })
          }
        >
          Enregistrer
        </button>
      </div>
    </Overlay>
  );
}

/* ─────────── Ouvrière ───────────
   Sert deux écrans : l'effectif d'une chaîne, et l'effectif d'une seule
   journée. Seuls le titre et la phrase d'aide changent — le formulaire, lui,
   est le même (nom, poste, SAM). */
export function OuvriereModal({
  edit,
  noms,
  operations,
  titre,
  aide,
  onClose,
  onSave,
}: {
  edit: { nom: string; poste: string; sam: number } | null;
  /** Noms du registre proposés en saisie : taper l'orthographe du registre
   * suffit alors à rattacher l'ouvrière à sa fiche. */
  noms?: string[];
  /** Catalogue d'opérations : choisir un libellé connu pose son temps standard. */
  operations?: OperationRef[];
  titre?: string;
  aide?: string;
  onClose: () => void;
  onSave: (data: { nom: string; poste: string; sam: number }) => void;
}) {
  const [nom, setNom] = useState(edit?.nom ?? "");
  const [poste, setPoste] = useState(edit?.poste ?? "");
  const [sam, setSam] = useState(edit?.sam ?? 100);

  /** Reprendre le SAM du catalogue dès qu'un libellé connu est saisi — c'est
   * l'intérêt du catalogue : ne plus retaper un temps standard déjà décidé. */
  const choisirPoste = (v: string) => {
    setPoste(v);
    const trouvee = operations?.find((o) => cleOperation(o.nom) === cleOperation(v));
    if (trouvee && trouvee.sam > 0) setSam(trouvee.sam);
  };
  useEffect(() => {
    const t = setTimeout(() => document.querySelector<HTMLInputElement>(".gp-mdl input")?.focus(), 80);
    return () => clearTimeout(t);
  }, []);
  return (
    <Overlay onClose={onClose}>
      <h2>{titre ?? (edit ? "✏ Ouvrière" : "＋ Ouvrière")}</h2>
      {aide && <div className="note">{aide}</div>}
      {noms && noms.length > 0 && (
        <datalist id="gp-noms-personnel">
          {noms.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
      )}
      <div className="fld">
        <label>Nom et prénom</label>
        <input list={noms && noms.length ? "gp-noms-personnel" : undefined} value={nom} onChange={(e) => setNom(e.target.value)} />
      </div>
      {operations && operations.length > 0 && (
        <datalist id="gp-operations">
          {operations.map((o) => (
            <option key={o.id} value={o.nom}>
              {o.sam > 0 ? `SAM ${o.sam}s` : ""}
            </option>
          ))}
        </datalist>
      )}
      <div className="fld">
        <label>Opération / poste</label>
        <input
          list={operations && operations.length ? "gp-operations" : undefined}
          value={poste}
          onChange={(e) => choisirPoste(e.target.value)}
          placeholder="ex: Montage col"
        />
      </div>
      <div className="fld">
        <label>SAM opération (secondes)</label>
        <input type="number" value={sam} onChange={(e) => setSam(+e.target.value)} />
        <div className="cinfo">
          Obj/H = 3600 / {sam || 1} = <b>{(3600 / (sam || 1)).toFixed(1)} p/h</b>
        </div>
      </div>
      <div className="macts">
        <button className="btn" onClick={onClose}>
          Annuler
        </button>
        <button className="btn primary" onClick={() => onSave({ nom: nom.trim(), poste: poste.trim() || "—", sam: sam || 100 })}>
          Enregistrer
        </button>
      </div>
    </Overlay>
  );
}
