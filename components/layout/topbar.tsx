"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Search } from "lucide-react";
import { PAGE_META } from "@/lib/nav";
import { ROLE_LABELS, type AppRole } from "@/lib/auth/permissions";
import { authClient } from "@/lib/auth/client";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

function useClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    // Start the clock after mount (SSR-safe: avoids a hydration mismatch on time).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function Topbar({ user }: { user: { name: string; email: string; role: string } }) {
  const pathname = usePathname();
  const router = useRouter();
  const id = pathname.split("/")[1] || "cockpit";
  const meta = PAGE_META[id] ?? PAGE_META.cockpit;
  const now = useClock();
  const initial = (user.name || user.email || "?").charAt(0).toUpperCase();
  const roleLabel = ROLE_LABELS[user.role as AppRole] ?? user.role;

  async function handleSignOut() {
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="z-10 flex h-[60px] items-center gap-4 border-b bg-card px-6 shadow-sm">
      <div className="leading-tight">
        <div className="text-base font-bold">{meta.label}</div>
        <div className="text-[11px] font-normal text-muted-foreground">
          {meta.subtitle}
        </div>
      </div>

      <div className="relative ml-2 hidden max-w-[420px] flex-1 md:block">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Rechercher commande, client, OF…"
          className="h-9 rounded-full bg-background pl-9"
        />
      </div>

      <div className="ml-auto flex items-center gap-4">
        <div className="hidden text-right text-[12px] text-muted-foreground tabular-nums sm:block">
          <div>
            {now
              ? now.toLocaleDateString("fr-FR", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                })
              : "—"}
          </div>
          <div className="text-sm font-bold text-foreground">
            {now
              ? now.toLocaleTimeString("fr-FR", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })
              : "—"}
          </div>
        </div>

        <div className="flex items-center gap-2.5 rounded-full bg-background py-1 pl-1 pr-2.5">
          <Avatar className="size-8">
            <AvatarFallback className="bg-gradient-to-br from-brand to-purple text-xs font-bold text-white">
              {initial}
            </AvatarFallback>
          </Avatar>
          <div className="hidden leading-tight sm:block">
            <div className="text-[12px] font-semibold">{user.name}</div>
            <div className="text-[10px] text-muted-foreground">{roleLabel}</div>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            title="Se déconnecter"
            className="ml-1 flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
