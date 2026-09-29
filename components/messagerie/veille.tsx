"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { MessageCircle, X } from "lucide-react";
import { couleurDe, initiales } from "@/lib/domain/messagerie";
import { conversationOuverte, jouerSon, majNonLus, useNonLus } from "./etat";

/* Veille de la messagerie, présente sur TOUTES les pages de PilotPro :
 *   - relève les nouveaux messages toutes les quelques secondes ;
 *   - affiche une ALERTE en bas à droite de l'écran (qui, quoi, « Répondre »),
 *     avec un petit son ;
 *   - si l'onglet est en arrière-plan, une notification de bureau
 *     (Windows / Mac) — une fois autorisée depuis la messagerie ;
 *   - tient à jour le nombre de non lus (menu, bouton flottant, onglet). */

type Alerte = { id: number; conversationId: number; conversation: string; groupe: boolean; auteur: string; apercu: string };

export function VeilleMessagerie() {
  const router = useRouter();
  const pathname = usePathname();
  const nonLus = useNonLus();
  const [alertes, setAlertes] = useState<Alerte[]>([]);
  const depuis = useRef<number | null>(null);
  const titre = useRef<string>("");

  useEffect(() => {
    let arret = false;
    let minuteur: ReturnType<typeof setTimeout> | null = null;
    const tour = async () => {
      try {
        const q = depuis.current == null ? "" : `?depuis=${depuis.current}`;
        const res = await fetch(`/api/messagerie/releve${q}`, { cache: "no-store" });
        if (res.ok) {
          const r = (await res.json()) as { nonLus: number; nouveaux: Alerte[]; dernierId: number };
          majNonLus(r.nonLus);
          const premiere = depuis.current == null;
          depuis.current = Math.max(depuis.current ?? 0, r.dernierId);
          const aMontrer = premiere ? [] : r.nouveaux.filter((a) => a.conversationId !== conversationOuverte() || document.hidden);
          if (aMontrer.length) {
            jouerSon();
            setAlertes((l) => [...aMontrer.reverse(), ...l].slice(0, 3));
            if (document.hidden && "Notification" in window && Notification.permission === "granted") {
              for (const a of aMontrer.slice(0, 3)) {
                const n = new Notification(a.groupe ? `${a.auteur} · ${a.conversation}` : a.auteur, {
                  body: a.apercu,
                  tag: `msg-${a.conversationId}`,
                  icon: "/dbs-fashion-logo.png",
                });
                n.onclick = () => {
                  window.focus();
                  router.push(`/messagerie?c=${a.conversationId}`);
                  n.close();
                };
              }
            }
          }
        }
      } catch {
        /* réseau coupé : on réessaie au tour suivant */
      }
      if (!arret) minuteur = setTimeout(tour, document.hidden ? 15000 : 6000);
    };
    tour();
    return () => {
      arret = true;
      if (minuteur) clearTimeout(minuteur);
    };
  }, [router]);

  // Les alertes se retirent seules après 15 s.
  useEffect(() => {
    if (!alertes.length) return;
    const t = setTimeout(() => setAlertes((l) => l.slice(0, -1)), 15000);
    return () => clearTimeout(t);
  }, [alertes]);

  // « (3) PilotPro » dans l'onglet du navigateur.
  useEffect(() => {
    const base = titre.current || document.title.replace(/^\(\d+\)\s*/, "");
    titre.current = base;
    document.title = nonLus > 0 ? `(${nonLus}) ${base}` : base;
  }, [nonLus, pathname]);

  const surMessagerie = pathname.startsWith("/messagerie");

  return (
    <>
      <div className="pointer-events-none fixed bottom-20 right-5 z-[60] flex w-[340px] flex-col gap-2 print:hidden">
        {alertes.map((a) => (
          <div key={a.id} className="pointer-events-auto flex gap-3 rounded-xl border bg-white p-3 text-slate-900 shadow-2xl ring-1 ring-black/5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white" style={{ background: couleurDe(a.auteur) }}>
              {initiales(a.auteur)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1">
                <span className="truncate text-sm font-bold">{a.auteur}</span>
                {a.groupe && <span className="truncate text-xs text-slate-500">· {a.conversation}</span>}
                <button onClick={() => setAlertes((l) => l.filter((x) => x.id !== a.id))} className="ml-auto rounded p-0.5 text-slate-400 hover:bg-slate-100">
                  <X className="size-3.5" />
                </button>
              </div>
              <div className="line-clamp-2 text-sm text-slate-700">{a.apercu}</div>
              <button
                onClick={() => {
                  setAlertes((l) => l.filter((x) => x.conversationId !== a.conversationId));
                  router.push(`/messagerie?c=${a.conversationId}`);
                }}
                className="mt-1.5 rounded-md bg-emerald-600 px-3 py-1 text-xs font-bold text-white hover:bg-emerald-700"
              >
                Répondre
              </button>
            </div>
          </div>
        ))}
      </div>
      {!surMessagerie && (
        <button
          onClick={() => router.push("/messagerie")}
          title="Messagerie"
          className="fixed bottom-5 right-5 z-[60] flex size-14 items-center justify-center rounded-full bg-emerald-600 text-white shadow-xl hover:bg-emerald-700 print:hidden"
        >
          <MessageCircle className="size-7" />
          {nonLus > 0 && (
            <span className="absolute -right-1 -top-1 min-w-[22px] rounded-full bg-red-600 px-1.5 py-0.5 text-center text-xs font-bold">{nonLus > 99 ? "99+" : nonLus}</span>
          )}
        </button>
      )}
    </>
  );
}
