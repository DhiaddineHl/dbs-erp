import Link from "next/link";

/* Habillage commun des écrans mobiles du magasin tissu : gros boutons, gros
 * chiffres, lisibles avec des gants et en plein jour. */

export const nb = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

export function Cadre({ children, retour }: { children: React.ReactNode; retour?: { href: string; label: string } }) {
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto max-w-md px-4 pb-16 pt-4">
        {retour && (
          <Link href={retour.href} className="mb-2 inline-block text-sm font-semibold text-slate-600">
            ← {retour.label}
          </Link>
        )}
        {children}
      </div>
    </div>
  );
}

export function Entete({ utilisateur, titre }: { utilisateur: string; titre: string }) {
  return <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">DBS Fashion · {titre} · {utilisateur}</div>;
}

export function Info({ label, v, u, fort }: { label: string; v: number | string; u?: string; fort?: boolean }) {
  return (
    <div className={`rounded-xl px-2 py-2 ${fort ? "bg-slate-900 text-white" : "bg-white"}`}>
      <div className={`text-[10px] font-semibold uppercase ${fort ? "text-white/70" : "text-slate-500"}`}>{label}</div>
      <div className="text-lg font-extrabold tabular-nums">
        {typeof v === "number" ? nb.format(v) : v} {u && <span className="text-xs">{u}</span>}
      </div>
    </div>
  );
}

export const TONS_STATUT: Record<string, string> = {
  en_attente: "bg-amber-100 text-amber-900",
  en_stock: "bg-emerald-100 text-emerald-900",
  sorti: "bg-sky-100 text-sky-900",
  epuise: "bg-slate-200 text-slate-700",
  rendu: "bg-purple-100 text-purple-900",
  retourne: "bg-purple-100 text-purple-900",
};
