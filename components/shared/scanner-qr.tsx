"use client";

import { useEffect, useRef, useState } from "react";

/* Lecture d'un QR au magasin, trois façons, un seul point d'entrée :
 *   - la CAMÉRA du téléphone (détecteur natif du navigateur, sinon jsQR) ;
 *   - une DOUCHETTE USB / Bluetooth, qui « tape » le code puis Entrée dans le
 *     champ (il garde le focus) ;
 *   - la SAISIE à la main du code imprimé sous le QR.
 * `onCode` reçoit le texte brut ; c'est l'appelant qui l'interprète. */

type Detecteur = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };

export function ScannerQr({
  onCode,
  placeholder = "Scanner ou taper R-2026-000145",
  autoCamera = false,
  occupe = false,
}: {
  onCode: (brut: string) => void;
  placeholder?: string;
  autoCamera?: boolean;
  occupe?: boolean;
}) {
  const [saisie, setSaisie] = useState("");
  const [camera, setCamera] = useState(autoCamera);
  const [erreur, setErreur] = useState<string | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const champ = useRef<HTMLInputElement>(null);
  const dernier = useRef<{ code: string; t: number }>({ code: "", t: 0 });
  const rappel = useRef(onCode);
  useEffect(() => {
    rappel.current = onCode;
  }, [onCode]);

  useEffect(() => {
    if (!camera) return;
    let arret = false;
    let flux: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    (async () => {
      try {
        flux = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      } catch {
        setErreur("Caméra indisponible (autorisez-la, ou utilisez la douchette / la saisie).");
        setCamera(false);
        return;
      }
      if (arret || !video.current) return;
      video.current.srcObject = flux;
      await video.current.play().catch(() => {});

      const Natif = (globalThis as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detecteur }).BarcodeDetector;
      const natif = Natif ? new Natif({ formats: ["qr_code"] }) : null;
      const jsQR = natif ? null : (await import("jsqr")).default;

      const tour = async () => {
        if (arret || !video.current || !ctx) return;
        const v = video.current;
        if (v.readyState >= 2 && v.videoWidth) {
          let texte: string | null = null;
          if (natif) {
            const r = await natif.detect(v).catch(() => []);
            texte = r[0]?.rawValue ?? null;
          } else if (jsQR) {
            const l = Math.min(640, v.videoWidth);
            const h = Math.round((v.videoHeight / v.videoWidth) * l);
            canvas.width = l;
            canvas.height = h;
            ctx.drawImage(v, 0, 0, l, h);
            const img = ctx.getImageData(0, 0, l, h);
            texte = jsQR(img.data, l, h, { inversionAttempts: "dontInvert" })?.data ?? null;
          }
          const now = Date.now();
          // Le même QR reste devant l'objectif : on ne le relit pas en boucle.
          if (texte && (texte !== dernier.current.code || now - dernier.current.t > 2500)) {
            dernier.current = { code: texte, t: now };
            navigator.vibrate?.(60);
            rappel.current(texte);
          }
        }
        timer = setTimeout(tour, 180);
      };
      tour();
    })();

    return () => {
      arret = true;
      if (timer) clearTimeout(timer);
      flux?.getTracks().forEach((t) => t.stop());
    };
  }, [camera]);

  const valider = () => {
    const t = saisie.trim();
    if (!t) return;
    setSaisie("");
    rappel.current(t);
    champ.current?.focus();
  };

  return (
    <div className="space-y-2">
      {camera && (
        <div className="relative overflow-hidden rounded-2xl bg-black">
          <video ref={video} playsInline muted className="aspect-[4/3] w-full object-cover" />
          <div className="pointer-events-none absolute inset-[18%] rounded-xl border-4 border-white/80" />
          {occupe && <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-lg font-bold text-white">…</div>}
        </div>
      )}
      <div className="flex gap-2">
        <input
          ref={champ}
          autoFocus={!autoCamera}
          value={saisie}
          onChange={(e) => setSaisie(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              valider();
            }
          }}
          placeholder={placeholder}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          className="min-w-0 flex-1 rounded-2xl border border-slate-300 bg-white px-4 py-3 font-mono text-lg"
        />
        <button type="button" onClick={valider} className="rounded-2xl bg-slate-900 px-4 font-bold text-white">
          OK
        </button>
      </div>
      <button
        type="button"
        onClick={() => {
          setErreur(null);
          setCamera((c) => !c);
        }}
        className={`w-full rounded-2xl py-3 text-base font-bold ${camera ? "bg-slate-200 text-slate-800" : "bg-emerald-600 text-white"}`}
      >
        {camera ? "Arrêter la caméra" : "📷 Scanner avec la caméra"}
      </button>
      {erreur && <div className="rounded-xl bg-amber-100 px-3 py-2 text-sm text-amber-900">{erreur}</div>}
    </div>
  );
}
