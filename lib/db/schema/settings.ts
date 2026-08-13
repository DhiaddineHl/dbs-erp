import { boolean, index, jsonb, pgTable, primaryKey, serial, text, timestamp } from "drizzle-orm/pg-core";

/** Rôles de l'application.
 *
 * Les quatre rôles historiques sont marqués `builtin` : ils sont adossés au
 * plugin admin de Better Auth, dont les statements sont figés à la compilation.
 * Tous les autres sont créés depuis l'écran Paramètres — DBS en utilise huit
 * (modéliste, magasin tissu, magasin fournitures, coupe, contrôle qualité…),
 * et rien dans le code ne les connaît : leur pouvoir tient entièrement à la
 * matrice `role_permission`. */
export const role = pgTable("role", {
  key: text().primaryKey(),
  label: text().notNull(),
  /** Couleur du badge, telle que choisie par l'administrateur. */
  color: text().notNull().default("#64748b"),
  builtin: boolean().notNull().default(false),
  createdAt: timestamp().notNull().defaultNow(),
});

/** Journal d'activité serveur.
 *
 * L'original vivait dans le localStorage de chaque poste, plafonné à 3000
 * entrées et fusionné à la main entre navigateurs. Ici il est écrit côté
 * serveur, donc ni perdable ni falsifiable depuis le client. */
export const activityLog = pgTable(
  "activity_log",
  {
    id: serial().primaryKey(),
    ts: timestamp().notNull().defaultNow(),
    userId: text(),
    /* Recopiés : le journal doit rester lisible après suppression du compte. */
    userName: text().notNull().default(""),
    role: text().notNull().default(""),
    /** connexion | deconnexion | creation | modification | suppression | … */
    action: text().notNull(),
    /** Module ou écran concerné. */
    cible: text().notNull().default(""),
    detail: text().notNull().default(""),
  },
  (t) => [index("activity_ts_idx").on(t.ts), index("activity_action_idx").on(t.action)],
);

/** Editable per-role module-access matrix that drives nav + route guards. */
export const rolePermission = pgTable(
  "role_permission",
  {
    role: text().notNull(),
    moduleId: text().notNull(),
    allowed: boolean().notNull().default(true),
  },
  (t) => [primaryKey({ columns: [t.role, t.moduleId] })],
);

/** Generic key/value application settings (e.g. prixFacon). */
export const appSetting = pgTable("app_setting", {
  key: text().primaryKey(),
  value: jsonb().$type<unknown>().notNull(),
});
