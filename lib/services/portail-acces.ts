import "server-only";
import { createHmac, randomInt, scrypt as scryptCb, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/lib/db";
import { client, faconnier, portailAcces, portailEvenement } from "@/lib/db/schema";
import { cleAleatoire } from "@/lib/atelier/cle";
import * as pt from "@/lib/domain/portail";
import { creerFilPortail } from "@/lib/services/messagerie";

/* ACCÈS AUX PORTAILS EXTÉRIEURS — clés, PIN, mémoire du téléphone, journal.
 *
 * Commun au portail client et au portail sous-traitant : une seule façon
 * d'entrer, de couper un accès, de regénérer une clé ou un PIN. */

const scrypt = promisify(scryptCb) as (pwd: string, salt: Buffer, len: number) => Promise<Buffer>;

export type TypeAcces = "client" | "soustraitant";
export type Acces = typeof portailAcces.$inferSelect;

/* ─────────── PIN ─────────── */

async function hacher(pin: string): Promise<string> {
  const sel = randomBytes(16);
  const h = await scrypt(pin, sel, 32);
  return `s1$${sel.toString("base64url")}$${h.toString("base64url")}`;
}

async function pinCorrect(pin: string, stocke: string): Promise<boolean> {
  const [v, sel, h] = stocke.split("$");
  if (v !== "s1" || !sel || !h) return false;
  const attendu = Buffer.from(h, "base64url");
  const calcule = await scrypt(pin, Buffer.from(sel, "base64url"), attendu.length);
  return calcule.length === attendu.length && timingSafeEqual(calcule, attendu);
}

export const nouveauPin = () => String(randomInt(0, 10 ** pt.PIN_LONGUEUR)).padStart(pt.PIN_LONGUEUR, "0");

/* ─────────── mémoire du téléphone (cookie signé) ─────────── */

const secret = () => process.env.BETTER_AUTH_SECRET || process.env.AUTH_SECRET || "pilotpro-portail";
const nomCookie = (id: number) => `pp_portail_${id}`;
const signer = (charge: string) => createHmac("sha256", secret()).update(charge).digest("base64url");

/** Le téléphone a-t-il déjà donné le bon PIN (et ce PIN est-il toujours le bon) ? */
export async function telephoneReconnu(a: Acces): Promise<boolean> {
  if (!a.pinHash) return true;
  const c = (await cookies()).get(nomCookie(a.id))?.value ?? "";
  const [id, version, expire, sig] = c.split(".");
  if (!sig || Number(id) !== a.id || Number(version) !== a.pinVersion || Number(expire) < Date.now()) return false;
  const attendu = signer(`${id}.${version}.${expire}`);
  return attendu.length === sig.length && timingSafeEqual(Buffer.from(attendu), Buffer.from(sig));
}

async function memoriserTelephone(a: Acces) {
  const expire = Date.now() + pt.PIN_MEMOIRE_JOURS * 86_400_000;
  const charge = `${a.id}.${a.pinVersion}.${expire}`;
  (await cookies()).set(nomCookie(a.id), `${charge}.${signer(charge)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: pt.PIN_MEMOIRE_JOURS * 86_400,
  });
}

/* ─────────── lecture ─────────── */

/** L'accès d'une clé, s'il existe, est actif et du bon type. */
export async function accesParCle(cle: string, type: TypeAcces): Promise<Acces | null> {
  const c = (cle ?? "").trim();
  if (c.length < 16 || c.length > 64) return null;
  const [a] = await db.select().from(portailAcces).where(eq(portailAcces.cle, c));
  if (!a || !a.actif || a.type !== type) return null;
  return a;
}

/** Accès autorisé pour une action du portail : clé valable ET téléphone
 * reconnu (PIN). Lève une erreur sinon — chaque action la vérifie. */
export async function accesAutorise(cle: string, type: TypeAcces): Promise<Acces> {
  const a = await accesParCle(cle, type);
  if (!a) throw new Error("Lien invalide ou désactivé.");
  if (!(await telephoneReconnu(a))) throw new Error("Code PIN demandé : rouvrez le lien.");
  return a;
}

export async function entrerPin(cle: string, type: TypeAcces, pin: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const a = await accesParCle(cle, type);
  if (!a) return { ok: false, error: "Lien invalide ou désactivé." };
  const maintenant = new Date();
  const bloque = pt.refusBlocage(a.bloqueJusqua, maintenant);
  if (bloque) return { ok: false, error: bloque };
  if (!pt.pinValide(pin) || !(await pinCorrect(pin.trim(), a.pinHash))) {
    const e = pt.apresEchec(a.echecs, maintenant);
    await db.update(portailAcces).set({ echecs: e.echecs, bloqueJusqua: e.bloqueJusqua }).where(eq(portailAcces.id, a.id));
    await journal(a.id, "pin_echec", null, e.bloqueJusqua ? "bloqué 15 min" : `${e.echecs} échec(s)`);
    return { ok: false, error: e.bloqueJusqua ? pt.refusBlocage(e.bloqueJusqua, maintenant)! : `Code incorrect (${pt.PIN_ESSAIS - e.echecs} essai(s) restant(s)).` };
  }
  await db.update(portailAcces).set({ echecs: 0, bloqueJusqua: null }).where(eq(portailAcces.id, a.id));
  await memoriserTelephone(a);
  return { ok: true };
}

/** Une visite : au plus une ligne de journal par heure (le portail se
 * recharge souvent), le compteur et la date de dernière visite à chaque fois. */
export async function noterVisite(a: Acces) {
  const maintenant = new Date();
  await db
    .update(portailAcces)
    .set({ derniereVisite: maintenant, nbVisites: a.nbVisites + 1 })
    .where(eq(portailAcces.id, a.id));
  const [recent] = await db
    .select({ id: portailEvenement.id })
    .from(portailEvenement)
    .where(and(eq(portailEvenement.accesId, a.id), eq(portailEvenement.type, "visite"), gte(portailEvenement.createdAt, new Date(maintenant.getTime() - 3_600_000))))
    .limit(1);
  if (!recent) await journal(a.id, "visite", null, "");
}

export async function journal(accesId: number, type: string, commandeId: number | null, detail: string) {
  await db.insert(portailEvenement).values({ accesId, type, commandeId, detail: detail.slice(0, 500) });
}

/* ─────────── gestion (bureau) ─────────── */

export type AccesVue = Acces & { cible: string; evenements: { type: string; detail: string; le: string }[] };

export async function listAcces(): Promise<AccesVue[]> {
  const [rows, clients, ateliers, evts] = await Promise.all([
    db.select().from(portailAcces).orderBy(desc(portailAcces.id)),
    db.select({ id: client.id, nom: client.nom }).from(client),
    db.select({ id: faconnier.id, nom: faconnier.nom }).from(faconnier),
    db.select().from(portailEvenement).orderBy(desc(portailEvenement.id)).limit(400),
  ]);
  const nomClient = new Map(clients.map((c) => [c.id, c.nom]));
  const nomAtelier = new Map(ateliers.map((c) => [c.id, c.nom]));
  return rows.map((a) => ({
    ...a,
    pinHash: a.pinHash ? "•" : "",
    cible: a.type === "client" ? (nomClient.get(a.clientId ?? -1) ?? "?") : (nomAtelier.get(a.faconnierId ?? -1) ?? "?"),
    evenements: evts
      .filter((e) => e.accesId === a.id)
      .slice(0, 12)
      .map((e) => ({ type: e.type, detail: e.detail, le: e.createdAt.toISOString() })),
  }));
}

export async function creerAcces(v: { type: TypeAcces; cibleId: number; nom: string; avecPin: boolean }, par: string): Promise<{ id: number; cle: string; pin: string }> {
  if (v.type !== "client" && v.type !== "soustraitant") throw new Error("Type d'accès inconnu.");
  const nom = (v.nom ?? "").trim().slice(0, 80);
  if (!nom) throw new Error("Indiquez qui utilisera cet accès (ex. « Marie — acheteuse »).");
  let cibleNom = "";
  if (v.type === "client") {
    const [c] = await db.select({ nom: client.nom }).from(client).where(eq(client.id, v.cibleId));
    if (!c) throw new Error("Client introuvable.");
    cibleNom = c.nom;
  } else {
    const [f] = await db.select({ nom: faconnier.nom }).from(faconnier).where(eq(faconnier.id, v.cibleId));
    if (!f) throw new Error("Sous-traitant introuvable.");
    cibleNom = f.nom;
  }
  // Un sous-traitant a TOUJOURS un PIN (règle validée) ; un client, au choix.
  const pin = v.type === "soustraitant" || v.avecPin ? nouveauPin() : "";
  const conversationId = await creerFilPortail(`🌐 ${v.type === "client" ? "Client" : "Sous-traitant"} · ${cibleNom} · ${nom}`);
  const [row] = await db
    .insert(portailAcces)
    .values({
      cle: cleAleatoire(32),
      type: v.type,
      clientId: v.type === "client" ? v.cibleId : null,
      faconnierId: v.type === "soustraitant" ? v.cibleId : null,
      nom,
      pinHash: pin ? await hacher(pin) : "",
      conversationId,
      creePar: par,
    })
    .returning({ id: portailAcces.id, cle: portailAcces.cle });
  return { id: row.id, cle: row.cle, pin };
}

/** Nouvelle clé : l'ancien lien et l'ancien QR cessent de marcher. */
export async function regenererCle(id: number): Promise<string> {
  const cle = cleAleatoire(32);
  await db.update(portailAcces).set({ cle }).where(eq(portailAcces.id, id));
  await journal(id, "cle", null, "nouvelle clé (ancien lien coupé)");
  return cle;
}

/** Nouveau PIN : tous les téléphones mémorisés devront le retaper. */
export async function regenererPin(id: number): Promise<string> {
  const [a] = await db.select().from(portailAcces).where(eq(portailAcces.id, id));
  if (!a) throw new Error("Accès introuvable.");
  const pin = nouveauPin();
  await db
    .update(portailAcces)
    .set({ pinHash: await hacher(pin), pinVersion: a.pinVersion + 1, echecs: 0, bloqueJusqua: null })
    .where(eq(portailAcces.id, id));
  await journal(id, "pin", null, "nouveau PIN (téléphones déconnectés)");
  return pin;
}

export async function retirerPin(id: number) {
  const [a] = await db.select().from(portailAcces).where(eq(portailAcces.id, id));
  if (!a) throw new Error("Accès introuvable.");
  if (a.type === "soustraitant") throw new Error("Un accès sous-traitant garde toujours son PIN.");
  await db.update(portailAcces).set({ pinHash: "", pinVersion: a.pinVersion + 1 }).where(eq(portailAcces.id, id));
}

export async function activerAcces(id: number, actif: boolean) {
  await db.update(portailAcces).set({ actif }).where(eq(portailAcces.id, id));
  await journal(id, actif ? "active" : "coupe", null, actif ? "accès rouvert" : "accès coupé");
}
