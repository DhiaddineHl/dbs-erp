"use client";

import { useEffect, useState } from "react";
import { type Chaine, type GpaoState, type Modele, type OperationRef, findC, findM } from "./store";
import { cleOperation } from "@/lib/domain/atelier";

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="gp-ovl" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="gp-mdl">{children}</div>
    </div>
  );
}

/* ─────────── Nouvelle journée ─────────── */
export type OFOption = { id: number; of: string; modele: string };

export function NewDayModal({
  state,
  commandes = [],
  onClose,
  onCreate,
}: {
  state: GpaoState;
  /** OF sélectionnables pour rattacher la journée à une commande précise
   * (pivot OF↔production §5). Facultatif : sans OF, la journée reste valide. */
  commandes?: OFOption[];
  onClose: () => void;
  onCreate: (d: {
    date: string;
    chaineId: number;
    modeleId: number;
    effectif: number;
    nbHeures: number;
    commandeId?: number | null;
  }) => void;
}) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [chaineId, setChaineId] = useState(state.chaines[0]?.id ?? 0);
  const [modeleId, setModeleId] = useState(
    () => (state.modeles.find((m) => !m.archive) ?? state.modeles[0])?.id ?? 0,
  );
  const [commandeId, setCommandeId] = useState<number | "">("");
  const [effectif, setEffectif] = useState(state.chaines[0]?.ouvrieres.length ?? 22);
  const [nbHeures, setNbHeures] = useState("8");

  /* Les modèles archivés (finis) ne sont plus proposés : on les réactive
   * depuis Cumul si l'on doit vraiment relancer une série. */
  const modelesProposes = state.modeles.filter((mm) => !mm.archive);
  const choix = modelesProposes.length ? modelesProposes : state.modeles;

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
        <select value={chaineId} onChange={(e) => setChaineId(+e.target.value)}>
          {state.chaines.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nom} ({c.ouvrieres.length} ouvrières)
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
      {commandes.length > 0 && (
        <div className="fld">
          <label>OF rattaché (facultatif)</label>
          <select value={commandeId} onChange={(e) => setCommandeId(e.target.value === "" ? "" : +e.target.value)}>
            <option value="">— Aucun (production par modèle) —</option>
            {commandes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.of} — {c.modele}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="r2">
        <div className="fld">
          <label>Effectif présent</label>
          <input type="number" value={effectif} onChange={(e) => setEffectif(+e.target.value)} />
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
            🎯 <b>Objectif général chaîne</b> = (effectif {effectif} × 3600) / SAM {m.sam}s ={" "}
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
              effectif: effectif || findC(state, chaineId)?.ouvrieres.length || 0,
              nbHeures: heures > 0 ? heures : 8,
              commandeId: commandeId === "" ? null : commandeId,
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
  onSave: (data: { nom: string; chef: string }) => void;
}) {
  const [nom, setNom] = useState(edit?.nom ?? "");
  const [chef, setChef] = useState(edit?.chef ?? "");
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
      <div className="macts">
        <button className="btn" onClick={onClose}>
          Annuler
        </button>
        <button className="btn primary" onClick={() => onSave({ nom: nom.trim(), chef: chef.trim() })}>
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
  effectifDefaut,
  onClose,
  onSave,
}: {
  edit: Modele | null;
  /** Client names from the shared Clients module (kept in sync). */
  clients: string[];
  onClose: () => void;
  onSave: (data: { nom: string; ref: string; client: string; sam: number; qte: number; estimEff: number }) => void;
  /** Effectif proposé par défaut pour l'estimation (celui de la 1re chaîne). */
  effectifDefaut?: number;
}) {
  const [nom, setNom] = useState(edit?.nom ?? "");
  const [ref, setRef] = useState(edit?.ref ?? "");
  const [client, setClient] = useState(edit?.client ?? "");
  const [sam, setSam] = useState(edit?.sam ?? 1800);
  const [qte, setQte] = useState(edit?.qte ?? 5000);
  /* Source EXPLICITE de l'estimation, sans valeur magique : la valeur propre au
   * modèle si elle existe, sinon l'effectif de la 1re chaîne (repli assumé et
   * affiché), sinon 0 — « non renseigné », plutôt qu'un « 22 » sorti de nulle
   * part qui se faisait passer pour une vraie donnée. */
  const estimParDefaut = !edit?.estimEff && !!effectifDefaut;
  const [estimEff, setEstimEff] = useState(edit?.estimEff || effectifDefaut || 0);
  return (
    <Overlay onClose={onClose}>
      <h2>{edit ? "✏ Modifier modèle" : "＋ Nouveau modèle"}</h2>
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
          {estimParDefaut && <div className="cinfo">Repli : effectif de la 1re chaîne — ajustez-le pour ce modèle.</div>}
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
