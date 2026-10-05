import { setParentTokens } from "@/lib/session";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

export async function POST(req: Request) {
  const body = await req.json();
  const res = await fetch(`${BACKEND_URL}/api/auth/parent/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));

  if (res.status === 202) {
    // Email confirmation required — signup succeeded but there's no session yet.
    return Response.json({ pendingConfirmation: true, message: data.detail });
  }
  if (!res.ok) {
    return Response.json({ error: data.detail || "Signup failed." }, { status: res.status });
  }

  await setParentTokens(data.access_token, data.refresh_token);
  return Response.json({ user: data.user });
}
