"use client";

import { useEffect, useState } from "react";
import { type Chaine, type GpaoState, type Modele, findC, findM } from "./store";

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
  const [modeleId, setModeleId] = useState(state.modeles[0]?.id ?? 0);
  const [effectif, setEffectif] = useState(state.chaines[0]?.ouvrieres.length ?? 22);
  const [nbHeures, setNbHeures] = useState(8);

  const m = findM(state, modeleId);
  const objH = m && m.sam > 0 ? (effectif * 3600) / m.sam : 0;

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
          {state.modeles.map((mm) => (
            <option key={mm.id} value={mm.id}>
              {mm.nom} — {mm.ref} (SAM {mm.sam}s)
            </option>
          ))}
        </select>
      </div>
      <div className="r2">
        <div className="fld">
          <label>Effectif présent</label>
          <input type="number" value={effectif} onChange={(e) => setEffectif(+e.target.value)} />
        </div>
        <div className="fld">
          <label>Heures de travail</label>
          <input type="number" min={1} max={12} value={nbHeures} onChange={(e) => setNbHeures(+e.target.value)} />
        </div>
      </div>
      <div className="note">
        {m && m.sam > 0 ? (
          <>
            🎯 <b>Objectif général chaîne</b> = (effectif {effectif} × 3600) / SAM {m.sam}s ={" "}
            <b>{objH.toFixed(1)} p/h</b> → <b>{Math.round(objH * nbHeures)} pièces / jour</b> ({nbHeures}h)
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
              nbHeures: Math.max(1, Math.min(12, nbHeures || 8)),
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
  onClose,
  onSave,
}: {
  edit: Modele | null;
  onClose: () => void;
  onSave: (data: { nom: string; ref: string; client: string; sam: number; qte: number }) => void;
}) {
  const [nom, setNom] = useState(edit?.nom ?? "");
  const [ref, setRef] = useState(edit?.ref ?? "");
  const [client, setClient] = useState(edit?.client ?? "");
  const [sam, setSam] = useState(edit?.sam ?? 1800);
  const [qte, setQte] = useState(edit?.qte ?? 5000);
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
          <input value={client} onChange={(e) => setClient(e.target.value)} placeholder="ex: Gérard Darel" />
        </div>
      </div>
      <div className="r2">
        <div className="fld">
          <label>SAM total modèle (secondes)</label>
          <input type="number" value={sam} onChange={(e) => setSam(+e.target.value)} />
          <div className="cinfo">
            = {(sam / 60).toFixed(1)} min/pièce. Pour 22 ouvrières : objectif ≈{" "}
            <b>{((22 * 3600) / (sam || 1)).toFixed(1)} p/h</b>
          </div>
        </div>
        <div className="fld">
          <label>Quantité commandée</label>
          <input type="number" value={qte} onChange={(e) => setQte(+e.target.value)} />
        </div>
      </div>
      <div className="macts">
        <button className="btn" onClick={onClose}>
          Annuler
        </button>
        <button
          className="btn primary"
          onClick={() => onSave({ nom: nom.trim(), ref: ref.trim(), client: client.trim(), sam: sam || 1800, qte: qte || 0 })}
        >
          Enregistrer
        </button>
      </div>
    </Overlay>
  );
}

/* ─────────── Ouvrière ─────────── */
export function OuvriereModal({
  edit,
  onClose,
  onSave,
}: {
  edit: { nom: string; poste: string; sam: number } | null;
  onClose: () => void;
  onSave: (data: { nom: string; poste: string; sam: number }) => void;
}) {
  const [nom, setNom] = useState(edit?.nom ?? "");
  const [poste, setPoste] = useState(edit?.poste ?? "");
  const [sam, setSam] = useState(edit?.sam ?? 100);
  useEffect(() => {
    const t = setTimeout(() => document.querySelector<HTMLInputElement>(".gp-mdl input")?.focus(), 80);
    return () => clearTimeout(t);
  }, []);
  return (
    <Overlay onClose={onClose}>
      <h2>{edit ? "✏ Ouvrière" : "＋ Ouvrière"}</h2>
      <div className="fld">
        <label>Nom et prénom</label>
        <input value={nom} onChange={(e) => setNom(e.target.value)} />
      </div>
      <div className="fld">
        <label>Opération / poste</label>
        <input value={poste} onChange={(e) => setPoste(e.target.value)} placeholder="ex: Montage col" />
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
