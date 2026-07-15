import { ApiError, api } from "@/lib/api";
import type { QuestionFilter } from "@/lib/api";
import { getStudentToken } from "@/lib/session";

export async function GET(req: Request) {
  const token = await getStudentToken();
  if (!token) return Response.json({ error: "Not authenticated." }, { status: 401 });

  const url = new URL(req.url);
  const topicId = url.searchParams.get("topic_id");
  if (!topicId) return Response.json({ error: "topic_id is required." }, { status: 400 });
  const filter = (url.searchParams.get("filter") || "all") as QuestionFilter;

  try {
    const questions = await api.listQuestions(token, topicId, filter);
    return Response.json(questions);
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 500;
    const message = err instanceof ApiError ? err.message : "Could not fetch questions.";
    return Response.json({ error: message }, { status });
  }
}
