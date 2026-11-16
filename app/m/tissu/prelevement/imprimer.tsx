"use client";

export function Imprimer() {
  return (
    <button onClick={() => window.print()} className="rounded-2xl bg-slate-900 px-4 py-3 font-extrabold text-white">
      🖨 Imprimer
    </button>
  );
}
