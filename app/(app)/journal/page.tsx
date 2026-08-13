import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/server";
import { listActivite, statsActivite } from "@/lib/services/activite";
import { listRoles } from "@/lib/services/permissions";
import { JournalClient } from "./journal-client";

/* Le journal est réservé à l'administration : il nomme les auteurs de chaque
 * écriture, ce qui n'a pas à circuler dans l'atelier. */
export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; role?: string; jours?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const jours = sp.jours === undefined ? 30 : Number(sp.jours) || 0;
  const filtres = { action: sp.action ?? "", role: sp.role ?? "", jours };

  const [entrees, stats, roles] = await Promise.all([
    listActivite({ action: filtres.action || undefined, role: filtres.role || undefined, jours, limite: 500 }),
    statsActivite(jours || 365),
    listRoles(),
  ]);

  return (
    <Suspense>
      <JournalClient entrees={entrees} stats={stats} roles={roles} filtres={filtres} />
    </Suspense>
  );
}
