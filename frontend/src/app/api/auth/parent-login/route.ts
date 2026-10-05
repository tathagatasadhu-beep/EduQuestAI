import { ApiError, api } from "@/lib/api";
import { setParentTokens } from "@/lib/session";

export async function POST(req: Request) {
  const body = await req.json();
  try {
    const result = await api.parentLogin(body);
    await setParentTokens(result.access_token, result.refresh_token);
    return Response.json({ user: result.user });
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 500;
    const message = err instanceof ApiError ? err.message : "Login failed.";
    return Response.json({ error: message }, { status });
  }
}
