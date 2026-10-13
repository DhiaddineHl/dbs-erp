import { versionApp } from "@/lib/version";

/* Version en ligne, relevée par chaque page ouverte (veille de version). */
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ v: versionApp() }, { headers: { "Cache-Control": "no-store" } });
}
