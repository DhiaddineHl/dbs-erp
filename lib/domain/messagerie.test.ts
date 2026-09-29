import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { apercu, cleDirect, etatLecture, initiales, mimeDe, nomConversation, presenceTexte, texteMessage } from "./messagerie";

describe("messagerie", () => {
  it("une seule discussion directe par paire", () => assert.equal(cleDirect("b", "a"), cleDirect("a", "b")));
  it("texte vide refusé, espaces nettoyés", () => {
    assert.equal(texteMessage("   \n "), null);
    assert.equal(texteMessage("  Bonjour  "), "Bonjour");
  });
  it("accusés de lecture ✓ / ✓✓ gris / ✓✓ bleu", () => {
    assert.equal(etatLecture([], ["u2", "u3"]), "envoye");
    assert.equal(etatLecture(["u2"], ["u2", "u3"]), "lu_partiel");
    assert.equal(etatLecture(["u3", "u2"], ["u2", "u3"]), "lu");
  });
  it("nom : groupe ou l'autre personne", () => {
    const membres = [
      { userId: "moi", nom: "Yomna" },
      { userId: "x", nom: "Chef coupe" },
    ];
    assert.equal(nomConversation({ type: "direct", nom: "" }, membres, "moi"), "Chef coupe");
    assert.equal(nomConversation({ type: "groupe", nom: "Chaîne 2" }, membres, "moi"), "Chaîne 2");
  });
  it("aperçu", () => {
    const base = { genre: "texte", texte: "", fichierNom: "", fichierMime: "", commandeLabel: "", supprime: false };
    assert.equal(apercu({ ...base, texte: "Vérifiez la laize" }), "Vérifiez la laize");
    assert.equal(apercu({ ...base, fichierNom: "fiche.pdf", fichierMime: "application/pdf" }), "📎 fiche.pdf");
    assert.equal(apercu({ ...base, fichierNom: "p.jpg", fichierMime: "image/jpeg" }), "📷 Photo");
    assert.equal(apercu({ ...base, texte: "x", supprime: true }), "🚫 Message supprimé");
  });
  it("type de fichier déduit de l'extension", () => {
    assert.equal(mimeDe("planning.xlsx", ""), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    assert.equal(mimeDe("photo.JPG", "application/octet-stream"), "image/jpeg");
  });
  it("initiales et présence", () => {
    assert.equal(initiales("Yomna Ben Ali"), "YA");
    const t = Date.parse("2026-09-29T10:00:00");
    assert.equal(presenceTexte(new Date(t - 30_000).toISOString(), t), "en ligne");
    assert.match(presenceTexte(new Date(t - 3_600_000).toISOString(), t), /vu aujourd'hui/);
  });
});
