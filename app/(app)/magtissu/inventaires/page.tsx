import Link from "next/link";
import { requireUser, userRole } from "@/lib/auth/server";
import { peutModifier } from "@/lib/domain/feux";
import { getRoleModules } from "@/lib/services/permissions";
import { listInventaires } from "@/lib/services/rouleaux";
import { SectionPanel } from "@/components/shared/section-panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { OuvrirInventaireBureau } from "./inventaires-client";

const dateFr = (iso: string) => (iso ? new Date(iso).toLocaleDateString("fr-FR") : "—");

/* Inventaires par scan des rouleaux. Le scan se fait au téléphone
 * (/m/tissu/inventaire) ; ici on suit l'avancement et on clôture. */
export default async function InventairesPage() {
  const user = await requireUser();
  const role = userRole(user);
  const [invs, modules] = await Promise.all([listInventaires(), getRoleModules(role)]);
  const peutSaisir = peutModifier("tissu", role) || modules.magtissu === true;
  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/magtissu?onglet=rouleaux" className="text-xs font-semibold text-muted-foreground hover:underline">
          ← Magasin tissu
        </Link>
        <h1 className="text-lg font-bold">Inventaires tissu par scan</h1>
        <span className="text-xs text-muted-foreground">le scan se fait au téléphone : /m/tissu/inventaire</span>
      </div>
      {peutSaisir && <OuvrirInventaireBureau />}
      <SectionPanel title={`Inventaires (${invs.length})`} flush>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-muted/40 text-[10px] uppercase text-muted-foreground">
              <th className="px-3 py-2 text-left">N°</th>
              <th className="px-3 py-2 text-left">Zone</th>
              <th className="px-3 py-2 text-left">Ouvert</th>
              <th className="px-3 py-2 text-left">Statut</th>
              <th className="px-3 py-2 text-right">Trouvés</th>
              <th className="px-3 py-2 text-right">Manquants</th>
              <th className="px-3 py-2 text-right">Inconnus</th>
              <th className="px-3 py-2 text-right">Écarts</th>
              <th className="px-3 py-2 text-right">Mal rangés</th>
            </tr>
          </thead>
          <tbody>
            {invs.length === 0 && (
              <tr>
                <td colSpan={9} className="py-8 text-center text-muted-foreground">
                  Aucun inventaire.
                </td>
              </tr>
            )}
            {invs.map((i) => (
              <tr key={i.id} className="border-b hover:bg-accent/30">
                <td className="px-3 py-1.5">
                  <Link href={`/magtissu/inventaires/${i.id}`} className="font-mono font-bold text-brand hover:underline">
                    {i.numero}
                  </Link>
                </td>
                <td className="px-3 py-1.5">{i.zone || "tout"}</td>
                <td className="px-3 py-1.5">
                  {dateFr(i.date)} · {i.ouvertPar}
                </td>
                <td className="px-3 py-1.5">
                  {i.statut === "ouvert" ? <StatusBadge tone="warning">En cours</StatusBadge> : <StatusBadge tone="success">Clos le {dateFr(i.closLe)}</StatusBadge>}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {i.resultat.trouves}/{i.resultat.attendus}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">{i.resultat.manquants.length}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{i.resultat.nonEnregistres.length}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{i.resultat.ecarts.length}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{i.resultat.malRanges.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionPanel>
    </div>
  );
}
