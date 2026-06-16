"use client";

import { useState } from "react";
import {
  CLIENTS_DB,
  CLIENT_NAMES,
  type FactStore,
  type Facture,
} from "@/lib/facturation/store";
import { type FactureForm, buildFactureDocHTML, printDocument } from "@/lib/facturation/print";

type LineRow = { modele: string; desig: string; ref: string; couleur: string; qte: string; pu: string };
const emptyLine = (): LineRow => ({ modele: "", desig: "", ref: "", couleur: "", qte: "", pu: "" });

const PAIEMENTS = [
  "Virement 60j date de livraison",
  "Virement 30j date de livraison",
  "Virement",
  "LC 120J Date d'expédition",
  "Virement À L'AVANCE",
];

function factToForm(f: Facture) {
  const c = CLIENTS_DB[f.client];
  const ship = (f.extras || []).reduce((s, e) => s + e.mt, 0);
  return {
    num: f.id,
    date: f.date,
    typeDoc: f.type === "avoir" ? "FACTURE D'AVOIR" : f.type === "proforma" ? "FACTURE PROFORMA" : "FACTURE",
    incoterm: f.incoterm || "EX WORK",
    clientSel: CLIENTS_DB[f.client] ? f.client : "custom",
    clientNom: f.clientRaw || (c ? c.nom : ""),
    clientAdresse: c ? c.adresse : "",
    livraison: c ? c.livraison : "",
    paiement: f.paiement || PAIEMENTS[0],
    poids: f.poids || "",
    mp: f.mp || "",
    colis: "",
    matieres: (f.matieres || []).join("\n"),
    fournitures: String(f.fournitures || 0),
    shipping: ship.toFixed(2),
    lignes: (f.lignes.length ? f.lignes : [{}]).map((l) => ({
      modele: (l as Facture["lignes"][0]).modele || "",
      desig: (l as Facture["lignes"][0]).desig || "",
      ref: (l as Facture["lignes"][0]).ref || "",
      couleur: (l as Facture["lignes"][0]).couleur || "",
      qte: (l as Facture["lignes"][0]).qte ? String((l as Facture["lignes"][0]).qte) : "",
      pu: (l as Facture["lignes"][0]).pu ? String((l as Facture["lignes"][0]).pu) : "",
    })),
  };
}

/** The component is remounted (via `key={seedKey}` in the parent) whenever a
 * facture is loaded from the registre, so we can seed all form state directly
 * from props — no effect needed. */
export function Generateur({ store, seed, toast }: { store: FactStore; seed: Facture | null; toast: (m: string) => void }) {
  const init = seed ? factToForm(seed) : null;
  const [num, setNum] = useState(init?.num ?? "");
  const [date, setDate] = useState(init?.date ?? new Date().toISOString().split("T")[0]);
  const [typeDoc, setTypeDoc] = useState(init?.typeDoc ?? "FACTURE");
  const [incoterm, setIncoterm] = useState(init?.incoterm ?? "EX WORK");
  const [clientSel, setClientSel] = useState(init?.clientSel ?? "");
  const [clientNom, setClientNom] = useState(init?.clientNom ?? "");
  const [clientAdresse, setClientAdresse] = useState(init?.clientAdresse ?? "");
  const [livraison, setLivraison] = useState(init?.livraison ?? "");
  const [paiement, setPaiement] = useState(init?.paiement ?? PAIEMENTS[0]);
  const [poids, setPoids] = useState(init?.poids ?? "");
  const [mp, setMp] = useState(init?.mp ?? "");
  const [colis, setColis] = useState(init?.colis ?? "");
  const [matieres, setMatieres] = useState(init?.matieres ?? "");
  const [fournitures, setFournitures] = useState(init?.fournitures ?? "0");
  const [shipping, setShipping] = useState(init?.shipping ?? "0");
  const [lignes, setLignes] = useState<LineRow[]>(init?.lignes ?? [emptyLine()]);
  // when arriving via "Voir", open straight on the preview of the loaded facture
  const [preview, setPreview] = useState<string | null>(init ? buildFactureDocHTML(toFormData(init)) : null);

  const fillClientData = (k: string) => {
    setClientSel(k);
    const c = CLIENTS_DB[k];
    if (c) {
      setClientNom(c.nom);
      setClientAdresse(c.adresse);
      setLivraison(c.livraison);
    }
  };

  const setLine = (i: number, field: keyof LineRow, val: string) =>
    setLignes((prev) => prev.map((l, idx) => (idx === i ? { ...l, [field]: val } : l)));
  const addLine = () => setLignes((prev) => [...prev, emptyLine()]);
  const removeLine = (i: number) => setLignes((prev) => prev.filter((_, idx) => idx !== i));

  const currentForm = (): FactureForm => ({
    num,
    date,
    typeDoc,
    incoterm,
    clientNom,
    clientAdresse,
    livraison,
    paiement,
    poids,
    mp,
    colis,
    matieres,
    fournitures: parseFloat(fournitures) || 0,
    shipping: parseFloat(shipping) || 0,
    lignes: lignes
      .map((l) => {
        const q = parseFloat(l.qte) || 0;
        const p = parseFloat(l.pu) || 0;
        return { modele: l.modele, desig: l.desig, ref: l.ref, couleur: l.couleur, qte: q, pu: p, mt: q * p };
      })
      .filter((r) => r.modele || r.qte),
  });

  const collect = (): Facture | null => {
    const id = num.trim();
    if (!id) {
      toast("⚠ Indiquez un N° de facture");
      return null;
    }
    const type = typeDoc.includes("AVOIR") ? "avoir" : typeDoc.includes("PROFORMA") ? "proforma" : "facture";
    const client = CLIENTS_DB[clientSel] ? clientSel : "autre";
    const rows = lignes
      .map((l) => {
        const q = parseFloat(l.qte) || 0;
        const p = parseFloat(l.pu) || 0;
        return { modele: l.modele, desig: l.desig, ref: l.ref, couleur: l.couleur, qte: q, pu: p, mt: Math.round(q * p * 100) / 100 };
      })
      .filter((r) => r.modele || r.qte);
    const fourn = parseFloat(fournitures) || 0;
    const ship = parseFloat(shipping) || 0;
    const total = Math.round((rows.reduce((s, r) => s + r.mt, 0) + fourn + ship) * 100) / 100;
    return {
      id,
      type,
      date: date || new Date().toISOString().split("T")[0],
      client,
      marque: CLIENT_NAMES[client] || "",
      clientRaw: clientNom,
      pieces: rows.reduce((s, r) => s + r.qte, 0),
      total,
      fournitures: fourn,
      extras: ship > 0 ? [{ label: "Shipping", mt: ship }] : [],
      lignes: rows,
      poids,
      mp,
      incoterm,
      paiement,
      matieres: matieres.split("\n").filter((x) => x.trim()),
    };
  };

  const save = () => {
    const f = collect();
    if (!f) return;
    const existed = store.saveFacture(f);
    toast(existed ? `Facture ${f.id} mise à jour ✓` : `Facture ${f.id} enregistrée ✓`);
  };

  const clearForm = () => {
    setNum("");
    setClientNom("");
    setClientAdresse("");
    setLivraison("");
    setPoids("");
    setMp("");
    setColis("");
    setMatieres("");
    setFournitures("0");
    setShipping("0");
    setClientSel("");
    setDate(new Date().toISOString().split("T")[0]);
    setLignes([emptyLine()]);
    setPreview(null);
  };

  if (preview !== null) {
    return (
      <div className="page">
        <div className="preview-topbar">
          <button className="btn btn-outline" onClick={() => setPreview(null)}>
            ← Retour au formulaire
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-green" onClick={save}>
              💾 Enregistrer
            </button>
            <button className="btn btn-primary" onClick={() => printDocument(preview, "facture", `Facture ${num}`)}>
              🖨 Imprimer / PDF
            </button>
          </div>
        </div>
        <div dangerouslySetInnerHTML={{ __html: preview }} />
      </div>
    );
  }

  return (
    <div className="page">
      <div className="form-grid">
        <div className="form-group">
          <label>N° Facture</label>
          <input value={num} onChange={(e) => setNum(e.target.value)} placeholder="ex: 79/2026" />
        </div>
        <div className="form-group">
          <label>Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Type de document</label>
          <select value={typeDoc} onChange={(e) => setTypeDoc(e.target.value)}>
            <option value="FACTURE">Facture</option>
            <option value="FACTURE D'AVOIR">Facture d&apos;avoir</option>
            <option value="FACTURE PROFORMA">Facture proforma</option>
          </select>
        </div>
        <div className="form-group">
          <label>Incoterm</label>
          <select value={incoterm} onChange={(e) => setIncoterm(e.target.value)}>
            {["EX WORK", "DAP", "DDP", "FOB"].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label>Client / Donneur d&apos;ordre</label>
          <select value={clientSel} onChange={(e) => fillClientData(e.target.value)}>
            <option value="">-- Sélectionner --</option>
            <option value="gerard_darel">DS Fashion / Gérard Darel</option>
            <option value="claudie_pierlot">Callithea / Claudie Pierlot</option>
            <option value="souleiado">Souleïado</option>
            <option value="bonpoint">Bonpoint SAS</option>
            <option value="vanessa_bruno">Solune SAS / Vanessa Bruno</option>
            <option value="bash">BA&amp;SH</option>
            <option value="antonelle">Nouvelle Uja / Antonelle</option>
            <option value="patrick">Patrick Confection</option>
            <option value="custom">Autre (saisie manuelle)</option>
          </select>
        </div>
        <div className="form-group">
          <label>Nom client (en-tête facture)</label>
          <input value={clientNom} onChange={(e) => setClientNom(e.target.value)} placeholder="ex: ds fashion" />
        </div>
      </div>

      <div className="form-grid">
        <div className="form-group">
          <label>Adresse de facturation</label>
          <textarea rows={3} value={clientAdresse} onChange={(e) => setClientAdresse(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Adresse de livraison</label>
          <textarea rows={3} value={livraison} onChange={(e) => setLivraison(e.target.value)} />
        </div>
      </div>

      <div className="section-title">Lignes produits</div>
      <table className="lines-table">
        <thead>
          <tr>
            <th style={{ width: 140 }}>Modèle</th>
            <th style={{ width: 85 }}>Désignation</th>
            <th style={{ width: 100 }}>Référence</th>
            <th style={{ width: 100 }}>Couleur</th>
            <th style={{ width: 60 }}>Qté</th>
            <th style={{ width: 70 }}>P.U (€)</th>
            <th style={{ width: 85 }}>Montant</th>
            <th style={{ width: 30 }} />
          </tr>
        </thead>
        <tbody>
          {lignes.map((l, i) => {
            const mt = (parseFloat(l.qte) || 0) * (parseFloat(l.pu) || 0);
            return (
              <tr key={i}>
                <td>
                  <input value={l.modele} onChange={(e) => setLine(i, "modele", e.target.value)} />
                </td>
                <td>
                  <input value={l.desig} onChange={(e) => setLine(i, "desig", e.target.value)} />
                </td>
                <td>
                  <input value={l.ref} onChange={(e) => setLine(i, "ref", e.target.value)} />
                </td>
                <td>
                  <input value={l.couleur} onChange={(e) => setLine(i, "couleur", e.target.value)} />
                </td>
                <td>
                  <input type="number" step="1" value={l.qte} onChange={(e) => setLine(i, "qte", e.target.value)} />
                </td>
                <td>
                  <input type="number" step="0.01" value={l.pu} onChange={(e) => setLine(i, "pu", e.target.value)} />
                </td>
                <td>
                  <input readOnly value={mt ? mt.toFixed(2) : ""} style={{ background: "#FAFAF8", fontWeight: 600 }} />
                </td>
                <td>
                  <button className="remove-btn" onClick={() => removeLine(i)}>
                    ×
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button className="add-line-btn" onClick={addLine}>
        + Ajouter une ligne
      </button>

      <div className="form-grid" style={{ marginTop: 18 }}>
        <div className="form-group">
          <label>Fournitures Tunisie (€)</label>
          <input type="number" step="0.01" value={fournitures} onChange={(e) => setFournitures(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Shipping / Ps OK Livraison (€)</label>
          <input type="number" step="0.01" value={shipping} onChange={(e) => setShipping(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Poids</label>
          <input value={poids} onChange={(e) => setPoids(e.target.value)} placeholder="ex: 250 Kg" />
        </div>
        <div className="form-group">
          <label>Valeur Matière Première</label>
          <input value={mp} onChange={(e) => setMp(e.target.value)} placeholder="ex: 12500,00 eur" />
        </div>
        <div className="form-group">
          <label>Nombre de colis</label>
          <input value={colis} onChange={(e) => setColis(e.target.value)} placeholder="ex: 3 Palettes renferme 25 Cartons" />
        </div>
        <div className="form-group">
          <label>Mode de paiement</label>
          <select value={paiement} onChange={(e) => setPaiement(e.target.value)}>
            {PAIEMENTS.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </div>
        <div className="form-group full">
          <label>Matières premières (références SA / EUR1)</label>
          <textarea
            rows={2}
            value={matieres}
            onChange={(e) => setMatieres(e.target.value)}
            placeholder="Matière Première d'origine CEE et importées suite SA N°… du …"
          />
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
        <button className="btn btn-green" onClick={save}>
          💾 Enregistrer la facture
        </button>
        <button className="btn btn-primary" onClick={() => setPreview(buildFactureDocHTML(currentForm()))}>
          Aperçu
        </button>
        <button className="btn btn-outline" onClick={clearForm}>
          Réinitialiser
        </button>
      </div>
      <div className="muted-note">
        Une facture enregistrée apparaît dans le Registre, le Tableau de bord, les Marges et les Rapports. Enregistrer
        avec un N° existant met à jour la facture.
      </div>
    </div>
  );
}

// helper used to seed the preview from a loaded facture
function toFormData(f: ReturnType<typeof factToForm>): FactureForm {
  return {
    num: f.num,
    date: f.date,
    typeDoc: f.typeDoc,
    incoterm: f.incoterm,
    clientNom: f.clientNom,
    clientAdresse: f.clientAdresse,
    livraison: f.livraison,
    paiement: f.paiement,
    poids: f.poids,
    mp: f.mp,
    colis: f.colis,
    matieres: f.matieres,
    fournitures: parseFloat(f.fournitures) || 0,
    shipping: parseFloat(f.shipping) || 0,
    lignes: f.lignes
      .map((l) => {
        const q = parseFloat(l.qte) || 0;
        const p = parseFloat(l.pu) || 0;
        return { modele: l.modele, desig: l.desig, ref: l.ref, couleur: l.couleur, qte: q, pu: p, mt: q * p };
      })
      .filter((r) => r.modele || r.qte),
  };
}
