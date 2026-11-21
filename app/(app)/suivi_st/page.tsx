import { Truck } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { exigerModule, userRole } from "@/lib/auth/server";
import { ROLES_SAISIE_MAGASIN } from "@/lib/domain/aval";
import { MOTIFS_ECART } from "@/lib/domain/coupe";
import { suiviSt } from "@/lib/services/suivi-soustraitants";
import { SuiviStClient } from "./suivi-st-client";

/* SUIVI DES SOUS-TRAITANTS — ce que les ateliers déclarent sur leur portail
 * (saisie du soir, livraisons, tissu reçu, rapports de coupe), à côté de ce
 * que vous avez validé. Une livraison se valide à l'arrivée : le BR naît. */

export const dynamic = "force-dynamic";

export default async function SuiviStPage() {
  const user = await exigerModule("suivi_st");
  const role = userRole(user);
  const vue = await suiviSt();
  return (
    <>
      <PageHeader
        icon={Truck}
        title="Suivi sous-traitants"
        description="Ce que les ateliers déclarent chaque soir et livrent — à valider à l'arrivée de la marchandise. Les déclarations ne comptent jamais comme production."
      />
      <SuiviStClient
        vue={vue}
        motifsCoupe={MOTIFS_ECART.map((m) => ({ value: m.value, label: m.label }))}
        peutValider={role === "admin" || ROLES_SAISIE_MAGASIN.includes(role)}
        peutRegler={["admin", "resp"].includes(role)}
      />
    </>
  );
}
