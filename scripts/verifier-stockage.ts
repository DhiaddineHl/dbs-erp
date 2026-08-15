/**
 * Vérifie que le stockage objet répond : dépôt, relecture, effacement.
 *
 *   npm run verif:stockage
 *
 * N'écrit rien en base — seulement un objet de test, retiré à la fin. À lancer
 * après avoir posé les variables AWS_* sur le service (voir DEPLOY.md).
 */

import { createHash } from "node:crypto";
import { chargerEnv } from "./import/db";

chargerEnv();

async function main() {
  const { deposer, recuperer, supprimer, cleFichier, stockageConfigure } = await import("../lib/services/stockage");

  if (!stockageConfigure()) {
    console.error("Stockage objet non configuré — variables AWS_* absentes.");
    console.error("Railway : railway bucket credentials --bucket <nom>");
    process.exit(1);
  }

  console.log(`Bucket   : ${process.env.AWS_S3_BUCKET_NAME}`);
  console.log(`Endpoint : ${process.env.AWS_ENDPOINT_URL}`);
  console.log(`Style    : ${process.env.AWS_S3_URL_STYLE || "virtual-host"}\n`);

  // Un contenu unique par exécution, pour ne jamais tomber sur un reste.
  const contenu = Buffer.from(`vérification stockage DBS — ${new Date().toISOString()}\n`);
  const hash = createHash("sha256").update(contenu).digest("hex");
  console.log(`clé : ${cleFichier(hash)}`);

  process.stdout.write("  dépôt……… ");
  await deposer(hash, contenu, "application/pdf");
  console.log("ok");

  process.stdout.write("  relecture… ");
  const flux = await recuperer(hash);
  if (!flux) throw new Error("objet introuvable juste après le dépôt");
  const relu = Buffer.from(await new Response(flux).arrayBuffer());
  if (!relu.equals(contenu)) throw new Error(`octets différents (${relu.length} au lieu de ${contenu.length})`);
  console.log(`ok — ${relu.length} octets, identiques`);

  process.stdout.write("  effacement… ");
  await supprimer(hash);
  const apres = await recuperer(hash);
  if (apres) throw new Error("l'objet est encore là après effacement");
  console.log("ok");

  console.log("\nStockage objet opérationnel.");
}

main().catch((e) => {
  console.error(`\nÉchec : ${e.message}`);
  process.exit(1);
});
