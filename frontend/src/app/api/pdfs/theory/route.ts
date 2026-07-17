import { ApiError, api } from "@/lib/api";
import { getStudentToken } from "@/lib/session";

export async function GET(req: Request) {
  const token = await getStudentToken();
  if (!token) return Response.json({ error: "Not authenticated." }, { status: 401 });

  const params = new URL(req.url).searchParams;
  const subjectId = params.get("subject_id");
  const topicId = params.get("topic_id");
  if (!!subjectId === !!topicId) {
    return Response.json({ error: "Provide exactly one of subject_id or topic_id." }, { status: 400 });
  }

  try {
    const pdfs = await api.getTheoryPdfs(token, topicId ? { topicId } : { subjectId: subjectId! });
    return Response.json(pdfs);
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 500;
    const message = err instanceof ApiError ? err.message : "Could not fetch reference materials.";
    return Response.json({ error: message }, { status });
  }
}
