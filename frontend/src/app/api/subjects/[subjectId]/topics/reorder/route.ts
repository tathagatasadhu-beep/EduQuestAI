import { ApiError, api } from "@/lib/api";
import { getParentToken } from "@/lib/session";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ subjectId: string }> }
) {
  const token = await getParentToken();
  if (!token) return Response.json({ error: "Not authenticated." }, { status: 401 });

  const { subjectId } = await params;
  const body = await req.json();
  try {
    const topics = await api.reorderTopics(token, subjectId, body);
    return Response.json(topics);
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 500;
    const message = err instanceof ApiError ? err.message : "Could not reorder topics.";
    return Response.json({ error: message }, { status });
  }
}
