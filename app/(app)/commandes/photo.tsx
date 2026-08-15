"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import * as A from "@/lib/actions/commandes";

/** Côté le plus long de la photo conservée, en pixels.
 *
 * 380 px suffit à reconnaître un article dans une liste, et fait tenir une
 * photo d'atelier en une vingtaine de kilo-octets là où l'original en pèse
 * plusieurs milliers. La réduction se fait dans le navigateur : l'original ne
 * traverse jamais le réseau. */
const COTE_MAX = 380;
const QUALITE = 0.7;

const FORMATS = ["image/jpeg", "image/png", "image/webp"];

/** Réduit une image et la rend en JPEG.
 *
 * Fond blanc posé avant le dessin : un PNG transparent virerait au noir en
 * JPEG, qui n'a pas de couche alpha. */
function reduire(fichier: File): Promise<File> {
  return new Promise((resoudre, rejeter) => {
    const url = URL.createObjectURL(fichier);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width: l, height: h } = img;
      if (l > h) {
        if (l > COTE_MAX) {
          h = Math.round((h * COTE_MAX) / l);
          l = COTE_MAX;
        }
      } else if (h > COTE_MAX) {
        l = Math.round((l * COTE_MAX) / h);
        h = COTE_MAX;
      }

      const toile = document.createElement("canvas");
      toile.width = l;
      toile.height = h;
      const ctx = toile.getContext("2d");
      if (!ctx) return rejeter(new Error("Impossible de préparer l'image"));
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, l, h);
      ctx.drawImage(img, 0, 0, l, h);

      toile.toBlob(
        (blob) => {
          if (!blob) return rejeter(new Error("Impossible de convertir l'image"));
          resoudre(new File([blob], "photo.jpg", { type: "image/jpeg" }));
        },
        "image/jpeg",
        QUALITE,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      rejeter(new Error("Image illisible"));
    };
    img.src = url;
  });
}

/** B7 · photo du modèle, sur la ligne de commande.
 *
 * L'atelier reconnaît un article d'un coup d'œil, ce qu'aucune référence ne
 * permet. La vignette ouvre la photo en grand ; le bouton d'envoi apparaît
 * quand il n'y en a pas encore. */
export function PhotoCommande({
  commandeId,
  titre,
  hash,
  archivee,
}: {
  commandeId: number;
  titre: string;
  hash: string | null;
  archivee: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [agrandie, setAgrandie] = useState(false);
  const champ = useRef<HTMLInputElement>(null);

  const choisir = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    // Le champ est remis à zéro tout de suite : renvoyer le même fichier après
    // une erreur ne déclencherait sinon aucun événement.
    e.target.value = "";
    if (!f) return;
    if (!FORMATS.includes(f.type)) {
      toast.error("Format non accepté — JPEG, PNG ou WebP");
      return;
    }

    start(async () => {
      let reduite: File;
      try {
        reduite = await reduire(f);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Image illisible");
        return;
      }
      const fd = new FormData();
      fd.set("commandeId", String(commandeId));
      fd.set("photo", reduite);
      const r = await A.televerserPhotoCommande(fd);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Photo enregistrée");
      router.refresh();
    });
  };

  const retirer = () =>
    start(async () => {
      const r = await A.retirerPhotoCommande(commandeId);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Photo retirée");
      setAgrandie(false);
      router.refresh();
    });

  return (
    <>
      <input
        ref={champ}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={choisir}
      />

      {hash ? (
        <button
          type="button"
          className="align-middle"
          title="Voir la photo du modèle"
          onClick={() => setAgrandie(true)}
        >
          {/* Vignette servie par /api/fichier : adressée par le contenu, donc
              immuable et mise en cache une fois pour toutes. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/fichier/${hash}`}
            alt={`Photo — ${titre}`}
            className="size-7 rounded border border-input object-cover"
            loading="lazy"
          />
        </button>
      ) : archivee ? (
        <span className="text-[10px] text-muted-foreground" title="Commande archivée">
          —
        </span>
      ) : (
        <button
          type="button"
          className="rounded border border-dashed border-input px-1 py-0.5 text-[10px] hover:bg-muted disabled:opacity-50"
          title="Ajouter une photo du modèle"
          disabled={pending}
          onClick={() => champ.current?.click()}
        >
          {pending ? "…" : "📷"}
        </button>
      )}

      {agrandie && hash && (
        <Dialog open onOpenChange={(o) => !o && setAgrandie(false)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>📷 {titre}</DialogTitle>
            </DialogHeader>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/fichier/${hash}`}
              alt={`Photo — ${titre}`}
              className="mx-auto max-h-[60vh] rounded-lg border border-input object-contain"
            />
            <p className="text-[11px] text-muted-foreground">
              Réduite à {COTE_MAX} px sur son plus grand côté avant l&apos;envoi. Elle sera retirée
              automatiquement quand la commande sera livrée ou archivée.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAgrandie(false)}>
                Fermer
              </Button>
              <Button variant="outline" disabled={pending} onClick={() => champ.current?.click()}>
                Remplacer
              </Button>
              <Button
                variant="outline"
                className="border-[var(--danger)] text-[var(--danger-d)]"
                disabled={pending}
                onClick={retirer}
              >
                Retirer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
