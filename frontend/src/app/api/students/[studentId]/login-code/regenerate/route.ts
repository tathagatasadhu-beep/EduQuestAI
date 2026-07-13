import { ApiError, api } from "@/lib/api";
import { getParentToken } from "@/lib/session";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ studentId: string }> }
) {
  const token = await getParentToken();
  if (!token) return Response.json({ error: "Not authenticated." }, { status: 401 });

  const { studentId } = await params;
  try {
    const result = await api.regenerateLoginCode(token, studentId);
    return Response.json(result);
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 500;
    const message = err instanceof ApiError ? err.message : "Could not regenerate login code.";
    return Response.json({ error: message }, { status });
  }
}
