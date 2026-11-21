import { getUser, userRole, utilisateurAvecModule } from "@/lib/auth/server";
import { vueMagasin } from "@/lib/services/magasin-vue";
import { excelEtatStock } from "@/lib/coupe/etat-stock-excel";

/* Télécharge l'état du stock du magasin produits finis (Excel), complet ou
 * pour un client : …/magasin/etat-stock[?client=Lacoste France] */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getUser();
  if (!user) return new Response("Non authentifié", { status: 401 });
  if (!(await utilisateurAvecModule("magasin"))) return new Response("Accès refusé", { status: 403 });
  const client = new URL(req.url).searchParams.get("client") ?? "";
  const { commandes } = await vueMagasin();
  const lignes = commandes.filter((c) => c.stockQte > 0 && (!client || c.client === client));
  const fichier = await excelEtatStock(lignes, {
    avecValeur: ["admin", "resp"].includes(userRole(user)),
    titre: client ? `ÉTAT DU STOCK — ${client}` : "ÉTAT DU STOCK — PRODUITS FINIS",
  });
  const nom = `Etat_du_stock_${(client || "complet").replace(/[^\w-]+/g, "_")}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new Response(new Uint8Array(fichier), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nom}"`,
      "Cache-Control": "no-store",
    },
  });
}
