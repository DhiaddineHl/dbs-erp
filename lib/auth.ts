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
