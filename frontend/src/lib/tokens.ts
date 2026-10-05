// Pure helpers shared by lib/session.ts (Route Handlers) and proxy.ts — kept
// free of next/headers so the proxy can import it without pulling in
// request-scoped APIs it can't use.

export const PARENT_COOKIE = "eduquest_parent_token";
export const PARENT_REFRESH_COOKIE = "eduquest_parent_refresh";

// Supabase access tokens expire in ~1 hour, but the cookie that carries one
// must outlive it — otherwise the proxy would see no token at all instead of
// an expired one it can swap for a fresh token using the refresh cookie.
export const PARENT_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export const PARENT_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: PARENT_COOKIE_MAX_AGE,
};

const REFRESH_SKEW_MS = 60_000;

// Reads `exp` from a JWT without verifying it — the backend does the real
// verification on every call; this only decides whether to refresh early.
// A token we can't parse is treated as needing a refresh.
export function accessTokenNeedsRefresh(token: string, now = Date.now()): boolean {
  try {
    const payload = token.split(".")[1];
    if (!payload) return true;
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const exp = JSON.parse(json).exp;
    if (typeof exp !== "number") return true;
    return exp * 1000 - now < REFRESH_SKEW_MS;
  } catch {
    return true;
  }
}
