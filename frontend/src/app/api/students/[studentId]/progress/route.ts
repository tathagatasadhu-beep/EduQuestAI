import { ApiError, api } from "@/lib/api";
import { getParentToken } from "@/lib/session";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ studentId: string }> }
) {
  const token = await getParentToken();
  if (!token) return Response.json({ error: "Not authenticated." }, { status: 401 });

  const { studentId } = await params;
  const url = new URL(req.url);
  const active_from = url.searchParams.get("active_from");
  const active_until = url.searchParams.get("active_until");
  if (!active_from || !active_until) {
    return Response.json({ error: "active_from and active_until are required." }, { status: 400 });
  }

  try {
    const progress = await api.getProgress(token, studentId, { active_from, active_until });
    return Response.json(progress);
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 500;
    const message = err instanceof ApiError ? err.message : "Could not fetch progress.";
    return Response.json({ error: message }, { status });
  }
}
