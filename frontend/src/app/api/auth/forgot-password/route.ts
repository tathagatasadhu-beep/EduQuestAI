import { ApiError, api } from "@/lib/api";

export async function POST(req: Request) {
  const { email } = await req.json();
  try {
    const result = await api.forgotPassword(email);
    return Response.json(result);
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 500;
    const message = err instanceof ApiError ? err.message : "Could not send reset email.";
    return Response.json({ error: message }, { status });
  }
}
