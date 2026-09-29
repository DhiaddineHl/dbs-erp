"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Bell, Check, CheckCheck, FileText, Info, Package, Paperclip, Search, Send, Trash2, UserPlus, Users, X } from "lucide-react";
import * as A from "@/lib/actions/messagerie";
import { majNonLus, setConversationOuverte } from "@/components/messagerie/etat";
import { FICHIER_MAX, MIMES_MESSAGERIE, couleurDe, estImage, initiales, libelleJour, mimeDe, presenceTexte, tailleLisible } from "@/lib/domain/messagerie";
import type { ConversationResume, ConversationVue, MembreVue, MessageVue, Personne } from "@/lib/services/messagerie";

/* Messagerie interne, style WhatsApp Web.
 *   Gauche : discussions (non lus en vert), recherche, nouvelle discussion,
 *            nouveau groupe, activation des alertes de bureau.
 *   Droite : le fil — bulles, séparateurs de jour, ✓ envoyé / ✓✓ gris lu par
 *            une partie / ✓✓ bleu lu par tous, « Lu par… » sur mes messages,
 *            photos, fichiers, commandes citées ; zone de saisie en bas.
 * La discussion ouverte se relit toutes les 3 s ; la liste toutes les 6 s. */

type Moi = { id: string; nom: string };
type PieceJointe = { hash: string; nom: string; mime: string; taille: number };

const heure = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
function dateListe(iso: string) {
  const d = new Date(iso);
  const auj = new Date();
  if (d.toDateString() === auj.toDateString()) return heure(iso);
  if (new Date(Date.now() - 86_400_000).toDateString() === d.toDateString()) return "Hier";
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}

function Avatar({ id, nom, groupe, taille = 44 }: { id: string; nom: string; groupe?: boolean; taille?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{ width: taille, height: taille, background: groupe ? "#64748b" : couleurDe(id), fontSize: taille * 0.36 }}
    >
      {groupe ? <Users style={{ width: taille * 0.5, height: taille * 0.5 }} /> : initiales(nom)}
    </span>
  );
}

function Coches({ etat }: { etat: MessageVue["etat"] }) {
  if (!etat) return null;
  if (etat === "envoye") return <Check className="size-4 text-slate-400" aria-label="Envoyé" />;
  return <CheckCheck className={`size-4 ${etat === "lu" ? "text-sky-500" : "text-slate-400"}`} aria-label={etat === "lu" ? "Lu" : "Lu par une partie"} />;
}

export function Messagerie({
  moi,
  conversationsInitiales,
  annuaire,
  ouvrirId,
  vueInitiale,
}: {
  vueInitiale: ConversationVue | null;
  moi: Moi;
  conversationsInitiales: ConversationResume[];
  annuaire: Personne[];
  ouvrirId: number | null;
}) {
  const router = useRouter();
  const [convs, setConvs] = useState(conversationsInitiales);
  const [actif, setActif] = useState<number | null>(ouvrirId);
  const [vue, setVue] = useState<ConversationVue | null>(vueInitiale);
  const [filtre, setFiltre] = useState("");
  const [fenetre, setFenetre] = useState<null | "direct" | "groupe" | "infos" | { lecture: MessageVue }>(null);
  // Permission des alertes de bureau : relue à chaque rendu (elle change après la demande).
  const [, setDemande] = useState(0);
  const notifs = useSyncExternalStore(
    () => () => {},
    () => ("Notification" in window ? Notification.permission : "absent"),
    () => "absent" as const,
  );
  // Horloge pour « en ligne », « Aujourd'hui »… (rafraîchie toutes les 30 s).
  const [maintenant, setMaintenant] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setMaintenant(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  const fil = useRef<HTMLDivElement>(null);
  const enBas = useRef(true);

  const rechargerListe = useCallback(async () => {
    const r = await A.listeDiscussions();
    if (r.ok) {
      setConvs(r.conversations);
      majNonLus(r.conversations.reduce((s, c) => s + (c.parti ? 0 : c.nonLus), 0));
    }
  }, []);

  /** Charge une discussion (et la marque lue). */
  const charger = useCallback(
    async (id: number) => {
      setConversationOuverte(id);
      enBas.current = true;
      const r = await A.ouvrirDiscussion(id);
      if (!r.ok) {
        toast.error(r.error);
        setVue(null);
        return;
      }
      setVue(r.vue);
      void rechargerListe();
      window.history.replaceState(null, "", `/messagerie?c=${id}`);
    },
    [rechargerListe],
  );
  const ouvrir = (id: number) => {
    setActif(id);
    return charger(id);
  };

  // Discussion demandée dans l'adresse : déjà chargée (et marquée lue) par le serveur.
  useEffect(() => {
    setConversationOuverte(ouvrirId);
    return () => setConversationOuverte(null);
  }, [ouvrirId]);

  // Liste des discussions : toutes les 6 s.
  useEffect(() => {
    const t = setInterval(() => {
      if (!document.hidden) void rechargerListe();
    }, 6000);
    return () => clearInterval(t);
  }, [rechargerListe]);

  // Discussion ouverte : nouveaux messages + accusés de lecture, toutes les 3 s.
  const dernierId = vue?.messages.at(-1)?.id ?? 0;
  useEffect(() => {
    if (!vue) return;
    const id = vue.id;
    let arret = false;
    const t = setInterval(async () => {
      if (document.hidden || arret) return;
      try {
        const res = await fetch(`/api/messagerie/releve?conv=${id}&apres=${dernierId}`, { cache: "no-store" });
        if (!res.ok) return;
        const r = (await res.json()) as { ouverte: { messages: MessageVue[]; lectures: { messageId: number; lecteurs: MessageVue["lecteurs"]; etat: MessageVue["etat"] }[]; membres: MembreVue[] } | null };
        if (!r.ouverte || arret) return;
        const o = r.ouverte;
        setVue((v) => {
          if (!v || v.id !== id) return v;
          const lect = new Map(o.lectures.map((l) => [l.messageId, l]));
          const connus = new Set(v.messages.map((m) => m.id));
          const messages = [
            ...v.messages.map((m) => (lect.has(m.id) ? { ...m, lecteurs: lect.get(m.id)!.lecteurs, etat: lect.get(m.id)!.etat } : m)),
            ...o.messages.filter((m) => !connus.has(m.id)),
          ];
          return { ...v, messages, membres: o.membres };
        });
        if (o.messages.some((m) => m.auteurId !== moi.id)) {
          await A.marquerLu(id);
          void rechargerListe();
        }
      } catch {
        /* réseau : tour suivant */
      }
    }, 3000);
    return () => {
      arret = true;
      clearInterval(t);
    };
  }, [vue?.id, dernierId, moi.id, rechargerListe]); // eslint-disable-line react-hooks/exhaustive-deps

  // Défile en bas à l'arrivée d'un message, si on y était déjà.
  useEffect(() => {
    const el = fil.current;
    if (el && enBas.current) el.scrollTop = el.scrollHeight;
  }, [vue?.messages.length, vue?.id]);

  const visibles = convs.filter((c) => !filtre.trim() || c.nom.toLowerCase().includes(filtre.trim().toLowerCase()));

  const envoyer = async (contenu: { texte: string; fichier: PieceJointe | null; commandeId: number | null }) => {
    if (!vue) return false;
    const r = await A.envoyerMessage(vue.id, contenu);
    if (!r.ok) {
      toast.error(r.error);
      return false;
    }
    enBas.current = true;
    const o = await A.ouvrirDiscussion(vue.id);
    if (o.ok) setVue(o.vue);
    void rechargerListe();
    return true;
  };

  return (
    <div className="-mx-7 -my-6 flex h-[calc(100vh-60px)] min-h-0 bg-[#f0f2f5] text-slate-900">
      {/* ═══ liste des discussions ═══ */}
      <aside className={`flex w-full min-w-0 flex-col border-r bg-white md:w-[360px] md:flex-none ${actif ? "hidden md:flex" : "flex"}`}>
        <div className="flex items-center gap-2 bg-[#f0f2f5] px-4 py-2.5">
          <Avatar id={moi.id} nom={moi.nom} taille={38} />
          <span className="truncate text-sm font-semibold">{moi.nom}</span>
          <button onClick={() => setFenetre("direct")} title="Nouvelle discussion" className="ml-auto rounded-full p-2 text-slate-600 hover:bg-slate-200">
            <UserPlus className="size-5" />
          </button>
          <button onClick={() => setFenetre("groupe")} title="Nouveau groupe" className="rounded-full p-2 text-slate-600 hover:bg-slate-200">
            <Users className="size-5" />
          </button>
        </div>
        {notifs === "default" && (
          <button
            onClick={async () => {
              await Notification.requestPermission();
              setDemande((n) => n + 1);
            }}
            className="flex items-center gap-3 bg-sky-50 px-4 py-3 text-left text-sm text-sky-900 hover:bg-sky-100"
          >
            <Bell className="size-5 shrink-0" />
            <span>
              <b>Activer les alertes sur l&apos;ordinateur</b>
              <span className="block text-xs">Un message s&apos;affiche même quand PilotPro est en arrière-plan.</span>
            </span>
          </button>
        )}
        <div className="px-3 py-2">
          <div className="flex items-center gap-2 rounded-lg bg-[#f0f2f5] px-3 py-1.5">
            <Search className="size-4 text-slate-500" />
            <input value={filtre} onChange={(e) => setFiltre(e.target.value)} placeholder="Rechercher une discussion" className="w-full bg-transparent text-sm outline-none" />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {visibles.length === 0 && (
            <div className="px-6 py-10 text-center text-sm text-slate-500">
              Aucune discussion. Cliquez sur <UserPlus className="inline size-4" /> pour écrire à quelqu&apos;un, ou sur <Users className="inline size-4" /> pour créer un groupe.
            </div>
          )}
          {visibles.map((c) => (
            <button
              key={c.id}
              onClick={() => void ouvrir(c.id)}
              className={`flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-[#f5f6f6] ${actif === c.id ? "bg-[#f0f2f5]" : ""}`}
            >
              <Avatar id={c.autre?.id ?? String(c.id)} nom={c.nom} groupe={c.type === "groupe"} />
              <div className="min-w-0 flex-1 border-b border-slate-100 pb-2.5">
                <div className="flex items-baseline gap-2">
                  <span className="truncate font-semibold">{c.nom}</span>
                  <span className={`ml-auto shrink-0 text-xs ${c.nonLus ? "font-semibold text-emerald-600" : "text-slate-500"}`}>{c.dernier ? dateListe(c.dernier.date) : ""}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm text-slate-500">
                    {c.parti ? "Vous ne faites plus partie de ce groupe" : c.dernier ? `${c.dernier.moi ? "Vous : " : c.type === "groupe" && c.dernier.auteur ? `${c.dernier.auteur} : ` : ""}${c.dernier.apercu}` : "Nouvelle discussion"}
                  </span>
                  {c.nonLus > 0 && <span className="ml-auto min-w-[20px] shrink-0 rounded-full bg-emerald-500 px-1.5 text-center text-xs font-bold leading-5 text-white">{c.nonLus}</span>}
                </div>
              </div>
            </button>
          ))}
        </div>
      </aside>

      {/* ═══ fil de la discussion ═══ */}
      <section className={`min-w-0 flex-1 flex-col ${actif ? "flex" : "hidden md:flex"}`}>
        {!vue ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 border-b-8 border-emerald-500 bg-[#f8f9fa] text-center text-slate-500">
            <div className="text-5xl">💬</div>
            <div className="text-2xl font-light text-slate-700">Messagerie PilotPro</div>
            <p className="max-w-md text-sm">
              Écrivez à une personne ou à un groupe. Vous voyez quand le message est lu (✓✓ bleu). Photos, PDF, Excel et commandes (OF)
              peuvent être joints.
            </p>
          </div>
        ) : (
          <>
            <header className="flex items-center gap-3 bg-[#f0f2f5] px-4 py-2">
              <button onClick={() => { setActif(null); setVue(null); setConversationOuverte(null); }} className="rounded-full p-1 text-slate-600 md:hidden">
                ←
              </button>
              {(() => {
                const autre = vue.type === "direct" ? vue.membres.find((m) => m.userId !== moi.id) : null;
                const sous =
                  vue.type === "groupe"
                    ? vue.membres
                        .filter((m) => !m.parti)
                        .map((m) => (m.userId === moi.id ? "Vous" : m.nom))
                        .join(", ")
                    : presenceTexte(autre?.vuLe || null, maintenant);
                return (
                  <button onClick={() => vue.type === "groupe" && setFenetre("infos")} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <Avatar id={autre?.userId ?? String(vue.id)} nom={vue.nom} groupe={vue.type === "groupe"} taille={40} />
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{vue.nom}</span>
                      <span className={`block truncate text-xs ${sous === "en ligne" ? "text-emerald-600" : "text-slate-500"}`}>{sous}</span>
                    </span>
                  </button>
                );
              })()}
              {vue.type === "groupe" && (
                <button onClick={() => setFenetre("infos")} title="Infos du groupe" className="rounded-full p-2 text-slate-600 hover:bg-slate-200">
                  <Info className="size-5" />
                </button>
              )}
            </header>

            <div
              ref={fil}
              onScroll={(e) => {
                const el = e.currentTarget;
                enBas.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
              }}
              className="min-h-0 flex-1 overflow-y-auto bg-[#efeae2] px-[6%] py-4"
            >
              {vue.plusAnciens && (
                <div className="mb-3 text-center">
                  <button
                    onClick={async () => {
                      const r = await A.ouvrirDiscussion(vue.id, vue.messages[0]?.id);
                      if (r.ok) {
                        enBas.current = false;
                        setVue((v) => (v ? { ...v, messages: [...r.vue.messages, ...v.messages], plusAnciens: r.vue.plusAnciens } : v));
                      }
                    }}
                    className="rounded-full bg-white px-3 py-1 text-xs text-slate-600 shadow"
                  >
                    Messages plus anciens
                  </button>
                </div>
              )}
              {vue.messages.map((m, i) => {
                const jour = libelleJour(m.date, maintenant);
                const nouveauJour = i === 0 || libelleJour(vue.messages[i - 1].date, maintenant) !== jour;
                const mien = m.auteurId === moi.id;
                const suite = i > 0 && vue.messages[i - 1].auteurId === m.auteurId && !nouveauJour && vue.messages[i - 1].genre !== "systeme";
                return (
                  <div key={m.id}>
                    {nouveauJour && (
                      <div className="my-3 text-center">
                        <span className="rounded-lg bg-white/90 px-3 py-1 text-xs font-medium uppercase text-slate-500 shadow-sm">{jour}</span>
                      </div>
                    )}
                    {m.genre === "systeme" ? (
                      <div className="my-2 text-center">
                        <span className="rounded-lg bg-[#fff5c4] px-3 py-1 text-xs text-slate-700 shadow-sm">{m.texte}</span>
                      </div>
                    ) : (
                      <Bulle
                        m={m}
                        mien={mien}
                        groupe={vue.type === "groupe"}
                        suite={suite}
                        onInfos={() => setFenetre({ lecture: m })}
                        onSupprimer={async () => {
                          if (!confirm("Supprimer ce message pour tout le monde ?")) return;
                          const r = await A.supprimerMessage(m.id);
                          if (!r.ok) return void toast.error(r.error);
                          setVue((v) => (v ? { ...v, messages: v.messages.map((x) => (x.id === m.id ? { ...x, supprime: true, texte: "", fichier: null, commande: null } : x)) } : v));
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {vue.parti ? (
              <div className="bg-[#f0f2f5] px-4 py-4 text-center text-sm text-slate-500">Vous ne faites plus partie de ce groupe.</div>
            ) : (
              <Saisie key={vue.id} onEnvoyer={envoyer} />
            )}
          </>
        )}
      </section>

      {fenetre === "direct" && (
        <ChoixPersonnes
          titre="Nouvelle discussion"
          personnes={annuaire.filter((p) => p.id !== moi.id)}
          multiple={false}
          onFermer={() => setFenetre(null)}
          onValider={async ([id]) => {
            const r = await A.discussionAvec(id);
            if (!r.ok) return void toast.error(r.error);
            setFenetre(null);
            await rechargerListe();
            void ouvrir(r.id);
          }}
        />
      )}
      {fenetre === "groupe" && (
        <ChoixPersonnes
          titre="Nouveau groupe"
          personnes={annuaire.filter((p) => p.id !== moi.id)}
          multiple
          avecNom
          onFermer={() => setFenetre(null)}
          onValider={async (ids, nom) => {
            const r = await A.creerGroupe(nom ?? "", ids);
            if (!r.ok) return void toast.error(r.error);
            setFenetre(null);
            await rechargerListe();
            void ouvrir(r.id);
          }}
        />
      )}
      {fenetre === "infos" && vue && (
        <InfosGroupe
          maintenant={maintenant}
          vue={vue}
          moi={moi}
          annuaire={annuaire}
          onFermer={() => setFenetre(null)}
          onChange={async () => {
            const r = await A.ouvrirDiscussion(vue.id);
            if (r.ok) setVue(r.vue);
            void rechargerListe();
          }}
          onQuitter={async () => {
            if (!confirm(`Quitter le groupe « ${vue.nom} » ?`)) return;
            const r = await A.quitterGroupe(vue.id);
            if (!r.ok) return void toast.error(r.error);
            setFenetre(null);
            const o = await A.ouvrirDiscussion(vue.id);
            if (o.ok) setVue(o.vue);
            void rechargerListe();
            router.refresh();
          }}
        />
      )}
      {fenetre && typeof fenetre === "object" && "lecture" in fenetre && vue && (
        <InfosLecture m={fenetre.lecture} vue={vue} moi={moi} onFermer={() => setFenetre(null)} />
      )}
    </div>
  );
}

/* ═══════════ une bulle ═══════════ */

function Bulle({ m, mien, groupe, suite, onInfos, onSupprimer }: { m: MessageVue; mien: boolean; groupe: boolean; suite: boolean; onInfos: () => void; onSupprimer: () => void }) {
  return (
    <div className={`group flex ${mien ? "justify-end" : "justify-start"} ${suite ? "mt-0.5" : "mt-2"}`}>
      <div className={`relative max-w-[75%] rounded-lg px-2.5 pb-1.5 pt-1.5 text-[14.2px] shadow-sm ${mien ? "bg-[#d9fdd3]" : "bg-white"}`}>
        {groupe && !mien && !suite && (
          <div className="mb-0.5 text-[12.8px] font-semibold" style={{ color: couleurDe(m.auteurId ?? m.auteurNom) }}>
            {m.auteurNom}
          </div>
        )}
        {m.supprime ? (
          <div className="italic text-slate-500">🚫 {mien ? "Vous avez supprimé ce message" : "Ce message a été supprimé"}</div>
        ) : (
          <>
            {m.fichier && estImage(m.fichier.mime) && (
              <a href={`/api/fichier/${m.fichier.hash}`} target="_blank" rel="noreferrer" className="mb-1 block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/fichier/${m.fichier.hash}`} alt={m.fichier.nom} className="max-h-72 rounded-md object-cover" />
              </a>
            )}
            {m.fichier && !estImage(m.fichier.mime) && (
              <a
                href={`/api/fichier/${m.fichier.hash}`}
                target="_blank"
                rel="noreferrer"
                download={m.fichier.nom}
                className={`mb-1 flex items-center gap-3 rounded-md px-3 py-2 ${mien ? "bg-[#c7f0c0]" : "bg-slate-100"}`}
              >
                <FileText className="size-8 shrink-0 text-red-500" />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{m.fichier.nom}</span>
                  <span className="text-xs text-slate-500">
                    {MIMES_MESSAGERIE[m.fichier.mime] ?? "Fichier"} · {tailleLisible(m.fichier.taille)}
                  </span>
                </span>
              </a>
            )}
            {m.commande && (
              <a
                href={m.commande.id ? `/commandes?q=${encodeURIComponent(m.commande.label.split(" · ")[0])}` : "#"}
                className={`mb-1 flex items-center gap-2 rounded-md border-l-4 border-emerald-600 px-3 py-2 ${mien ? "bg-[#c7f0c0]" : "bg-slate-100"}`}
              >
                <Package className="size-5 shrink-0 text-emerald-700" />
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{m.commande.label}</span>
                  <span className="text-xs text-slate-500">Ouvrir la commande</span>
                </span>
              </a>
            )}
            {m.texte && <div className="whitespace-pre-wrap break-words pr-14">{m.texte}</div>}
          </>
        )}
        <div className="float-right -mb-0.5 ml-2 mt-[-14px] flex items-center gap-1 text-[11px] text-slate-500">
          {heure(m.date)}
          {mien && !m.supprime && <Coches etat={m.etat} />}
        </div>
        <div className="clear-both" />
        {mien && !m.supprime && (
          <div className="absolute -left-16 top-1 hidden gap-1 group-hover:flex">
            <button onClick={onInfos} title="Lu par…" className="rounded-full bg-white p-1.5 text-slate-500 shadow hover:text-slate-900">
              <Info className="size-4" />
            </button>
            <button onClick={onSupprimer} title="Supprimer" className="rounded-full bg-white p-1.5 text-slate-500 shadow hover:text-red-600">
              <Trash2 className="size-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════ zone de saisie ═══════════ */

/** Réduit une photo avant l'envoi (côté le plus long 1600 px, JPEG). */
function reduirePhoto(f: File): Promise<File> {
  return new Promise((ok, ko) => {
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const max = 1600;
      let { width: l, height: h } = img;
      if (Math.max(l, h) > max) {
        const k = max / Math.max(l, h);
        l = Math.round(l * k);
        h = Math.round(h * k);
      }
      const c = document.createElement("canvas");
      c.width = l;
      c.height = h;
      const ctx = c.getContext("2d");
      if (!ctx) return ko(new Error("Image illisible"));
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, l, h);
      ctx.drawImage(img, 0, 0, l, h);
      c.toBlob((b) => (b ? ok(new File([b], f.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" })) : ko(new Error("Image illisible"))), "image/jpeg", 0.82);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      ko(new Error("Image illisible"));
    };
    img.src = url;
  });
}

function Saisie({ onEnvoyer }: { onEnvoyer: (c: { texte: string; fichier: PieceJointe | null; commandeId: number | null }) => Promise<boolean> }) {
  const [texte, setTexte] = useState("");
  const [fichier, setFichier] = useState<PieceJointe | null>(null);
  const [commande, setCommande] = useState<{ id: number; label: string } | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [depot, setDepot] = useState(false);
  const [choixOf, setChoixOf] = useState(false);
  const champ = useRef<HTMLTextAreaElement>(null);
  const choix = useRef<HTMLInputElement>(null);

  useEffect(() => {
    champ.current?.focus();
  }, []);

  const deposer = async (f: File) => {
    const mime = mimeDe(f.name, f.type);
    if (!MIMES_MESSAGERIE[mime]) return void toast.error("Format non accepté : photo, PDF, Excel, Word ou CSV.");
    setDepot(true);
    try {
      const envoye = estImage(mime) && f.size > 400_000 ? await reduirePhoto(f) : f;
      if (envoye.size > FICHIER_MAX) throw new Error(`Fichier trop volumineux (${tailleLisible(FICHIER_MAX)} maximum)`);
      const fd = new FormData();
      fd.set("fichier", envoye, f.name);
      const res = await fetch("/api/messagerie/fichier", { method: "POST", body: fd });
      const r = await res.json();
      if (!res.ok) throw new Error(r.error ?? "Envoi impossible");
      setFichier(r);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Envoi impossible");
    } finally {
      setDepot(false);
    }
  };

  const valider = async () => {
    if (envoi || depot) return;
    if (!texte.trim() && !fichier && !commande) return;
    setEnvoi(true);
    const ok = await onEnvoyer({ texte, fichier, commandeId: commande?.id ?? null });
    setEnvoi(false);
    if (ok) {
      setTexte("");
      setFichier(null);
      setCommande(null);
      champ.current?.focus();
    }
  };

  return (
    <div
      className="bg-[#f0f2f5] px-4 py-2.5"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const f = e.dataTransfer.files?.[0];
        if (f) void deposer(f);
      }}
    >
      {(fichier || commande || depot) && (
        <div className="mb-2 flex flex-wrap gap-2">
          {depot && <span className="rounded-lg bg-white px-3 py-1.5 text-sm text-slate-500">Envoi du fichier…</span>}
          {fichier && (
            <span className="flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-sm shadow-sm">
              {estImage(fichier.mime) ? "📷" : "📎"} {fichier.nom} <span className="text-xs text-slate-500">{tailleLisible(fichier.taille)}</span>
              <button onClick={() => setFichier(null)} className="text-slate-400 hover:text-slate-700">
                <X className="size-4" />
              </button>
            </span>
          )}
          {commande && (
            <span className="flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-sm shadow-sm">
              📦 {commande.label}
              <button onClick={() => setCommande(null)} className="text-slate-400 hover:text-slate-700">
                <X className="size-4" />
              </button>
            </span>
          )}
        </div>
      )}
      <div className="relative flex items-end gap-2">
        <button onClick={() => choix.current?.click()} title="Joindre une photo ou un fichier" className="rounded-full p-2 text-slate-600 hover:bg-slate-200">
          <Paperclip className="size-5" />
        </button>
        <input
          ref={choix}
          type="file"
          hidden
          accept="image/*,.pdf,.xlsx,.xls,.csv,.docx,.doc"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void deposer(f);
          }}
        />
        <button onClick={() => setChoixOf((v) => !v)} title="Citer une commande (OF)" className="rounded-full p-2 text-slate-600 hover:bg-slate-200">
          <Package className="size-5" />
        </button>
        {choixOf && (
          <ChoixCommande
            onChoisir={(c) => {
              setCommande(c);
              setChoixOf(false);
              champ.current?.focus();
            }}
            onFermer={() => setChoixOf(false)}
          />
        )}
        <textarea
          ref={champ}
          value={texte}
          rows={1}
          onChange={(e) => {
            setTexte(e.target.value);
            const el = e.currentTarget;
            el.style.height = "auto";
            el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
          }}
          onPaste={(e) => {
            const f = [...e.clipboardData.files][0];
            if (f) {
              e.preventDefault();
              void deposer(f);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void valider();
            }
          }}
          placeholder="Tapez un message (Entrée = envoyer, Maj+Entrée = nouvelle ligne)"
          className="max-h-36 min-h-[42px] flex-1 resize-none rounded-lg bg-white px-3 py-2.5 text-[15px] outline-none"
        />
        <button
          onClick={() => void valider()}
          disabled={envoi || depot || (!texte.trim() && !fichier && !commande)}
          title="Envoyer"
          className="rounded-full bg-emerald-600 p-2.5 text-white hover:bg-emerald-700 disabled:bg-slate-300"
        >
          <Send className="size-5" />
        </button>
      </div>
    </div>
  );
}

function ChoixCommande({ onChoisir, onFermer }: { onChoisir: (c: { id: number; label: string }) => void; onFermer: () => void }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<{ id: number; of: string; modele: string }[]>([]);
  useEffect(() => {
    const t = setTimeout(async () => {
      const r = await A.chercherCommandes(q);
      if (r.ok) setRes(r.commandes);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div className="absolute bottom-14 left-10 z-20 w-80 rounded-xl border bg-white p-2 shadow-xl">
      <div className="mb-1 flex items-center gap-2">
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="OF, modèle, référence…" className="w-full rounded-md border px-2 py-1.5 text-sm" />
        <button onClick={onFermer} className="text-slate-400">
          <X className="size-4" />
        </button>
      </div>
      <div className="max-h-64 overflow-y-auto">
        {q.trim().length < 2 && <div className="px-2 py-2 text-xs text-slate-500">Tapez au moins 2 caractères.</div>}
        {res.map((c) => (
          <button key={c.id} onClick={() => onChoisir({ id: c.id, label: `${c.of} · ${c.modele}` })} className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-slate-100">
            <b>{c.of}</b> · {c.modele}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ═══════════ fenêtres ═══════════ */

function Fenetre({ titre, onFermer, children }: { titre: string; onFermer: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={(e) => e.target === e.currentTarget && onFermer()}>
      <div className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-center gap-2 bg-emerald-700 px-4 py-3 text-white">
          <span className="font-semibold">{titre}</span>
          <button onClick={onFermer} className="ml-auto rounded p-1 hover:bg-white/10">
            <X className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ChoixPersonnes({
  titre,
  personnes,
  multiple,
  avecNom,
  onFermer,
  onValider,
}: {
  titre: string;
  personnes: Personne[];
  multiple: boolean;
  avecNom?: boolean;
  onFermer: () => void;
  onValider: (ids: string[], nom?: string) => void;
}) {
  const [q, setQ] = useState("");
  const [choisis, setChoisis] = useState<string[]>([]);
  const [nom, setNom] = useState("");
  const liste = personnes.filter((p) => !q.trim() || p.nom.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <Fenetre titre={titre} onFermer={onFermer}>
      {avecNom && (
        <div className="border-b px-4 py-3">
          <input autoFocus value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom du groupe (ex. Chaîne 2, Coupe…)" maxLength={60} className="w-full border-b-2 border-emerald-600 py-1.5 outline-none" />
        </div>
      )}
      <div className="px-4 py-2">
        <input autoFocus={!avecNom} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher une personne" className="w-full rounded-lg bg-[#f0f2f5] px-3 py-2 text-sm outline-none" />
      </div>
      {multiple && choisis.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-4 pb-2">
          {choisis.map((id) => (
            <span key={id} className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs">
              {personnes.find((p) => p.id === id)?.nom}
              <button onClick={() => setChoisis((c) => c.filter((x) => x !== id))}>
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {liste.map((p) => {
          const coche = choisis.includes(p.id);
          return (
            <button
              key={p.id}
              onClick={() => (multiple ? setChoisis((c) => (coche ? c.filter((x) => x !== p.id) : [...c, p.id])) : onValider([p.id]))}
              className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-slate-50"
            >
              <Avatar id={p.id} nom={p.nom} taille={38} />
              <span className="flex-1">
                <span className="block font-medium">{p.nom}</span>
                <span className="text-xs text-slate-500">{p.role}</span>
              </span>
              {multiple && <span className={`flex size-5 items-center justify-center rounded border ${coche ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-300"}`}>{coche && <Check className="size-4" />}</span>}
            </button>
          );
        })}
      </div>
      {multiple && (
        <div className="border-t p-3">
          <button
            disabled={!choisis.length || (avecNom && !nom.trim())}
            onClick={() => onValider(choisis, nom)}
            className="w-full rounded-lg bg-emerald-600 py-2.5 font-semibold text-white disabled:bg-slate-300"
          >
            {avecNom ? `Créer le groupe (${choisis.length + 1} personnes)` : "Valider"}
          </button>
        </div>
      )}
    </Fenetre>
  );
}

function InfosGroupe({
  maintenant,
  vue,
  moi,
  annuaire,
  onFermer,
  onChange,
  onQuitter,
}: {
  maintenant: number;
  vue: ConversationVue;
  moi: Moi;
  annuaire: Personne[];
  onFermer: () => void;
  onChange: () => void;
  onQuitter: () => void;
}) {
  const [nom, setNom] = useState(vue.nom);
  const [ajout, setAjout] = useState(false);
  const actifs = vue.membres.filter((m) => !m.parti);
  const act = async (v: { nom?: string; ajouter?: string[]; retirer?: string[] }) => {
    const r = await A.modifierGroupe(vue.id, v);
    if (!r.ok) return void toast.error(r.error);
    onChange();
  };
  if (ajout) {
    return (
      <ChoixPersonnes
        titre="Ajouter au groupe"
        personnes={annuaire.filter((p) => !actifs.some((m) => m.userId === p.id))}
        multiple
        onFermer={() => setAjout(false)}
        onValider={async (ids) => {
          await act({ ajouter: ids });
          setAjout(false);
        }}
      />
    );
  }
  return (
    <Fenetre titre="Infos du groupe" onFermer={onFermer}>
      <div className="border-b px-4 py-3">
        {vue.suisAdmin ? (
          <div className="flex gap-2">
            <input value={nom} onChange={(e) => setNom(e.target.value)} maxLength={60} className="flex-1 border-b-2 border-emerald-600 py-1 text-lg font-semibold outline-none" />
            {nom.trim() !== vue.nom && (
              <button onClick={() => act({ nom })} className="rounded-md bg-emerald-600 px-3 text-sm font-semibold text-white">
                Renommer
              </button>
            )}
          </div>
        ) : (
          <div className="text-lg font-semibold">{vue.nom}</div>
        )}
        <div className="text-sm text-slate-500">Groupe · {actifs.length} membres</div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {vue.suisAdmin && (
          <button onClick={() => setAjout(true)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-emerald-700 hover:bg-slate-50">
            <span className="flex size-9 items-center justify-center rounded-full bg-emerald-600 text-white">
              <UserPlus className="size-5" />
            </span>
            Ajouter des membres
          </button>
        )}
        {actifs.map((m) => (
          <div key={m.userId} className="flex items-center gap-3 px-4 py-2">
            <Avatar id={m.userId} nom={m.nom} taille={36} />
            <span className="flex-1">
              <span className="block font-medium">{m.userId === moi.id ? "Vous" : m.nom}</span>
              <span className="text-xs text-slate-500">{presenceTexte(m.vuLe || null, maintenant)}</span>
            </span>
            {m.role === "admin" && <span className="rounded border border-emerald-600 px-1.5 text-[11px] text-emerald-700">admin</span>}
            {vue.suisAdmin && m.userId !== moi.id && (
              <button onClick={() => confirm(`Retirer ${m.nom} du groupe ?`) && act({ retirer: [m.userId] })} className="text-xs text-red-600 hover:underline">
                Retirer
              </button>
            )}
          </div>
        ))}
      </div>
      {!vue.parti && (
        <div className="border-t p-3">
          <button onClick={onQuitter} className="w-full rounded-lg py-2 font-semibold text-red-600 hover:bg-red-50">
            Quitter le groupe
          </button>
        </div>
      )}
    </Fenetre>
  );
}

function InfosLecture({ m, vue, moi, onFermer }: { m: MessageVue; vue: ConversationVue; moi: Moi; onFermer: () => void }) {
  const lecteurs = useMemo(() => new Map(m.lecteurs.map((l) => [l.userId, l])), [m.lecteurs]);
  const destinataires = vue.membres.filter((x) => x.userId !== moi.id && (!x.parti || lecteurs.has(x.userId)));
  const lus = destinataires.filter((d) => lecteurs.has(d.userId));
  const pasLus = destinataires.filter((d) => !lecteurs.has(d.userId));
  return (
    <Fenetre titre="Infos du message" onFermer={onFermer}>
      <div className="bg-[#efeae2] px-4 py-3">
        <div className="ml-auto max-w-[85%] rounded-lg bg-[#d9fdd3] px-3 py-2 text-sm shadow-sm">{m.texte || m.fichier?.nom || m.commande?.label}</div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 text-sm">
        <div className="mb-1 flex items-center gap-2 font-semibold text-sky-600">
          <CheckCheck className="size-4" /> Lu par ({lus.length})
        </div>
        {lus.length === 0 && <div className="mb-3 text-slate-500">Personne pour l&apos;instant.</div>}
        {lus.map((d) => (
          <div key={d.userId} className="flex justify-between py-1">
            <span>{d.nom}</span>
            <span className="text-slate-500">
              {new Date(lecteurs.get(d.userId)!.luLe).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        ))}
        <div className="mb-1 mt-3 flex items-center gap-2 font-semibold text-slate-500">
          <Check className="size-4" /> Pas encore lu ({pasLus.length})
        </div>
        {pasLus.map((d) => (
          <div key={d.userId} className="py-1 text-slate-600">
            {d.nom}
          </div>
        ))}
        <div className="mt-3 text-xs text-slate-400">Envoyé le {new Date(m.date).toLocaleString("fr-FR")}</div>
      </div>
    </Fenetre>
  );
}

