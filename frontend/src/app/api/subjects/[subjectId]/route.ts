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
    const subject = await api.updateSubject(token, subjectId, body);
    return Response.json(subject);
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 500;
    const message = err instanceof ApiError ? err.message : "Could not update subject.";
    return Response.json({ error: message }, { status });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ subjectId: string }> }
) {
  const token = await getParentToken();
  if (!token) return Response.json({ error: "Not authenticated." }, { status: 401 });

  const { subjectId } = await params;
  try {
    await api.deleteSubject(token, subjectId);
    return new Response(null, { status: 204 });
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 500;
    const message = err instanceof ApiError ? err.message : "Could not delete subject.";
    return Response.json({ error: message }, { status });
  }
}
