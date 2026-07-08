import { ApiError, api } from "@/lib/api";
import { getParentToken } from "@/lib/session";

export async function POST(req: Request) {
  const token = await getParentToken();
  if (!token) return Response.json({ error: "Not authenticated." }, { status: 401 });

  const body = await req.json();
  try {
    const subject = await api.createSubject(token, body);
    return Response.json(subject);
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 500;
    const message = err instanceof ApiError ? err.message : "Could not create subject.";
    return Response.json({ error: message }, { status });
  }
}
