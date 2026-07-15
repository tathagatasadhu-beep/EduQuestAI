import { ApiError, api } from "@/lib/api";
import { getStudentToken } from "@/lib/session";

export async function GET(req: Request) {
  const token = await getStudentToken();
  if (!token) return Response.json({ error: "Not authenticated." }, { status: 401 });

  const questionId = new URL(req.url).searchParams.get("question_id");
  if (!questionId) return Response.json({ error: "question_id is required." }, { status: 400 });

  try {
    const result = await api.revealAnswer(token, questionId);
    return Response.json(result);
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 500;
    const message = err instanceof ApiError ? err.message : "Could not reveal the answer.";
    return Response.json({ error: message }, { status });
  }
}
