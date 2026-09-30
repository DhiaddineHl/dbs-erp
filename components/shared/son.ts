/* Petits signaux sonores de l'application (messagerie, scan en rafale).
 * Synthétisés sur place : aucun fichier audio à charger, rien si le
 * navigateur n'a pas de son — l'alerte visuelle suffit alors. */

type Note = { f: number; t: number; d?: number; type?: OscillatorType };

export function jouerNotes(notes: Note[], volume = 0.25) {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    let fin = 0;
    for (const { f, t, d = 0.25, type = "sine" } of notes) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(volume, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + d);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + d + 0.05);
      fin = Math.max(fin, t + d);
    }
    setTimeout(() => ctx.close(), (fin + 0.5) * 1000);
  } catch {
    /* navigateur sans son */
  }
}

/** Retour d'un scan : bip aigu = ajouté, double bip doux = déjà scanné,
 * son grave = refusé. */
export function bipScan(ton: "ok" | "deja" | "erreur") {
  if (ton === "ok") jouerNotes([{ f: 1320, t: 0, d: 0.12, type: "square" }], 0.12);
  else if (ton === "deja") jouerNotes([{ f: 660, t: 0, d: 0.08 }, { f: 660, t: 0.12, d: 0.08 }], 0.15);
  else jouerNotes([{ f: 220, t: 0, d: 0.35, type: "sawtooth" }], 0.15);
}
