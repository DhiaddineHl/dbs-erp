"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_STRUCTURE } from "@/lib/nav";
import { cn } from "@/lib/utils";

const STAGE_COLOR: Record<number, string> = {
  1: "var(--s1)",
  2: "var(--s2)",
  3: "var(--s3)",
  4: "var(--s4)",
  5: "var(--s5)",
};

export function Sidebar({ modules }: { modules: Record<string, boolean> }) {
  const pathname = usePathname();

  // Filter nav by the authenticated role's module permissions (loaded from DB
  // in the (app) layout). Admin receives an all-true map.
  const groups = NAV_STRUCTURE.map((g) => ({
    ...g,
    items: g.items.filter((it) => modules[it.id] !== false),
  })).filter((g) => g.items.length > 0);

  return (
    <aside className="flex h-full w-[248px] flex-col overflow-y-auto border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-sidebar-border bg-sidebar px-5 py-4">
        <span className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-purple text-white">
          <Image
            src="/dbs-fashion-logo.png"
            alt="Logo"
            width={50}
            height={60}
          />
        </span>
        <span className="text-base font-extrabold tracking-tight text-white">
          Pilot<span className="text-stage-1">Pro</span>
        </span>
      </div>

      <nav className="flex-1 py-1.5">
        {groups.map((group) => (
          <div key={group.label} className="py-1.5">
            <div className="flex items-center gap-2 px-5 pb-1 pt-3">
              {group.stage && (
                <span
                  className="size-3 shrink-0 rounded-[4px]"
                  style={{ background: STAGE_COLOR[group.stage] }}
                />
              )}
              <span className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-slate-500">
                {group.label}
              </span>
            </div>
            {group.items.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 border-l-[2.5px] border-transparent px-5 py-2 text-[12.5px] text-slate-400 transition-colors hover:bg-sidebar-accent hover:text-slate-200",
                    active &&
                      "border-l-brand bg-gradient-to-r from-brand/20 to-transparent font-semibold text-white",
                  )}
                >
                  <Icon className="size-[18px] shrink-0" />
                  <span className="truncate">{item.label}</span>
                  {item.badge ? (
                    <span className="ml-auto min-w-[18px] rounded-full bg-[var(--danger)] px-1.5 py-px text-center text-[9px] font-bold text-white">
                      {item.badge}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
