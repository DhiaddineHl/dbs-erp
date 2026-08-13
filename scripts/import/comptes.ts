import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { db, schema } from "./db";
import { cleAleatoire } from "@/lib/atelier/cle";
import { estRoleBuiltin } from "@/lib/auth/permissions";
import { Rapport, type Sauvegarde } from "./source";

const { account, role: roleTable, user } = schema;

/* Comptes utilisateurs.
 *
 * La sauvegarde contient les mots de passe en clair — « YOMNA » se connectait
 * avec « YOMNA ». Ils ne sont pas repris : réimporter des identifiants triviaux
 * reconduirait le défaut dans un système qui, lui, expose des données au
 * réseau. Chaque compte est créé avec un mot de passe aléatoire que personne
 * ne connaît, y compris nous ; l'administrateur en attribue un depuis
 * Paramètres avant la mise en service.
 *
 * L'adresse e-mail est fabriquée à partir du login : Better Auth en exige une,
 * et l'ancien système n'en avait pas. */

const email = (login: string) => `${login.trim().toLowerCase().replace(/[^a-z0-9]+/g, ".")}@dbs.local`;

export async function importerComptes(src: Sauvegarde, r: Rapport) {
  r.etape("Comptes utilisateurs");

  const rolesConnus = new Set((await db.select({ key: roleTable.key }).from(roleTable)).map((x) => x.key));

  let crees = 0;
  let existants = 0;
  const rolesManquants = new Set<string>();
  const aInitialiser: string[] = [];

  for (const u of src.users) {
    const login = r.texte(u.login);
    const nom = r.texte(u.name) || login;
    if (!login) continue;

    const adresse = email(login);
    const [deja] = await db.select({ id: user.id }).from(user).where(eq(user.email, adresse));
    if (deja) {
      existants++;
      continue;
    }

    const role = r.texte(u.role) || "analyst";
    if (!rolesConnus.has(role) && !estRoleBuiltin(role)) rolesManquants.add(role);

    const id = randomUUID();
    await db.insert(user).values({ id, name: nom, email: adresse, emailVerified: true, role });
    await db.insert(account).values({
      id: randomUUID(),
      accountId: id,
      providerId: "credential",
      userId: id,
      // Mot de passe jetable : il n'est ni affiché, ni conservé, ni utilisable.
      password: await hashPassword(cleAleatoire(32)),
    });
    crees++;
    aInitialiser.push(`${adresse} (${nom}, rôle ${role})`);
  }

  r.ok("comptes créés", crees);
  if (existants) r.info(`${existants} compte(s) déjà présents — inchangés`);
  if (rolesManquants.size) {
    r.alerte(`rôle(s) inconnu(s) affecté(s) à des comptes : ${[...rolesManquants].join(", ")} — créez-les dans Paramètres`);
  }
  if (aInitialiser.length) {
    r.alerte(
      `${aInitialiser.length} compte(s) sans mot de passe utilisable — les mots de passe en clair de la sauvegarde ` +
        `n'ont pas été repris. Attribuez-les depuis Paramètres avant la mise en service :`,
    );
    for (const a of aInitialiser) r.info(a);
  }
}
