"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Factory, ArrowRight, Loader2 } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@dbs.local");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error } = await authClient.signIn.email({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message || "Identifiants invalides");
      return;
    }
    router.push("/cockpit");
    router.refresh();
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-[#0f172a] via-[#1e3a8a] to-[#1d4ed8] p-5">
      <div className="pointer-events-none absolute -right-36 -top-48 size-[600px] rounded-full bg-[radial-gradient(circle,rgba(59,130,246,0.25),transparent_70%)]" />
      <div className="pointer-events-none absolute -bottom-44 -left-28 size-[500px] rounded-full bg-[radial-gradient(circle,rgba(124,58,237,0.2),transparent_70%)]" />

      <div className="relative z-10 w-[400px] max-w-[92vw] rounded-2xl bg-white/95 p-10 shadow-2xl backdrop-blur">
        <div className="flex items-center gap-3">
          <span className="flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-purple text-white shadow-lg">
            <Factory className="size-6" />
          </span>
          <span className="text-2xl font-extrabold tracking-tight text-foreground">
            Pilot<span className="text-brand">Pro</span>
          </span>
        </div>
        <p className="mb-7 mt-1 pl-[60px] text-xs text-muted-foreground">GPAO · Confection Textile</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label className="text-[11px] font-semibold uppercase tracking-wide text-secondary-foreground">
              Email
            </Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              className="h-11"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-[11px] font-semibold uppercase tracking-wide text-secondary-foreground">
              Mot de passe
            </Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="h-11"
              required
            />
          </div>
          {error && <p className="text-xs font-semibold text-[var(--danger-d)]">{error}</p>}
          <Button type="submit" size="lg" disabled={loading} className="mt-1 h-11 w-full font-bold">
            {loading ? <Loader2 className="size-4 animate-spin" /> : <>Se connecter <ArrowRight className="size-4" /></>}
          </Button>
        </form>

        <div className="mt-6 border-t pt-4 text-[11px] leading-relaxed text-muted-foreground/80">
          <b className="text-muted-foreground">Comptes de démonstration :</b>
          <br />
          admin@dbs.local / admin123 · resp@dbs.local / resp123 · dbs@dbs.local / dbs123
        </div>
      </div>
    </div>
  );
}
