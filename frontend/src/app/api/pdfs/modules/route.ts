import { ApiError, api } from "@/lib/api";
import { getStudentToken } from "@/lib/session";

export async function GET(req: Request) {
  const token = await getStudentToken();
  if (!token) return Response.json({ error: "Not authenticated." }, { status: 401 });

  const topicId = new URL(req.url).searchParams.get("topic_id");
  if (!topicId) return Response.json({ error: "topic_id is required." }, { status: 400 });

  try {
    const modules = await api.listPdfModules(token, topicId);
    return Response.json(modules);
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 500;
    const message = err instanceof ApiError ? err.message : "Could not fetch chapters/modules.";
    return Response.json({ error: message }, { status });
  }
}
