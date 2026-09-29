"use client";

import { useSyncExternalStore } from "react";

/* État partagé de la messagerie côté navigateur : le nombre de non lus (menu,
 * bouton flottant, titre de l'onglet) et la discussion affichée à l'écran (on
 * n'alerte pas pour un message qu'on est déjà en train de lire). */

const etat = { nonLus: 0, ouverte: null as number | null };
const abonnes = new Set<() => void>();
const prevenir = () => abonnes.forEach((f) => f());
const abonner = (f: () => void) => {
  abonnes.add(f);
  return () => abonnes.delete(f);
};

export function majNonLus(n: number) {
  if (n === etat.nonLus) return;
  etat.nonLus = n;
  prevenir();
}
export const useNonLus = () => useSyncExternalStore(abonner, () => etat.nonLus, () => 0);

export function setConversationOuverte(id: number | null) {
  etat.ouverte = id;
}
export const conversationOuverte = () => etat.ouverte;

/** Petit « ding » (sans fichier son) : deux notes brèves. */
export function jouerSon() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const note = (f: number, t: number) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.25);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.3);
    };
    note(880, 0);
    note(1175, 0.12);
    setTimeout(() => ctx.close(), 800);
  } catch {
    /* navigateur sans son : l'alerte visuelle suffit */
  }
}
