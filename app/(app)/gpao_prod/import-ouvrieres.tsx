"use client";

import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import type { Chaine } from "./store";

export type LigneOuvriere = { nom: string; poste: string; sam: number };

/* Trois colonnes : Nom | Poste | SAM. L'en-tête est facultatif — on le détecte
 * à ce qu'il n'a pas de quantité lisible en 3e colonne. */

function versLignes(matrice: unknown[][]): LigneOuvriere[] {
  const out: LigneOuvriere[] = [];
  for (const [i, brute] of matrice.entries()) {
    const nom = String(brute?.[0] ?? "").trim();
    const poste = String(brute?.[1] ?? "").trim();
    const samBrut = String(brute?.[2] ?? "").replace(",", ".").trim();
    const sam = Math.round(parseFloat(samBrut));
    if (!nom) continue;
    // Première ligne sans SAM lisible : c'est un en-tête, pas une ouvrière.
    if (i === 0 && !Number.isFinite(sam)) continue;
    out.push({ nom, poste, sam: Number.isFinite(sam) && sam > 0 ? sam : 100 });
  }
  return out;
}

const depuisColle = (texte: string): LigneOuvriere[] =>
  versLignes(
    texte
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => l.split("\t")),
  );

/** Import d'ouvrières dans une chaîne : fichier Excel/CSV, ou collage direct
 * depuis Excel. Le collage est le chemin réel — l'agent a déjà le tableau
 * ouvert et ne veut pas fabriquer un fichier pour l'occasion. */
export function ImportOuvrieresModal({
  chaines,
  chaineId: chaineInitiale,
  onClose,
  onImport,
}: {
  chaines: Chaine[];
  chaineId: number;
  onClose: () => void;
  onImport: (chaineId: number, lignes: LigneOuvriere[]) => void;
}) {
  const [chaineId, setChaineId] = useState(chaineInitiale || chaines[0]?.id || 0);
  const [lignes, setLignes] = useState<LigneOuvriere[]>([]);
  const [erreur, setErreur] = useState("");
  const fichierRef = useRef<HTMLInputElement>(null);

  const lireFichier = async (f: File) => {
    setErreur("");
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { type: "array", raw: false });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) return setErreur("Feuille introuvable dans le fichier.");
      const matrice = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
      const l = versLignes(matrice);
      if (!l.length) return setErreur("Aucune ligne exploitable — attendu : Nom | Poste | SAM.");
      setLignes(l);
    } catch {
      setErreur("Fichier illisible.");
    }
  };

  return (
    <div className="gp-ovl" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="gp-mdl gp-mdl-wide">
        <h2>📥 Importer des ouvrières</h2>
        <div className="note">
          Trois colonnes : <b>Nom</b> | <b>Poste / opération</b> | <b>SAM (secondes)</b>. La première ligne peut être un
          en-tête, elle est détectée toute seule. Chaque ligne alimente aussi le catalogue d&apos;opérations et le
          registre du personnel.
        </div>

        <div className="fld">
          <label>Chaîne de destination</label>
          <select value={chaineId} onChange={(e) => setChaineId(+e.target.value)}>
            {chaines.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom} ({c.ouvrieres.length} ouvrières)
              </option>
            ))}
          </select>
        </div>

        <div className="r2">
          <div className="fld">
            <label>① Depuis un fichier</label>
            <input
              ref={fichierRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void lireFichier(f);
              }}
            />
          </div>
          <div className="fld">
            <label>② Ou coller depuis Excel (Ctrl+V)</label>
            <textarea
              rows={4}
              placeholder={"Fadila\tRepassage\t95\nWided\tAssemblage\t75"}
              onChange={(e) => {
                setErreur("");
                setLignes(depuisColle(e.target.value));
              }}
            />
          </div>
        </div>

        {erreur && <div className="gp-alerte">{erreur}</div>}

        {lignes.length > 0 && (
          <div className="twrap" style={{ maxHeight: 240, overflowY: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 26 }}>#</th>
                  <th style={{ textAlign: "left" }}>Nom</th>
                  <th style={{ textAlign: "left" }}>Poste</th>
                  <th>SAM</th>
                  <th>Obj/H</th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((l, i) => (
                  <tr key={`${l.nom}-${i}`}>
                    <td style={{ color: "#aab" }}>{i + 1}</td>
                    <td className="lft">{l.nom}</td>
                    <td className="lft">{l.poste || "—"}</td>
                    <td>{l.sam}</td>
                    <td style={{ color: "var(--blue)", fontWeight: 700 }}>{(3600 / l.sam).toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="macts">
          <button className="btn" onClick={onClose}>
            Annuler
          </button>
          <button
            className="btn primary"
            disabled={!lignes.length || !chaineId}
            onClick={() => onImport(chaineId, lignes)}
          >
            Importer {lignes.length} ouvrière(s)
          </button>
        </div>
      </div>
    </div>
  );
}
