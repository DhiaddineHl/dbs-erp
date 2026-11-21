import { exigerModule, userRole } from "@/lib/auth/server";
import { ROLES_SAISIE_MAGASIN } from "@/lib/domain/aval";
import { vueMagasin } from "@/lib/services/magasin-vue";
import { MagasinClient, type Onglet } from "./magasin-client";

const ONGLETS: Onglet[] = ["aujourdhui", "clients", "facon", "receptions", "mouvements"];
/** Anciennes adresses (?onglet=stock) : l'onglet « Stock » est devenu « Par client ». */
const ANCIENS: Record<string, Onglet> = { stock: "clients" };

export const dynamic = "force-dynamic";

/* Magasin produits finis — module unique (fusion de « Réception ST » et de
 * « Produits finis ») : ce qu'il y a en stock, pour qui (par client), d'où
 * ça vient (par façonnier), ce qu'il faut faire aujourd'hui, les entrées et
 * le journal des mouvements. Le stock se lit aussi par taille. */
export default async function MagasinPage({ searchParams }: { searchParams: Promise<{ onglet?: string }> }) {
  const user = await exigerModule("magasin");
  const role = userRole(user);
  const { onglet } = await searchParams;
  const vue = await vueMagasin();
  const choisi = ANCIENS[onglet ?? ""] ?? (ONGLETS.includes(onglet as Onglet) ? (onglet as Onglet) : "aujourdhui");
  return (
    <>
      {/* Les livraisons annoncées par les ateliers sont dans « Aujourd'hui ». */}
      <MagasinClient vue={vue} peutSaisir={ROLES_SAISIE_MAGASIN.includes(role)} peutVoirValeur={["admin", "resp"].includes(role)} ongletInitial={choisi} />
    </>
  );
}
