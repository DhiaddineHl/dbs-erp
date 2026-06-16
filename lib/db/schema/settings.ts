import { boolean, jsonb, pgTable, primaryKey, text } from "drizzle-orm/pg-core";

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
