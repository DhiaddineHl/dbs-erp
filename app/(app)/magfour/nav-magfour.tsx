import Link from "next/link";

/* Barre commune du magasin fournitures : l'écran par commande (feu), puis les
 * outils transverses — nomenclature par modèle, réception par bon client,
 * manques / relances, restes. */
const LIENS = [
  { href: "/magfour", label: "🔩 Par commande" },
  { href: "/magfour/nomenclature", label: "📋 Nomenclature par modèle" },
  { href: "/magfour/reception", label: "📥 Réception (bon client)" },
  { href: "/magfour/manques", label: "📨 Manques & relances" },
  { href: "/magfour/restes", label: "🔁 Restes client" },
  { href: "/magfour/catalogue", label: "📚 Catalogue" },
];

export function NavMagfour({ actif }: { actif: string }) {
  return (
    <div className="mb-4 flex flex-wrap gap-1.5">
      {LIENS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
            actif === l.href ? "bg-foreground text-background" : "border bg-card text-muted-foreground hover:bg-muted"
          }`}
        >
          {l.label}
        </Link>
      ))}
    </div>
  );
}
