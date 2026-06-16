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
  // Protect everything except the login page, the auth API, and static assets.
  matcher: ["/((?!login|api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)"],
};
