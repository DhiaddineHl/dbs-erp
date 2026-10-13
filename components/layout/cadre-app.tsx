"use client";

import { useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { cn } from "@/lib/utils";

/* Cadre de l'application : le menu, la barre du haut, et la zone de travail.
 *
 * Sur ORDINATEUR, rien ne change : deux colonnes, le menu toujours visible.
 *
 * Sur TÉLÉPHONE, le menu de 248 px prenait les deux tiers de l'écran et il
 * ne restait que 210 px pour travailler. Il devient donc un panneau qui
 * s'ouvre par le bouton ☰ et se referme dès qu'on choisit une page. La zone
 * de travail récupère la largeur entière.
 *
 * Les classes `app-*` n'habillent rien : elles donnent prise à la feuille
 * d'impression de globals.css, qui démonte cette grille pour que les pages
 * « document » sortent seules et entières sur le papier. */

export function CadreApp({
  modules,
  badges,
  user,
  children,
}: {
  modules: Record<string, boolean>;
  badges: Record<string, number>;
  user: { name: string; email: string; role: string; roleLabel: string };
  children: React.ReactNode;
}) {
  const [menuOuvert, setMenuOuvert] = useState(false);
  const fermer = () => setMenuOuvert(false);

  return (
    <div className="app-shell grid h-screen grid-rows-[60px_1fr] lg:grid-cols-[248px_1fr]">
      {/* Colonne fixe sur ordinateur ; hors du flux et coulissante en dessous. */}
      <div
        className={cn(
          "app-sidebar z-50 min-h-0 lg:row-span-2",
          "max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:w-[248px] max-lg:shadow-2xl max-lg:transition-transform max-lg:duration-200",
          menuOuvert ? "max-lg:translate-x-0" : "max-lg:-translate-x-full",
        )}
        // Replié, le menu ne doit pas être atteignable au clavier ni lu à voix haute.
        aria-hidden={menuOuvert ? undefined : "true"}
        inert={menuOuvert ? undefined : true}
      >
        <Sidebar modules={modules} badges={badges} onNaviguer={fermer} />
      </div>

      {menuOuvert && (
        <button
          type="button"
          aria-label="Fermer le menu"
          onClick={fermer}
          className="fixed inset-0 z-40 bg-black/50 lg:hidden print:hidden"
        />
      )}

      <div className="app-topbar contents">
        <Topbar user={user} onOuvrirMenu={() => setMenuOuvert(true)} />
      </div>

      {/* Marges resserrées sur téléphone : 28 px de chaque côté, c'était
          autant de largeur perdue sur un écran qui n'en a pas de trop. */}
      <main className="app-main min-h-0 overflow-y-auto px-4 py-4 lg:px-7 lg:py-6">{children}</main>
    </div>
  );
}
