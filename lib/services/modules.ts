/* Entités pilotées par le tableau éditable partagé (<EditableTable>).
 *
 * Les anciennes tables génériques `m_*` (gammes, capacité, costing,
 * ordonnancement, OF, QRQC, plans d'actions…) ont été supprimées (migration
 * 0035) : leurs chiffres étaient écrits en dur, et ce qu'elles montraient vit
 * maintenant dans la GPAO, la Rentabilité et les actions du Contrôle qualité.
 * Restent les trois référentiels, servis par lib/actions/commandes.ts. */
export type EntityName = "client" | "commande" | "faconnier";
