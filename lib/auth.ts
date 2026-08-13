import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins/admin";
import { nextCookies } from "better-auth/next-js";
import { db, schema } from "@/lib/db";
import { ac, roles } from "@/lib/auth/permissions";

export const auth = betterAuth({
  appName: "PilotPro",
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  emailAndPassword: {
    enabled: true,
    // Internal ERP tool — accounts are provisioned by admins, no email flow.
    requireEmailVerification: false,
  },
  /* Les connexions et déconnexions alimentent le journal d'activité. Le hook
   * tourne après coup et ne peut pas faire échouer l'authentification : un
   * journal indisponible ne doit empêcher personne de travailler. */
  databaseHooks: {
    session: {
      create: {
        after: async (session) => {
          const { journaliserSession } = await import("@/lib/services/activite");
          await journaliserSession(session.userId, "connexion");
        },
      },
    },
  },
  plugins: [
    admin({
      ac,
      roles,
      defaultRole: "analyst",
      adminRoles: ["admin"],
    }),
    // Must be last: lets server actions set auth cookies.
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
export type AuthUser = Session["user"];
