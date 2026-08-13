import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Optimistic auth gate (Next.js 16 `proxy`, formerly `middleware`).
 * Cheap cookie presence check only — real session verification happens in the
 * (app) layout via `requireUser()`. Redirects anonymous traffic to /login.
 */
export function proxy(request: NextRequest) {
  const sessionCookie = getSessionCookie(request);
  if (!sessionCookie) {
    const url = new URL("/login", request.url);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  /* Tout est protégé sauf : la page de connexion, l'API d'authentification, les
   * fichiers statiques — et `/portail`, le portail de rendement des ouvrières.
   *
   * Ce dernier est public par nécessité : on y arrive en scannant un QR depuis
   * un téléphone personnel, sans compte. Son contrôle d'accès est la clé
   * opaque de l'URL, vérifiée dans la page elle-même. */
  matcher: [
    "/((?!login|portail|api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)",
  ],
};
