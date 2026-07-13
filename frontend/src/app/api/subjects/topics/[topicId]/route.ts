import { ApiError, api } from "@/lib/api";
import { getParentToken } from "@/lib/session";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ topicId: string }> }
) {
  const token = await getParentToken();
  if (!token) return Response.json({ error: "Not authenticated." }, { status: 401 });

  const { topicId } = await params;
  const body = await req.json();
  try {
    const topic = await api.updateTopic(token, topicId, body);
    return Response.json(topic);
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 500;
    const message = err instanceof ApiError ? err.message : "Could not update topic.";
    return Response.json({ error: message }, { status });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ topicId: string }> }
) {
  const token = await getParentToken();
  if (!token) return Response.json({ error: "Not authenticated." }, { status: 401 });

  const { topicId } = await params;
  try {
    await api.deleteTopic(token, topicId);
    return new Response(null, { status: 204 });
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 500;
    const message = err instanceof ApiError ? err.message : "Could not delete topic.";
    return Response.json({ error: message }, { status });
  }
}
