import { redirect } from "next/navigation";
import { getUser, userRole } from "@/lib/auth/server";
import { getLandingPath } from "@/lib/services/permissions";

export default async function Home() {
  const user = await getUser();
  if (!user) redirect("/login");
  redirect(await getLandingPath(userRole(user)));
}
