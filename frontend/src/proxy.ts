import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  PARENT_COOKIE,
  PARENT_COOKIE_OPTIONS,
  PARENT_REFRESH_COOKIE,
  accessTokenNeedsRefresh,
} from "@/lib/tokens";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

// Keeps a parent logged in past Supabase's ~1 hour access-token lifetime.
// Runs before every parent page and API route: if the access token is expired
// (or about to be) and a refresh token is available, it swaps in a fresh pair
// — both for this request (so the page/handler that runs next already sees the
// new token) and in the browser's cookies. Pages can't set cookies themselves
// (Next.js restriction, see lib/session.ts), which is why this lives here
// rather than in each caller. Without it, an hour into a session every call
// fails with "Invalid or expired token: Signature has expired".
export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/auth")) return NextResponse.next();

  const access = request.cookies.get(PARENT_COOKIE)?.value;
  const refresh = request.cookies.get(PARENT_REFRESH_COOKIE)?.value;
  if (!refresh) return NextResponse.next();
  if (access && !accessTokenNeedsRefresh(access)) return NextResponse.next();

  let res: Response;
  try {
    res = await fetch(`${BACKEND_URL}/api/auth/parent/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refresh }),
      cache: "no-store",
    });
  } catch {
    // Backend unreachable — leave the request alone rather than log the
    // parent out over a transient network problem.
    return NextResponse.next();
  }

  if (res.status === 401) {
    // The refresh token itself is dead (revoked, or expired) — a real
    // re-login is needed. Clearing the cookies lets pages redirect to the
    // login screen instead of showing a raw token error.
    request.cookies.delete(PARENT_COOKIE);
    request.cookies.delete(PARENT_REFRESH_COOKIE);
    const response = NextResponse.next({ request: { headers: request.headers } });
    response.cookies.delete(PARENT_COOKIE);
    response.cookies.delete(PARENT_REFRESH_COOKIE);
    return response;
  }
  if (!res.ok) return NextResponse.next();

  const tokens: { access_token: string; refresh_token: string } = await res.json();
  request.cookies.set(PARENT_COOKIE, tokens.access_token);
  request.cookies.set(PARENT_REFRESH_COOKIE, tokens.refresh_token);
  const response = NextResponse.next({ request: { headers: request.headers } });
  response.cookies.set(PARENT_COOKIE, tokens.access_token, PARENT_COOKIE_OPTIONS);
  response.cookies.set(PARENT_REFRESH_COOKIE, tokens.refresh_token, PARENT_COOKIE_OPTIONS);
  return response;
}

export const config = {
  matcher: ["/parent/:path*", "/api/:path*"],
};
