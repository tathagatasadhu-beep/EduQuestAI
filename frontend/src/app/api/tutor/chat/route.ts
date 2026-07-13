import { ApiError, api } from "@/lib/api";
import { getStudentToken } from "@/lib/session";

// The tutor call can involve a live web-search tool round-trip on the backend —
// give it more room than Vercel's default function timeout.
export const maxDuration = 60;

export async function POST(req: Request) {
  const token = await getStudentToken();
  if (!token) return Response.json({ error: "Not authenticated." }, { status: 401 });

  const body = await req.json();
  try {
    const result = await api.tutorChat(token, body);
    return Response.json(result);
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 500;
    const message = err instanceof ApiError ? err.message : "The tutor couldn't respond right now.";
    return Response.json({ error: message }, { status });
  }
}
