import { ApiError, api } from "@/lib/api";
import { getStudentToken } from "@/lib/session";

export async function GET(req: Request) {
  const token = await getStudentToken();
  if (!token) return Response.json({ error: "Not authenticated." }, { status: 401 });

  const subjectId = new URL(req.url).searchParams.get("subject_id");
  if (!subjectId) return Response.json({ error: "subject_id is required." }, { status: 400 });

  try {
    const pdfs = await api.getTheoryPdfs(token, subjectId);
    return Response.json(pdfs);
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 500;
    const message = err instanceof ApiError ? err.message : "Could not fetch reference materials.";
    return Response.json({ error: message }, { status });
  }
}
