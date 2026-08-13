import { requireUser, userRole } from "@/lib/auth/server";
import { listOperations } from "@/lib/services/atelier";
import { OperationsClient } from "./operations-client";

const ATELIER = ["admin", "resp", "chef"];

export default async function OperationsPage() {
  const user = await requireUser();
  const role = userRole(user);
  const operations = await listOperations();

  return <OperationsClient operations={operations} peutSaisir={ATELIER.includes(role)} />;
}
