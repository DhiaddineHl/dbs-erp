import { requireUser } from "@/lib/auth/server";
import { annuaire, listConversations, marquerLu, ouvrirConversation, type ConversationVue } from "@/lib/services/messagerie";
import { Messagerie } from "./messagerie-client";

/* Messagerie interne, style WhatsApp Web : discussions à gauche, fil à droite. */
export const dynamic = "force-dynamic";

export default async function MessageriePage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const moi = { id: user.id, nom: user.name as string };
  const c = Number(sp.c);
  const demandee = Number.isInteger(c) && c > 0 ? c : null;
  // Discussion demandée (ex. « Répondre » depuis une alerte) : ouverte et lue d'emblée.
  let vue: ConversationVue | null = null;
  if (demandee) {
    try {
      await marquerLu(demandee, moi);
      vue = await ouvrirConversation(demandee, moi);
    } catch {
      vue = null;
    }
  }
  const [conversations, personnes] = await Promise.all([listConversations(moi), annuaire()]);
  return (
    <Messagerie
      key={sp.c ?? ""}
      moi={moi}
      conversationsInitiales={conversations}
      annuaire={personnes}
      ouvrirId={vue ? demandee : null}
      vueInitiale={vue}
    />
  );
}
