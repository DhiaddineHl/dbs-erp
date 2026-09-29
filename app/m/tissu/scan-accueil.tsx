"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ScannerQr } from "@/components/shared/scanner-qr";
import { resoudreScan } from "@/lib/actions/rouleaux";

export function ScanAccueil() {
  const router = useRouter();
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  return (
    <div>
      <ScannerQr
        occupe={occupe}
        onCode={async (brut) => {
          setOccupe(true);
          setErreur(null);
          const r = await resoudreScan(brut);
          setOccupe(false);
          if (!r.ok) {
            navigator.vibrate?.([80, 60, 80]);
            return setErreur(r.error);
          }
          router.push(r.url);
        }}
      />
      {erreur && <div className="mt-2 rounded-xl bg-red-100 px-3 py-3 text-base font-semibold text-red-900">✗ {erreur}</div>}
    </div>
  );
}
