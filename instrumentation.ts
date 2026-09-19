/* Point d'entrée exécuté une fois au démarrage du serveur (Next.js
 * `instrumentation`), avant de servir la moindre requête.
 *
 * On y fixe le FUSEAU MÉTIER de DBS (Nabeul, Tunisie — UTC+1). Sans cela,
 * l'hébergement (Railway/NIXPACKS) tourne en UTC : toutes les fonctions de date
 * côté serveur (`todayISO`, `joursJusqua`, `defaultNow`…) calculent alors une
 * journée UTC, et « aujourd'hui » bascule à 01 h locale — une journée de
 * production créée en tout début de matinée serait datée de la veille.
 *
 * On ne l'impose que si `TZ` n'est pas déjà défini, pour qu'une variable
 * d'environnement Railway (`TZ=Africa/Tunis`, recommandée en complément) reste
 * prioritaire. Node ré-applique le fuseau dès l'affectation de `process.env.TZ`. */
export function register() {
  if (!process.env.TZ) {
    process.env.TZ = "Africa/Tunis";
  }
}
