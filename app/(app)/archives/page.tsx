import { requireUser, userRole } from "@/lib/auth/server";
import { listArchives } from "@/lib/services/aval";
import { ArchivesClient } from "./archives-client";

const PRODUCTION = ["admin", "resp", "chef", "magasin"];

export default async function ArchivesPage() {
  const user = await requireUser();
  const role = userRole(user);
  const archives = await listArchives();

  return <ArchivesClient archives={archives} peutSaisir={PRODUCTION.includes(role)} />;
}
