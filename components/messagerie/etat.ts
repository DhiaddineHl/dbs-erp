"use client";

import { useSyncExternalStore } from "react";
import { jouerNotes } from "@/components/shared/son";

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
  jouerNotes([
    { f: 880, t: 0 },
    { f: 1175, t: 0.12 },
  ]);
}
