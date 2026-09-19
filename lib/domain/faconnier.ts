/* HISTORIQUE FAÇONNIER — des faits objectifs, pas un score (cahier des charges §14).
 *
 * On ne note pas les façonniers : on rassemble ce qui s'est réellement passé
 * (confié, expédié, reçu, conforme, retouches, retards, prix façon) pour que la
 * direction décide elle-même. Ce module fait le calcul, sans jugement.
 *
 * Pur : pas de DB, pas de React. */

/** Ce qu'on a confié à un façonnier pour un OF. */
export type Confiage = {
  faconnierId: number;
  commandeId: number;
  qteConfiee: number;
  qteExpediee: number;
  dateConfiee?: string | null;
  /** Date de retour attendue (délai convenu). */
  dateRetourPrevue?: string | null;
  prixFacon?: number | null;
};

/** Une réception (BR) rattachée à un façonnier. */
export type ReceptionFaconnier = {
  faconnierId: number;
  commandeId: number;
  date?: string | null;
  qteRecue: number;
  qteOk: number;
  qteNc: number;
};

export type BilanFaconnier = {
  faconnierId: number;
  /** Nombre d'OF distincts confiés. */
  ofConfies: number;
  qteConfiee: number;
  qteExpediee: number;
  qteRecue: number;
  qteConforme: number;
  qteNonConforme: number;
  /** Reçu mais pas encore rendu conforme + reste à recevoir. */
  qteEnCours: number;
  /** Taux de conformité en % (conforme / reçu), null si rien reçu. */
  tauxConformite: number | null;
  /** Retard moyen en jours sur les OF reçus avec une échéance (positif = en retard). */
  retardMoyenJours: number | null;
  /** CA façon confié (Σ qteConfiee × prixFacon). */
  caConfie: number;
};

const joursEntre = (a?: string | null, b?: string | null): number | null => {
  if (!a || !b) return null;
  const da = Date.parse(`${a}T00:00:00`);
  const db = Date.parse(`${b}T00:00:00`);
  if (Number.isNaN(da) || Number.isNaN(db)) return null;
  return Math.round((db - da) / 86_400_000);
};

/**
 * Bilan par façonnier à partir des confiages et des réceptions.
 * Retards : mesurés sur les OF ayant à la fois une date de retour prévue et une
 * date de réception, moyenne des écarts (réel − prévu).
 */
export function bilansFaconniers(
  confiages: readonly Confiage[],
  receptions: readonly ReceptionFaconnier[],
): BilanFaconnier[] {
  const parId = new Map<number, BilanFaconnier>();
  const ofSet = new Map<number, Set<number>>();
  const retards = new Map<number, number[]>();
  // Dernière échéance connue par (faconnier, commande), pour dater les retards.
  const echeance = new Map<string, string>();

  const init = (id: number): BilanFaconnier => {
    let b = parId.get(id);
    if (!b) {
      b = {
        faconnierId: id,
        ofConfies: 0,
        qteConfiee: 0,
        qteExpediee: 0,
        qteRecue: 0,
        qteConforme: 0,
        qteNonConforme: 0,
        qteEnCours: 0,
        tauxConformite: null,
        retardMoyenJours: null,
        caConfie: 0,
      };
      parId.set(id, b);
      ofSet.set(id, new Set());
    }
    return b;
  };

  for (const c of confiages) {
    const b = init(c.faconnierId);
    ofSet.get(c.faconnierId)!.add(c.commandeId);
    b.qteConfiee += c.qteConfiee || 0;
    b.qteExpediee += c.qteExpediee || 0;
    b.caConfie += (c.qteConfiee || 0) * (c.prixFacon || 0);
    if (c.dateRetourPrevue) echeance.set(`${c.faconnierId}:${c.commandeId}`, c.dateRetourPrevue);
  }

  for (const r of receptions) {
    const b = init(r.faconnierId);
    ofSet.get(r.faconnierId)!.add(r.commandeId);
    b.qteRecue += r.qteRecue || 0;
    b.qteConforme += r.qteOk || 0;
    b.qteNonConforme += r.qteNc || 0;
    const prevue = echeance.get(`${r.faconnierId}:${r.commandeId}`);
    const ecart = joursEntre(prevue, r.date);
    if (ecart !== null) {
      const liste = retards.get(r.faconnierId) ?? [];
      liste.push(ecart);
      retards.set(r.faconnierId, liste);
    }
  }

  for (const b of parId.values()) {
    b.ofConfies = ofSet.get(b.faconnierId)?.size ?? 0;
    b.qteEnCours = Math.max(0, b.qteConfiee - b.qteRecue) + Math.max(0, b.qteRecue - b.qteConforme - b.qteNonConforme);
    b.tauxConformite = b.qteRecue > 0 ? Math.round((b.qteConforme / b.qteRecue) * 100) : null;
    const rets = retards.get(b.faconnierId);
    b.retardMoyenJours = rets && rets.length ? Math.round(rets.reduce((s, x) => s + x, 0) / rets.length) : null;
    b.caConfie = Math.round(b.caConfie * 100) / 100;
  }

  return [...parId.values()].sort((a, b) => b.qteConfiee - a.qteConfiee);
}
